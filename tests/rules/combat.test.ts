import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardInstance, Character } from "../../src/shared/model.ts";
import { loadContent } from "../../src/server/content/load.ts";
import {
  combatBeats,
  effectText,
  impactFor,
  beatTiming,
} from "../../src/client/combat-feedback.ts";
import type { CombatView } from "../../src/shared/model.ts";
import { createSession, makeHero } from "../../src/domain/session.ts";
import {
  beginTurn,
  createCombat,
  enemyPhase,
  playCard,
  preview,
  recoveryPlay,
} from "../../src/domain/combat.ts";
const content = await loadContent();
test("played-card feedback preserves actual cost, upgrades, absorption and grouped hits", () => {
  const b = fixture(2);
  hand(b, "p0", ["strike"]);
  b.actors.p0!.hand[0]!.upgraded = true;
  b.actors.p0!.hand[0]!.costDelta = -1;
  b.enemies[0]!.block = 4;
  playCard(b, "p0", "p0-0", "main", undefined, content);
  assert.deepEqual(b.log[0]!.card, {
    id: "strike",
    upgraded: true,
    cost: 0,
    text: content.cards.find((c) => c.id === "strike")!.upgrade.text,
  });
  assert.equal(b.log[1]!.blocked, 4);
  const after = {
    id: b.id,
    log: b.log,
    enemies: b.enemies,
    intents: b.intents,
    actors: Object.values(b.actors),
  } as unknown as CombatView;
  const before = { ...after, log: [] };
  const beats = combatBeats(before, after, 0);
  assert.equal(beats.length, 1);
  assert.match(impactFor(beats[0]!, "main").label, /blocked/);
  assert.match(effectText(b.log[1]!), /4 blocked/);
  assert.deepEqual(combatBeats(before, after, b.eventSequence), []);
  const cursor = b.eventSequence;
  b.actors.p0!.block = 4;
  enemyPhase(b, 0, content);
  const enemyBeats = combatBeats(after, { ...after, log: b.log }, cursor);
  assert.equal(enemyBeats.length, 1, "sweep is one beat for all targets");
  assert.match(impactFor(enemyBeats[0]!, "p0").label, /−2 HP · 4 blocked/);
  assert.match(impactFor(enemyBeats[0]!, "p1").label, /−6 HP/);
});
test("batched enemy attacks preserve per-action health and Block checkpoints", () => {
  const b = fixture(2);
  b.actors.p0!.block = 4;
  b.enemies.push({ ...b.enemies[0]!, id: "second" });
  b.intents.push({ ...b.intents[0]!, enemyId: "second" });
  const view = () =>
    structuredClone({
      ...b,
      actors: Object.values(b.actors),
    }) as unknown as CombatView;
  const before = view();
  enemyPhase(b, 0, content);
  const after = view();
  assert.equal(b.deadline, 5000, "two enemies have two presentation windows");
  const beats = combatBeats(before, after, 0);
  assert.equal(beats.length, 2);
  const p0 = (v: CombatView) => v.actors.find((a) => a.memberId === "p0")!;
  assert.deepEqual(
    beats.map((beat) => [p0(beat.before).hp, p0(beat.after).hp]),
    [
      [40, 38],
      [38, 32],
    ],
  );
  assert.equal(p0(beats[0]!.before).block, 4);
  assert.equal(p0(beats[0]!.after).block, 0);
  assert.equal(
    p0(before).hp,
    40,
    "presentation never mutates received snapshots",
  );
  assert.equal(p0(after).hp, 32);
  for (const reduced of [false, true]) {
    assert(
      beatTiming(20, reduced).card >= 800,
      "bursts keep a readable card hold even with reduced motion",
    );
    assert(
      beatTiming(0, reduced).windup > 0,
      "lead-in remains visible without animation",
    );
    assert(
      beatTiming(20, reduced).impact > 0,
      "busy fights retain readable outcomes",
    );
  }
});
function fixture(size = 4) {
  const session = createSession("test", "TEST01", 42, content);
  const chars: Character[] = ["guardian", "rogue", "alchemist", "channeler"];
  return createCombat(
    "fight",
    "route",
    Array.from({ length: size }, (_, i) => ({
      hero: makeHero(`p${i}`, chars[i % 4]!, session),
      crewId: "blue",
    })),
    1000,
    "raider",
    42,
    0,
    content,
  );
}
function hand(b: ReturnType<typeof fixture>, id: string, cards: string[]) {
  b.actors[id]!.hand = cards.map((cardId, i) => ({
    uid: `${id}-${i}`,
    cardId,
    upgraded: false,
  }));
  b.actors[id]!.energy = 20;
}
test("crew sizes 1–4 have personal decks, deterministic draws and conserved damage pressure", () => {
  for (let n = 1; n <= 4; n++) {
    const a = fixture(n),
      b = fixture(n);
    assert.equal(Object.keys(a.actors).length, n);
    assert.deepEqual(a.actors, b.actors);
    assert.equal(
      a.intents[0]!.targets.reduce((s, t) => s + t.damage, 0),
      6 * n,
    );
  }
});
test("Block -> Shield Strike and teammate Relay repeat use current state, with attribution", () => {
  const b = fixture();
  hand(b, "p0", ["brace", "shield-strike"]);
  playCard(b, "p0", "p0-0", undefined, undefined, content);
  const hp = b.enemies[0]!.hp;
  playCard(b, "p0", "p0-1", "main", undefined, content);
  assert.equal(hp - b.enemies[0]!.hp, 7);
  assert.equal(b.actors.p0!.block, 7);
  hand(b, "p3", ["relay"]);
  playCard(b, "p3", "p3-0", "main", undefined, content);
  hand(b, "p1", ["strike"]);
  const before = b.enemies[0]!.hp;
  playCard(b, "p1", "p1-0", "main", undefined, content);
  assert.equal(before - b.enemies[0]!.hp, 12);
  assert(b.log.some((e) => e.kind === "combo" && e.sourceId === "p3"));
  assert.deepEqual(b.contributions.p3!.helped, ["p1"]);
});
test("exhaust engine, discard energy, generated lifetime and preview do not change persistent decks", () => {
  const b = fixture();
  hand(b, "p2", ["clean-burn", "renewal", "burn-scrap", "guard"]);
  playCard(b, "p2", "p2-0", undefined, undefined, content);
  playCard(b, "p2", "p2-1", undefined, undefined, content);
  const original = structuredClone(b);
  assert.match(
    preview(b, "p2", "p2-2", undefined, "p2-3", content).message,
    /Block/,
  );
  assert.deepEqual(b, original);
  playCard(b, "p2", "p2-2", undefined, "p2-3", content);
  assert.equal(b.actors.p2!.block, 9);
  assert(b.actors.p2!.hand.length >= 1);
  const retained = fixture();
  retained.actors.p0!.hand = [
    { uid: "kept", cardId: "set-piece", upgraded: false },
  ];
  retained.actors.p0!.powers["retain:kept"] = 1;
  beginTurn(retained, 1000, content);
  assert.equal(retained.actors.p0!.hand.length, 6);
  assert.equal(retained.actors.p0!.hand[0]!.uid, "kept");
  hand(b, "p1", ["feint", "hidden-charge"]);
  const energy = b.actors.p1!.energy;
  playCard(b, "p1", "p1-0", undefined, "p1-1", content);
  assert.equal(b.actors.p1!.energy, energy + 1);
  hand(b, "p1", ["knifework"]);
  playCard(b, "p1", "p1-0", undefined, undefined, content);
  const spark = b.actors.p1!.hand.find((c) => c.cardId === "spark")!;
  assert(spark.generated);
  playCard(b, "p1", spark.uid, "main", undefined, content);
  assert(b.actors.p1!.exhaust.some((c) => c.uid === spark.uid));
});
test("illegal spending/target/copy rejected; recovery cannot create a free attacking turn", () => {
  const b = fixture();
  hand(b, "p0", ["brace"]);
  const unchanged = structuredClone(b);
  assert.throws(
    () => playCard(b, "p0", "p0-0", "p1", undefined, content),
    /only you/,
  );
  assert.deepEqual(b, unchanged);
  hand(b, "p0", ["blood-spark"]);
  b.actors.p0!.hp = 3;
  assert.throws(
    () => playCard(b, "p0", "p0-0", undefined, undefined, content),
    /health/,
  );
  hand(b, "p3", ["second-voice", "second-voice"]);
  assert.throws(
    () => playCard(b, "p3", "p3-0", undefined, "p3-1", content),
    /original Attack/,
  );
  b.actors.p0!.hp = 0;
  b.actors.p0!.recovery = true;
  b.actors.p0!.energy = 3;
  recoveryPlay(b, "p0", "rally");
  assert.equal(b.actors.p0!.hp, 12);
  assert(b.actors.p0!.ended);
  assert.throws(() => playCard(b, "p0", "p0-0", undefined, undefined, content));
  beginTurn(b, 1000, content);
  assert.equal(b.actors.p0!.recovery, false);
  const fallen = makeHero(
    "fallen",
    "guardian",
    createSession("s", "ABCDEF", 42, content),
  );
  fallen.hp = 0;
  const allDown = createCombat(
    "all-down",
    "boss",
    [{ hero: fallen, crewId: "blue" }],
    75,
    "middle",
    42,
    0,
    content,
  );
  assert.equal(allDown.result, "defeat");
});
test("every card and upgrade has an executable legal path without runaway resolution", () => {
  for (const def of content.cards.filter((c) => c.rarity !== "token"))
    for (const upgraded of [false, true]) {
      const b = fixture();
      const a = b.actors.p0!;
      a.hp = 40;
      a.block = 8;
      a.powers.charge = 6;
      a.energy = 100;
      a.hand = [
        { uid: "subject", cardId: def.id, upgraded },
        { uid: "choice", cardId: "strike", upgraded: false },
      ];
      a.discard = [{ uid: "discard", cardId: "guard", upgraded: false }];
      b.enemies[0]!.poison = 4;
      const target =
        def.target === "enemy"
          ? "main"
          : ["ally", "any-hero"].includes(def.target)
            ? "p1"
            : undefined;
      const choice =
        def.target === "discard"
          ? "discard"
          : def.target === "hand" || def.choose
            ? "choice"
            : undefined;
      playCard(b, "p0", "subject", target, choice, content);
      assert(a.hand.length <= 10);
      assert(Number.isFinite(a.energy));
      assert(b.log.length < 100, def.id);
      assert(b.enemies.every((e) => e.hp >= 0));
    }
});
test("enemy attacks visibly consume source Block; health budgets require more than basic volleys", () => {
  const b = fixture();
  hand(b, "p0", ["cover"]);
  playCard(b, "p0", "p0-0", "p1", undefined, content);
  enemyPhase(b, 0, content);
  assert.equal(b.actors.p1!.hp, 40);
  assert.equal(b.contributions.p0!.protection, 6);
  assert(
    b.log.some((e) => e.kind === "enemy-hit" && e.text.includes("blocked")),
  );
  const plain = createCombat(
    "normal",
    "route",
    [
      {
        hero: {
          gold: 50,
          relics: [],
          deckRevision: 0,
          removalCount: 0,
          memberId: "p",
          character: "guardian",
          hp: 40,
          maxHp: 40,
          deck: [] as CardInstance[],
        },
        crewId: "blue",
      },
    ],
    32,
    "raider",
    42,
    0,
    content,
  );
  hand(plain, "p", ["strike", "strike", "strike"]);
  for (let i = 0; i < 3; i++)
    playCard(plain, "p", `p-${i}`, "main", undefined, content);
  assert.equal(plain.enemies[0]!.hp, 14);
  const elite = createCombat(
    "elite",
    "route",
    [
      {
        hero: makeHero(
          "p0",
          "guardian",
          createSession("s", "ABCDEF", 42, content),
        ),
        crewId: "blue",
      },
    ],
    50,
    "elite",
    42,
    0,
    content,
  );
  beginTurn(elite, 0, content);
  enemyPhase(elite, 0, content);
  beginTurn(elite, 0, content);
  assert.equal(elite.enemies[0]!.block, 6);
  hand(elite, "p0", ["strike"]);
  const beforeBlock = elite.enemies[0]!.hp;
  playCard(elite, "p0", "p0-0", "main", undefined, content);
  assert.equal(elite.enemies[0]!.hp, beforeBlock);
  assert.equal(elite.enemies[0]!.block, 0);
});
