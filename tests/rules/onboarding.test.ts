import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
import {
  createSession,
  addMember,
  applyCommand,
  tick,
  triggerBoss,
} from "../../src/domain/session.ts";
import { createCombat, beginTurn } from "../../src/domain/combat.ts";
import { project } from "../../src/server/projections/view.ts";
import {
  chooseLearningHint,
  combinations,
} from "../../src/client/onboarding/hints.ts";
import {
  decodeLearningProgress,
  emptyLearningProgress,
  LearningHintId,
} from "../../src/client/onboarding/model.ts";
import type { LearningContext } from "../../src/client/onboarding/model.ts";
import type {
  Character,
  Command,
  DomainContext,
} from "../../src/shared/model.ts";
const content = await loadContent();

function fixture(character: Character = "guardian", old = false) {
  const frozen = structuredClone(content);
  if (old) delete frozen.timing.openingTurn;
  const s = createSession("learn", "ABCDEF", 42, frozen);
  const ctx: DomainContext = {
    presence: { online: ["p"], hostOnline: true, absentFor: {} },
  };
  addMember(s, "p", "Player");
  const send = (command: Command, host = false) =>
    applyCommand(
      s,
      host ? { role: "host" } : { role: "player", memberId: "p" },
      {
        sessionId: s.id,
        requestId: String(s.revision++),
        encounterId: s.crews["team-1"]?.progress.combat?.id ?? null,
        command,
      },
      ctx,
    );
  send({ kind: "team", character });
  send({ kind: "host", action: "start" }, true);
  send({ kind: "travel", nodeId: "r1-0" });
  return { s, ctx, send, b: s.crews["team-1"]!.progress.combat! };
}

test("opening clocks preserve early end, retry, extension, pause, saved state and old content", () => {
  for (const old of [false, true]) {
    const { s, b, ctx, send } = fixture("guardian", old);
    const duration = old ? 60000 : 90000;
    assert.equal(b.deadline - s.activeMs, duration);
    assert.equal(
      project(s, { role: "player", memberId: "p" }, ctx).combat!.openingRoom,
      !old,
    );
    send({ kind: "end-turn", ended: true });
    tick(s, 1, ctx);
    assert.equal(b.phase, "enemy");
    tick(s, 8001, ctx);
    assert.equal(b.turn, 2);
    assert.equal(b.deadline - s.activeMs, duration);
    tick(s, 3000, ctx);
    send({ kind: "host", action: "extend" }, true);
    const remaining = b.deadline - s.activeMs;
    send({ kind: "host", action: "pause" }, true);
    tick(s, 50000, ctx);
    assert.equal(b.deadline - s.activeMs, remaining);
    const restored = JSON.parse(JSON.stringify(s)) as typeof s;
    assert.equal(
      restored.crews["team-1"]!.progress.combat!.deadline - restored.activeMs,
      remaining,
    );
    send({ kind: "host", action: "resume" }, true);
    triggerBoss(s, 8, null, ctx);
    tick(s, 20000, ctx);
    send({ kind: "host", action: "skip" }, true);
    assert.equal(
      s.crews["team-1"]!.progress.combat!.deadline - s.activeMs,
      remaining,
    );
    const p = s.crews["team-1"]!.progress;
    p.phase = "defeat";
    p.combat!.result = "defeat";
    send({ kind: "retry" });
    assert.equal(p.combat!.deadline - s.activeMs, duration);
    send({ kind: "host", action: "skip" }, true);
    send({ kind: "travel", nodeId: "r2-0" });
    assert.equal(p.combat!.deadline - s.activeMs, 60000);
    assert.equal(p.combat!.openingRoom, false);
  }
  const { s } = fixture();
  const b = createCombat(
    "boss",
    "boss",
    [{ hero: s.members.p!.hero, crewId: "team-1" }],
    75,
    "middle",
    2,
    1000,
    content,
  );
  assert.equal(b.deadline, 61000);
  beginTurn(b, 2000, content);
  assert.equal(b.deadline, 62000);
});

test("teaching suggests available starter combinations and respects real decision priority", () => {
  for (const character of Object.keys(combinations) as Character[]) {
    const { s, b, ctx } = fixture(character);
    const ids = combinations[character].cards;
    b.actors.p!.hand = ids.map((cardId, i) => ({
      cardId,
      uid: `c${i}`,
      upgraded: false,
    }));
    const v = project(s, { role: "player", memberId: "p" }, ctx);
    const input: LearningContext = {
      combat: v.combat!,
      memberId: "p",
      character,
      available: true,
      selected: false,
      hasPlayed: false,
      progress: {
        version: 1,
        hidden: false,
        seen: [
          LearningHintId.Choose,
          LearningHintId.More,
          LearningHintId.Defence,
        ],
      },
    };
    assert.equal(
      chooseLearningHint(input)?.id,
      LearningHintId.Combination,
      character,
    );
    for (const mutate of [
      (c: LearningContext) => {
        c.available = false;
      },
      (c: LearningContext) => {
        c.selected = true;
      },
      (c: LearningContext) => {
        c.progress.hidden = true;
      },
      (c: LearningContext) => {
        c.combat!.openingRoom = false;
      },
      (c: LearningContext) => {
        c.combat!.actors[0]!.recovery = true;
      },
      (c: LearningContext) => {
        c.combat!.actors[0]!.ended = true;
      },
      (c: LearningContext) => {
        c.combat!.phase = "enemy";
      },
    ]) {
      const c = structuredClone(input);
      mutate(c);
      assert.equal(chooseLearningHint(c), null);
    }
    const missing = structuredClone(input);
    missing.combat!.hand.pop();
    assert.notEqual(
      chooseLearningHint(missing)?.id,
      LearningHintId.Combination,
    );
    const broke = structuredClone(input);
    broke.combat!.actors[0]!.energy = 0;
    assert.notEqual(chooseLearningHint(broke)?.id, LearningHintId.Combination);
    if (character === "rogue") {
      const crowded = structuredClone(input);
      while (crowded.combat!.hand.length < 9)
        crowded.combat!.hand.push({
          ...crowded.combat!.hand[0]!,
          uid: `extra${crowded.combat!.hand.length}`,
        });
      assert.notEqual(
        chooseLearningHint(crowded)?.id,
        LearningHintId.Combination,
      );
    }
    input.progress = emptyLearningProgress();
    assert.equal(chooseLearningHint(input)?.id, LearningHintId.Choose);
    input.hasPlayed = true;
    assert.equal(chooseLearningHint(input)?.id, LearningHintId.More);
  }
});

test("teaching preferences safely decode unavailable or invalid local data", () => {
  for (const value of [
    null,
    "broken",
    "null",
    "{}",
    '{"version":2,"hidden":true,"seen":[]}',
    '{"version":1,"hidden":true,"seen":["fake"]}',
  ])
    assert.deepEqual(decodeLearningProgress(value), emptyLearningProgress());
  assert.deepEqual(
    decodeLearningProgress(
      '{"version":1,"hidden":true,"seen":["choose","choose"]}',
    ),
    {
      version: 1,
      hidden: true,
      seen: [LearningHintId.Choose],
    },
  );
});
