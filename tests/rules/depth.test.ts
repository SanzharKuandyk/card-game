import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
import {
  createSession,
  makeHero,
  addMember,
  applyCommand,
} from "../../src/domain/session.ts";
import {
  createCombat,
  playCard,
  preview,
  beginTurn,
  enemyPhase,
  makeIntents,
} from "../../src/domain/combat.ts";
import { eligibleRelics } from "../../src/domain/relics.ts";
import { lootPool, buildWeights, rollOffers } from "../../src/domain/loot.ts";
import { grantReward } from "../../src/domain/rewards.ts";
import { seedFrom } from "../../src/domain/random.ts";
import type { Combat, Content, Character } from "../../src/shared/model.ts";
const content = await loadContent();
function fight(
  n = 2,
  pattern = "raider",
  relicIds: string[] = [],
  frozen: Content = content,
) {
  const s = createSession("depth", "ABCDEF", 43, frozen);
  const characters: Character[] = [
    "guardian",
    "rogue",
    "alchemist",
    "channeler",
  ];
  return createCombat(
    "depth",
    ["middle", "final"].includes(pattern) ? "boss" : "route",
    Array.from({ length: n }, (_, i) => {
      const hero = makeHero(`p${i}`, characters[i % 4]!, s);
      hero.relics = relicIds.map((relicId) => ({
        relicId,
        acquiredFrom: "test",
      }));
      return { hero, crewId: "team" };
    }),
    1000,
    pattern,
    43,
    0,
    frozen,
  );
}
function hand(b: Combat, id: string, ids: string[]) {
  b.actors[id]!.hand = ids.map((cardId, i) => ({
    uid: `${id}:${i}`,
    cardId,
    upgraded: false,
  }));
  b.actors[id]!.energy = 20;
}
function play(
  b: Combat,
  id: string,
  card: number,
  target?: string,
  choice?: string,
) {
  playCard(b, id, `${id}:${card}`, target, choice, content);
}
test("repeats snapshot spent resources, stack independently, and retain source attribution", () => {
  const b = fight();
  hand(b, "p0", ["relay"]);
  play(b, "p0", 0, "main");
  b.actors.p1!.powers.echo = 1;
  b.actors.p1!.block = 20;
  hand(b, "p1", ["wall-crash"]);
  const hp = b.enemies[0]!.hp;
  const before = structuredClone(b);
  assert.match(
    preview(b, "p1", "p1:0", "main", undefined, content).message,
    /repeated/,
  );
  assert.deepEqual(b, before);
  play(b, "p1", 0, "main");
  assert.equal(hp - b.enemies[0]!.hp, 120);
  assert.equal(b.actors.p1!.block, 0);
  assert.equal(
    b.log.filter(
      (e) => e.kind === "combo" && /Wall Crash repeated/.test(e.text),
    ).length,
    2,
  );
  assert.deepEqual(b.contributions.p0!.helped, ["p1"]);
  const solo = fight(1);
  hand(solo, "p0", ["relay", "strike"]);
  play(solo, "p0", 0, "main");
  const soloHp = solo.enemies[0]!.hp;
  play(solo, "p0", 1, "main");
  assert.equal(soloHp - solo.enemies[0]!.hp, 12);
});
test("wind-ups and guard breaks expose counterplay for crews of 1–4 without changing frozen power", () => {
  for (const n of [1, 2, 3, 4]) {
    const b = fight(n);
    beginTurn(b, 0, content);
    assert.match(b.intents[0]!.label, /Wind-up/);
    for (const a of Object.values(b.actors)) {
      hand(b, a.memberId, ["strike", "strike"]);
      play(b, a.memberId, 0, "main");
      play(b, a.memberId, 1, "main");
    }
    assert.match(b.intents[0]!.label, /stopped/);
    enemyPhase(b, 0, content);
    beginTurn(b, 0, content);
    assert.equal(b.intents[0]!.label, "Staggered");
    assert.equal(b.intents[0]!.targets.length, 0);
    const guard = fight(n, "elite");
    guard.enemies[1]!.hp = 0;
    beginTurn(guard, 0, content);
    enemyPhase(guard, 0, content);
    beginTurn(guard, 0, content);
    assert.equal(guard.intents[0]!.label, "Body slam");
    for (const a of Object.values(guard.actors)) {
      hand(guard, a.memberId, ["break-open"]);
      play(guard, a.memberId, 0, "main");
    }
    assert.equal(guard.enemies[0]!.block, 0);
    assert.equal(guard.intents[0]!.label, "Off balance");
    assert.equal(
      guard.intents[0]!.targets.reduce((sum, t) => sum + t.damage, 0),
      5 * n,
    );
  }
  const middle = fight(2, "middle"),
    final = fight(2, "final");
  beginTurn(middle, 0, content);
  beginTurn(final, 0, content);
  assert.notEqual(middle.intents[0]!.label, final.intents[0]!.label);
  assert.equal(final.intents[0]!.kind, "guard");
});
test("all new relic hooks are bounded, preview-pure and restore from encounter state", () => {
  const cases = [
    { relic: "red-thread", cards: ["blood-spark"], kind: "block" },
    {
      relic: "pocket-flint",
      cards: ["escape-plan", "strike"],
      choice: "p0:1",
      kind: "generate",
    },
    { relic: "silver-needle", cards: ["spark"], target: "main", kind: "block" },
    {
      relic: "sealed-vial",
      cards: ["toxic-dart"],
      target: "main",
      kind: "status",
    },
    {
      relic: "scrap-furnace",
      cards: ["spark"],
      target: "main",
      kind: "energy",
    },
    { relic: "tuning-fork", cards: ["charge"], kind: "block" },
    {
      relic: "long-memory",
      cards: ["windup"],
      retained: true,
      target: "main",
      kind: "draw",
    },
    {
      relic: "empty-flask",
      cards: ["strike"],
      energy: 1,
      target: "main",
      kind: "energy",
    },
    { relic: "team-ribbon", cards: ["cover"], target: "p1", kind: "block" },
  ];
  for (const c of cases) {
    const b = fight(2, "elite", [c.relic]);
    hand(b, "p0", c.cards);
    if (c.retained) b.actors.p0!.hand[0]!.heldAcrossTurn = true;
    if (c.energy) b.actors.p0!.energy = c.energy;
    const before = structuredClone(b);
    preview(b, "p0", "p0:0", c.target, c.choice, content);
    assert.deepEqual(b, before, c.relic);
    play(b, "p0", 0, c.target, c.choice);
    assert(
      b.log.some(
        (e) => e.relicId === c.relic && e.kind === c.kind && e.amount > 0,
      ),
      c.relic,
    );
    assert.equal(b.actors.p0!.relicState!.turnUses[c.relic], 1);
    const saved = JSON.parse(JSON.stringify(b)) as Combat;
    assert.deepEqual(saved.actors.p0!.relicState, b.actors.p0!.relicState);
  }
  const carry = fight(1, "raider", [
    "shield-spool",
    "spare-page",
    "soft-landing",
  ]);
  carry.actors.p0!.hp = 20;
  carry.actors.p0!.block = 15;
  carry.actors.p0!.blockSources = [{ sourceId: "p0", remaining: 15 }];
  carry.actors.p0!.hand = [];
  carry.actors.p0!.draw.push({
    uid: "extra",
    cardId: "guard",
    upgraded: false,
  });
  beginTurn(carry, 0, content);
  assert.equal(carry.actors.p0!.block, 12, "6 kept plus 6 low-health Block");
  assert.equal(carry.actors.p0!.hand.length, 6);
  assert.equal(
    carry.actors.p0!.blockSources.reduce((sum, s) => sum + s.remaining, 0),
    12,
  );
});
test("new resource engines are finite and team energy gifts have a fixed pool", () => {
  for (const n of [1, 2, 3, 4]) {
    const b = fight(n);
    hand(b, "p0", ["final-chorus"]);
    b.actors.p0!.energy = 3;
    const before = Object.values(b.actors).reduce(
      (sum, a) => sum + a.energy,
      0,
    );
    play(b, "p0", 0);
    const after = Object.values(b.actors).reduce((sum, a) => sum + a.energy, 0);
    assert.equal(after - before, Math.min(4, 2 * n) - 2);
    assert(b.actors.p0!.exhaust.some((c) => c.cardId === "final-chorus"));
  }
  const b = fight();
  hand(b, "p0", ["second-pocket", "clean-cut", "loose-change"]);
  play(b, "p0", 0);
  play(b, "p0", 1, "main", "p0:2");
  assert.equal(b.actors.p0!.counters["discard-energy"], 1);
  assert(b.actors.p0!.exhaust.some((c) => c.cardId === "loose-change"));
  assert(!b.actors.p0!.discard.some((c) => c.cardId === "loose-change"));
  assert.equal(
    b.actors.p0!.energy,
    20,
    "two costs, one discard bonus and one discarded-card energy",
  );
});
test("shared Poison does not multiply each player's common Block without a bound", () => {
  for (const n of [1, 2, 3, 4])
    for (const cardId of ["venom-coat", "toxic-shelter"]) {
      const b = fight(n);
      b.enemies[0]!.poison = 100;
      hand(b, "p0", [cardId]);
      play(b, "p0", 0, cardId === "toxic-shelter" ? "p0" : undefined);
      assert.equal(b.actors.p0!.block, 12);
      b.actors.p0!.block = 0;
      hand(b, "p0", [cardId]);
      b.actors.p0!.hand[0]!.upgraded = true;
      play(b, "p0", 0, cardId === "toxic-shelter" ? "p0" : undefined);
      assert.equal(b.actors.p0!.block, 16);
    }
});

test("loot respects solo viability, actual build investment and unique offer slots", () => {
  const s = createSession("loot", "JOIN", 42, content);
  addMember(s, "p0", "Alex");
  const ctx = { presence: { online: ["p0"], hostOnline: true, absentFor: {} } };
  applyCommand(
    s,
    { role: "player", memberId: "p0" },
    {
      requestId: "team",
      sessionId: s.id,
      encounterId: null,
      command: { kind: "team", character: "channeler", name: "Team" },
    },
    ctx,
  );
  const hero = s.members.p0!.hero;
  assert(!lootPool(s, hero).some((c) => c.requiresTeam));
  assert(!eligibleRelics(s, hero).some((r) => r.requiresTeam));
  hero.deck.push(
    { uid: "power", cardId: "echo", upgraded: false },
    { uid: "charge2", cardId: "stored-current", upgraded: true },
  );
  assert(!lootPool(s, hero).some((c) => c.id === "echo"));
  assert.equal(buildWeights(s, hero).get("charge"), 3);
  for (let seed = 1; seed <= 100; seed++) {
    const offers = rollOffers(s, hero, ["common", "common", "uncommon"], {
      rng: seed,
    });
    assert.equal(new Set(offers.map((c) => c.id)).size, 3);
    assert(!offers.some((c) => c.requiresTeam || c.rarity === "token"));
  }
  const first = grantReward(s, "p0", "node");
  assert.equal(grantReward(s, "p0", "node"), first);
  assert.equal(s.rewards.length, 1);
});
test("Milk Cat is fixed across every row-4 route; old frozen encounters keep old rules", () => {
  for (const seed of [1, 42, 100]) {
    const s = createSession("map", "JOIN", seed, content);
    assert(
      s.map
        .filter((n) => n.row === 4)
        .every((n) => n.encounterId === "milk-cat"),
    );
    const b = createCombat(
      "milk",
      "route",
      [{ hero: makeHero("p", "guardian", s), crewId: "team" }],
      32,
      "raider",
      seed,
      0,
      content,
      { encounterId: "milk-cat" },
    );
    assert.equal(b.enemies[0]!.portrait?.id, "milk-cat");
  }
  const old = structuredClone(content);
  delete old.depth;
  delete old.portraits;
  const b = fight(1, "raider", [], old);
  assert.equal(b.depthVersion, undefined);
  assert.equal(b.enemies[0]!.tactics, undefined);
  assert.equal(b.intents[0]!.targets[0]!.damage, 6);
  const s = createSession("old", "JOIN", 42, old);
  assert(s.map.every((n) => !n.encounterId));
  b.intents = makeIntents(b);
});

test("portrait pools vary encounters without rerolling retries or changing combat RNG", () => {
  const s = createSession("portraits", "JOIN", 42, content);
  const heroes = [{ hero: makeHero("p", "guardian", s), crewId: "team" }];
  const fixed = structuredClone(content);
  for (const e of fixed.enemies) delete e.portraitPool;
  for (const pattern of ["raider", "elite", "late", "middle", "final"]) {
    const seen = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const seed = seedFrom(`portrait-case:${n}`);
      const create = (id: string, c: Content, encounterId?: string) =>
        createCombat(
          id,
          ["middle", "final"].includes(pattern) ? "boss" : "route",
          heroes,
          80,
          pattern,
          seed,
          0,
          c,
          { encounterId },
        );
      const b = create("first", content);
      const retry = create("retry-3", content);
      const original = create("first", fixed);
      assert.deepEqual(
        b.enemies,
        retry.enemies,
        "attempt ID cannot reroll art",
      );
      assert.deepEqual(b.actors, original.actors, "art cannot change hands");
      assert.equal(b.rng, original.rng);
      assert.deepEqual(
        b.intents,
        original.intents,
        "art cannot change intentions",
      );
      assert.equal(
        new Set(b.enemies.map((e) => e.portrait!.id)).size,
        b.enemies.length,
      );
      for (const e of b.enemies) {
        seen.add(e.portrait!.id);
        assert.notEqual(e.portrait!.id, "milk-cat");
        assert.equal(
          e.name,
          content.portraits!.find((p) => p.id === e.portrait!.id)!.enemyName,
        );
      }
      assert.deepEqual(JSON.parse(JSON.stringify(b.enemies)), b.enemies);
      const milk = create("milk", content, "milk-cat");
      assert.equal(milk.enemies[0]!.portrait!.id, "milk-cat");
      assert.equal(milk.enemies[0]!.name, "Milk Cat");
    }
    assert(
      seen.size >= 5,
      `${pattern}: expected varied portraits, got ${seen.size}`,
    );
  }
  assert.equal(content.portraits!.length, 14);
});
