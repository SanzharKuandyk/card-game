import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Application } from "../../src/server/application.ts";
import { loadContent } from "../../src/server/content/load.ts";
import type { Command, Envelope } from "../../src/shared/model.ts";
test("saved boss reveal, private predictions, takeover, stale action and storage failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cards-integrity-"));
  const content = await loadContent();
  let app = new Application(content, join(dir, "db.sqlite"));
  await app.initialise();
  const { session } = await app.create();
  const p = await app.join(session.code, "Player");
  app.connect("host", session.id, { role: "host" });
  app.connect("player", session.id, { role: "player", memberId: p.memberId });
  const command = (
    who: string,
    cmd: Command,
    requestId = crypto.randomUUID(),
    encounterId = app.view(session.id, { role: "player", memberId: p.memberId })
      .combat?.id ?? null,
  ): Promise<unknown> =>
    app.command(who, {
      requestId,
      sessionId: session.id,
      encounterId,
      command: cmd,
    });
  try {
    await command("player", {
      kind: "team",
      name: "Team",
      character: "guardian",
    });
    await command("host", { kind: "host", action: "start" });
    await command("player", { kind: "travel", nodeId: "r1-0" });
    const beforeBoard = structuredClone(app.sessions.get(session.id));
    app.connect("projector", session.id, { role: "projector" });
    const board = app.view(session.id, { role: "projector" }).crews[0]!.board!;
    assert.equal(board.actors.length, 1);
    assert.equal(board.actors[0]!.hand.length, 5);
    assert.equal(
      app.view(session.id, { role: "player", memberId: p.memberId }).crews[0]!
        .board,
      undefined,
    );
    assert.equal(
      app.view(session.id, { role: "projector" }).combat!.hand.length,
      0,
    );
    assert.deepEqual(app.context(session.id).presence.online, [p.memberId]);
    assert.deepEqual(app.sessions.get(session.id), beforeBoard);
    const denied = (await command("projector", {
      kind: "end-turn",
      ended: true,
    })) as { accepted: boolean; message: string };
    assert.equal(denied.accepted, false);
    assert.match(denied.message, /Read-only/i);
    app.disconnect("projector");
    app.connect(
      "phone-a",
      session.id,
      { role: "player", memberId: p.memberId },
      "phone-document",
    );
    assert.equal(app.controller("phone-a"), false); // Original player owns it.
    app.disconnect("player");
    app.disconnect("phone-a");
    app.connect(
      "phone-a",
      session.id,
      { role: "player", memberId: p.memberId },
      "phone-document",
    );
    app.connect(
      "phone-resumed",
      session.id,
      { role: "player", memberId: p.memberId },
      "phone-document",
    );
    assert.equal(app.controller("phone-resumed"), true);
    assert.equal(app.controller("phone-a"), false);
    app.connect(
      "other-phone-tab",
      session.id,
      { role: "player", memberId: p.memberId },
      "other-document",
    );
    assert.equal(app.controller("other-phone-tab"), false);
    await command("other-phone-tab", { kind: "takeover" });
    app.connect(
      "old-phone-waking",
      session.id,
      { role: "player", memberId: p.memberId },
      "phone-document",
    );
    assert.equal(app.controller("old-phone-waking"), false);
    assert.equal(app.controller("other-phone-tab"), true);
    app.disconnect("old-phone-waking");
    app.disconnect("other-phone-tab");
    app.disconnect("phone-a");
    app.disconnect("phone-resumed");
    app.connect("player", session.id, { role: "player", memberId: p.memberId });
    const actor = app.sessions.get(session.id)!.crews["team-1"]!.progress
      .combat!.actors[p.memberId]!;
    const stale = (await command("player", {
      kind: "play",
      cardUid: actor.hand[0]!.uid,
      handRevision: 999,
      targetId: "main",
    })) as { accepted: boolean };
    assert.equal(stale.accepted, false);
    app.connect("second", session.id, { role: "player", memberId: p.memberId });
    await assert.rejects(
      command("second", { kind: "end-turn", ended: true }),
      /read-only/,
    );
    await command("second", { kind: "takeover" });
    await assert.rejects(
      command("player", { kind: "end-turn", ended: true }),
      /read-only/,
    );
    app.disconnect("player");
    const frozenName = app.sessions.get(session.id)!.content.cards[0]!.name;
    content.cards[0]!.name = "Changed outside session";
    assert.equal(
      app.view(session.id, { role: "player", memberId: p.memberId }).cards[0]!
        .name,
      frozenName,
    );
    await command("host", { kind: "host", action: "boss", gate: 8 });
    assert.equal(app.view(session.id, { role: "projector" }).combat, null);
    await app.advance(8001);
    await app.advance(6001);
    const q = app.sessions.get(session.id)!.bosses[0]!.quiz;
    const quizEnv: Envelope = {
      requestId: "quiz-once",
      sessionId: session.id,
      encounterId: null,
      command: {
        kind: "quiz:answer",
        quizId: q.id,
        questionId: q.rounds[0]!.questionId,
        phaseRevision: q.phaseRevision,
        optionId: "a",
      },
    };
    const quizReceipt = await app.command("second", quizEnv);
    assert(quizReceipt.accepted);
    assert.deepEqual(await app.command("second", quizEnv), quizReceipt);
    assert.equal(
      app.view(session.id, { role: "projector" }).quiz!.reveal,
      null,
    );
    await app.close();
    app = new Application(await loadContent(), join(dir, "db.sqlite"));
    await app.initialise();
    assert.equal(
      app.sessions.get(session.id)!.bosses[0]!.quiz.rounds[0]!.submissions[
        p.memberId
      ]!.optionId,
      "a",
    );
    app.connect("host", session.id, { role: "host" });
    app.connect("second", session.id, { role: "player", memberId: p.memberId });
    await command("host", { kind: "host", action: "resume" });
    await app.advance(25001);
    assert.equal(
      app.view(session.id, { role: "projector" }).quiz!.stage,
      "reveal",
    );
    const activeQuiz = app.sessions.get(session.id)!.bosses[0]!.quiz;
    await command("host", {
      kind: "host",
      action: "skip",
      scope: "quiz",
      quizId: activeQuiz.id,
      phaseRevision: activeQuiz.phaseRevision,
    });
    await app.advance(1);
    await command("second", { kind: "end-turn", ended: true });
    await app.advance(1);
    assert.equal(
      app.sessions.get(session.id)!.bosses[0]!.combat!.phase,
      "enemy",
    );
    const hand = structuredClone(
      app.sessions.get(session.id)!.bosses[0]!.combat!.actors[p.memberId]!.hand,
    );
    await app.close();
    const archive = new DatabaseSync(join(dir, "db.sqlite"), {
      readOnly: true,
    });
    try {
      const saved = archive
        .prepare(
          "SELECT COUNT(*) AS count FROM combat_events WHERE encounter_id=?",
        )
        .get(`${session.id}:boss:8`);
      assert.equal(
        saved!.count,
        app.sessions.get(session.id)!.bosses[0]!.combat!.eventSequence,
      );
    } finally {
      archive.close();
    }
    app = new Application(await loadContent(), join(dir, "db.sqlite"));
    await app.initialise();
    assert.equal(app.sessions.get(session.id)!.status, "paused");
    assert.equal(
      app.sessions.get(session.id)!.bosses[0]!.combat!.phase,
      "enemy",
    );
    assert.deepEqual(
      app.sessions.get(session.id)!.bosses[0]!.combat!.actors[p.memberId]!.hand,
      hand,
    );
    app.connect("host", session.id, { role: "host" });
    app.connect("second", session.id, { role: "player", memberId: p.memberId });
    await command("host", { kind: "host", action: "resume" });
    await app.advance(8001);
    const projected = app.view(session.id, {
      role: "player",
      memberId: p.memberId,
    });
    assert.equal(projected.combat!.phase, "player");
    assert.equal(projected.quiz, null);
    const deadline = app.sessions.get(session.id)!.bosses[0]!.combat!.deadline;
    const save = app.repository.save.bind(app.repository);
    app.repository.save = async () => {
      throw new Error("Simulated disk failure");
    };
    const failedId = crypto.randomUUID();
    await assert.rejects(
      command("host", { kind: "host", action: "extend" }, failedId),
      /not saved/,
    );
    assert.equal(app.sessions.get(session.id)!.status, "paused");
    assert.equal(
      app.sessions.get(session.id)!.bosses[0]!.combat!.deadline,
      deadline,
    );
    assert.equal(await app.repository.receipt(session.id, failedId), null);
    app.repository.save = save;
    await command("host", { kind: "host", action: "resume" });
    assert.equal(app.storageFailure, null);
    const env: Envelope = {
      requestId: "receipt-once",
      sessionId: session.id,
      encounterId: app.sessions.get(session.id)!.bosses[0]!.combat!.id,
      command: { kind: "end-turn", ended: true },
    };
    const receipt = await app.command("second", env);
    assert.deepEqual(await app.command("second", env), receipt);
    await assert.rejects(
      app.command("second", {
        ...env,
        command: { kind: "end-turn", ended: false },
      }),
      /different action/,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
