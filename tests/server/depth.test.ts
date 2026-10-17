import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../../src/server/main.ts";
import {
  createCombat,
  beginTurn,
  enemyPhase,
} from "../../src/domain/combat.ts";
import type { Command, Envelope } from "../../src/shared/model.ts";

test("new card, relic use, guard break and frozen meme encounter survive lost ACK and restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cards-depth-"));
  const server = await createServer({ dataDir: dir, automaticTicks: false });
  let id = "",
    memberId: string,
    saved: Envelope | undefined;
  try {
    const created = await server.app.create();
    id = created.session.id;
    const joined = await server.app.join(created.session.code, "Alex");
    memberId = joined.memberId;
    server.app.connect("host", id, { role: "host" });
    server.app.connect("player", id, { role: "player", memberId });
    const send = (who: string, command: Command) =>
      server.app.command(who, {
        requestId: crypto.randomUUID(),
        sessionId: id,
        encounterId: null,
        command,
      });
    assert(
      (
        await send("player", {
          kind: "team",
          name: "Team",
          character: "guardian",
        })
      ).accepted,
    );
    assert((await send("host", { kind: "host", action: "start" })).accepted);
    const s = server.app.sessions.get(id)!;
    const hero = s.members[memberId]!.hero;
    hero.relics = [{ relicId: "empty-flask", acquiredFrom: "fixture" }];
    const p = s.crews["team-1"]!.progress;
    p.nodeId = "r4-0";
    p.row = 4;
    p.phase = "battle";
    p.combat = createCombat(
      "milk",
      "route",
      [{ hero, crewId: "team-1" }],
      100,
      "raider",
      42,
      0,
      s.content,
      { encounterId: "milk-cat" },
    );
    beginTurn(p.combat, 0, s.content);
    enemyPhase(p.combat, 0, s.content);
    beginTurn(p.combat, 0, s.content);
    const actor = p.combat.actors[memberId]!;
    actor.energy = 1;
    actor.hand = [{ uid: "ram", cardId: "ram", upgraded: false }];
    saved = {
      requestId: "ram-once",
      sessionId: id,
      encounterId: "milk",
      command: {
        kind: "play",
        cardUid: "ram",
        targetId: "main",
        handRevision: actor.handRevision,
      },
    };
    const receipt = await server.app.command("player", saved);
    assert(receipt.accepted, receipt.message);
    const after = structuredClone(
      server.app.sessions.get(id)!.crews["team-1"]!.progress.combat!,
    );
    assert.equal(after.intents[0]!.label, "Off balance");
    assert.equal(after.actors[memberId]!.energy, 1);
    assert.equal(
      after.actors[memberId]!.relicState!.turnUses["empty-flask"],
      1,
    );
    assert.deepEqual(await server.app.command("player", saved), receipt);
    assert.deepEqual(
      server.app.sessions.get(id)!.crews["team-1"]!.progress.combat,
      after,
    );
  } finally {
    await server.http.close();
  }
  const restored = await createServer({ dataDir: dir, automaticTicks: false });
  try {
    const s = restored.app.sessions.get(id)!;
    assert.equal(s.status, "paused");
    assert.equal(s.content.cards.length, 122);
    assert.equal(s.content.relics.length, 24);
    const b = s.crews["team-1"]!.progress.combat!;
    assert.equal(b.enemies[0]!.portrait!.id, "milk-cat");
    assert.equal(b.enemies[0]!.tactics!.brokenTurn, 3);
    assert.equal(b.actors[memberId]!.relicState!.turnUses["empty-flask"], 1);
    restored.app.connect("player", id, { role: "player", memberId });
    assert((await restored.app.command("player", saved!)).accepted);
    assert.equal(b.actors[memberId]!.energy, 1);
    await assert.rejects(
      restored.app.command("player", {
        ...saved!,
        command: { kind: "end-turn", ended: true },
      }),
      /different action/,
    );
  } finally {
    await restored.http.close();
    await rm(dir, { recursive: true, force: true });
  }
});
