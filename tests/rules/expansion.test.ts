import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
import { generateMap, validateMap } from "../../src/domain/map.ts";
import {
  createSession,
  addMember,
  applyCommand,
  triggerBoss,
  tick,
  settleImmediate,
} from "../../src/domain/session.ts";
import {
  createCombat,
  playCard,
  preview,
  beginTurn,
} from "../../src/domain/combat.ts";
import { openShop, shopCommand } from "../../src/domain/shops.ts";
import { grantGold } from "../../src/domain/economy.ts";
import { grantRelicReward, claimRelic } from "../../src/domain/relics.ts";
import type {
  Command,
  DomainContext,
  Session,
} from "../../src/shared/model.ts";
const content = await loadContent();
function setup(n = 4) {
  const s = createSession("s", "JOIN", 43, content);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const ctx: DomainContext = {
    presence: { online: ids, hostOnline: true, absentFor: {} },
  };
  for (const id of ids) {
    addMember(s, id, id);
    send(s, ctx, id, {
      kind: "team",
      character: "guardian",
      ...(id === "p0" ? { name: "Crew" } : { crewId: "team-1" }),
    });
  }
  s.status = "running";
  return { s, ids, ctx };
}
function send(s: Session, ctx: DomainContext, id: string, command: Command) {
  return applyCommand(
    s,
    id === "host" ? { role: "host" } : { role: "player", memberId: id },
    {
      requestId: `${s.revision++}`,
      sessionId: s.id,
      encounterId:
        s.bosses.find((b) => b.gate === s.activeBossGate)?.combat?.id ??
        s.crews[s.members[id]?.crewId ?? ""]?.progress.combat?.id ??
        null,
      command,
    },
    ctx,
  );
}
test("shared map is seeded,15 rows,connected,has risky choices,shops,recovery and one pair of gates", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const map = generateMap(seed);
    validateMap(map);
    assert.equal(Math.max(...map.map((n) => n.row)), 15);
    assert.deepEqual(
      map.filter((n) => n.kind === "boss").map((n) => n.row),
      [8, 15],
    );
    assert(map.some((n) => n.kind === "shop"));
    assert(map.some((n) => n.kind === "rest"));
    assert(map.some((n) => n.risk === "severe"));
    assert(map.some((n) => n.next.length === 3));
    assert.deepEqual(map, generateMap(seed));
  }
  assert.notDeepEqual(generateMap(1), generateMap(2));
});
test("quiz team tiers support1–4 members,freeze denominator,grant once and never repeat a question", () => {
  for (const size of [1, 2, 3, 4])
    for (const successes of [0, 1, 2]) {
      const { s, ids, ctx } = setup(size);
      triggerBoss(s, 8, "team-1", ctx);
      const boss = s.bosses[0]!,
        q = boss.quiz;
      assert.equal(new Set(s.predictionOrder).size, 4);
      assert.throws(() => triggerBoss(s, 8, null, ctx), /already/);
      tick(s, 8001, ctx);
      for (let round = 0; round < 2; round++) {
        tick(s, 6001, ctx);
        const r = q.rounds[round]!,
          question = s.content.quizzes.find((q) => q.id === r.questionId)!;
        for (const id of ids)
          send(s, ctx, id, {
            kind: "quiz:answer",
            quizId: q.id,
            questionId: r.questionId,
            phaseRevision: q.phaseRevision,
            optionId:
              round < successes
                ? question.correctOptionId
                : question.options.find(
                    (o) => o.id !== question.correctOptionId,
                  )!.id,
          });
        assert.throws(
          () =>
            send(s, ctx, "p0", {
              kind: "quiz:answer",
              quizId: q.id,
              questionId: r.questionId,
              phaseRevision: q.phaseRevision - 1,
              optionId: "a",
            }),
          /changed/,
        );
        tick(s, 12001, ctx);
        assert.equal(q.stage, "reveal");
        tick(s, 12001, ctx);
      }
      const tier =
        successes === 2 ? "rare" : successes === 1 ? "uncommon" : "basic";
      assert.equal(q.settlement!.tiers["team-1"], tier);
      assert.equal(s.rewards.filter((r) => r.source === "quiz:8").length, size);
      const rewards = structuredClone(s.rewards);
      tick(s, 1, ctx);
      assert.deepEqual(s.rewards, rewards);
      for (const r of s.rewards.filter((r) => r.source === "quiz:8")) {
        assert.equal(r.offers.length, 3);
        assert.equal(new Set(r.offers.map((o) => o.cardId)).size, 3);
        assert.equal(
          r.offers.filter(
            (o) =>
              s.content.cards.find((c) => c.id === o.cardId)!.rarity === "rare",
          ).length,
          successes === 2 ? 1 : 0,
        );
      }
    }
});
test("shop purchases,removal,relic ownership and gold survive suspension without repeats", () => {
  const { s, ctx } = setup(1);
  const c = s.crews["team-1"]!;
  c.progress.phase = "shop";
  c.progress.nodeId = "r3-0";
  c.progress.row = 3;
  c.progress.roster = ["p0"];
  openShop(s, c);
  const h = s.members.p0!.hero;
  grantGold(s, "p0", "test", 300);
  grantGold(s, "p0", "test", 300);
  assert.equal(h.gold, 350);
  const shop = c.progress.shops!.p0!,
    item = shop.stock.find((i) => i.kind === "relic")!;
  const cmd = {
    kind: "shop:buy" as const,
    shopId: shop.id,
    shopRevision: shop.revision,
    itemId: item.id,
  };
  shopCommand(s, "p0", cmd);
  const gold = h.gold;
  assert.throws(() => shopCommand(s, "p0", cmd), /changed/);
  assert.equal(h.gold, gold);
  const saved = structuredClone(shop);
  triggerBoss(s, 8, null, ctx);
  assert.throws(
    () => shopCommand(s, "p0", { ...cmd, shopRevision: shop.revision }),
    /not open/,
  );
  send(s, ctx, "host", { kind: "host", action: "skip" });
  assert.deepEqual(c.progress.shops!.p0, saved);
  assert.equal(h.gold, gold);
  const current = c.progress.shops!.p0!;
  const card = h.deck.find(
    (i) => i.cardId !== "strike" && i.cardId !== "guard",
  )!;
  shopCommand(s, "p0", {
    kind: "shop:remove",
    shopId: current.id,
    shopRevision: current.revision,
    deckRevision: h.deckRevision,
    cardUid: card.uid,
  });
  assert(!h.deck.some((i) => i.uid === card.uid));
  assert.equal(h.removalCount, 1);
  grantRelicReward(s, "p0", "elite");
  const r = s.relicRewards[0]!;
  claimRelic(s, "p0", r.id, r.offers[0]!);
  assert.throws(() => claimRelic(s, "p0", r.id, null), /decided/);
});
test("relic preview is pure,first Block bonus is bounded,and encounter snapshots do not gain later relics", () => {
  const { s } = setup(1),
    h = s.members.p0!.hero;
  h.relics = [{ relicId: "brace-ring", acquiredFrom: "test" }];
  const b = createCombat(
      "b",
      "route",
      [{ hero: h, crewId: "team-1" }],
      100,
      "raider",
      42,
      0,
      content,
    ),
    a = b.actors.p0!;
  a.hand = [
    { uid: "g1", cardId: "guard", upgraded: false },
    { uid: "g2", cardId: "guard", upgraded: false },
  ];
  const before = structuredClone(b);
  preview(b, "p0", "g1", "p0", undefined, content);
  assert.deepEqual(b, before);
  playCard(b, "p0", "g1", "p0", undefined, content);
  assert.equal(a.block, 8);
  playCard(b, "p0", "g2", "p0", undefined, content);
  assert.equal(a.block, 13);
  h.relics.push({ relicId: "spare-shell", acquiredFrom: "later" });
  beginTurn(b, 1000, content);
  assert.equal(a.block, 0);
  assert.equal(a.relicState!.turnUses["brace-ring"], undefined);
  const next = createCombat(
    "next",
    "route",
    [{ hero: h, crewId: "team-1" }],
    100,
    "raider",
    42,
    0,
    content,
  );
  assert.equal(next.actors.p0!.block, 2);
  b.result = "victory";
  s.crews["team-1"]!.progress.combat = b;
  s.crews["team-1"]!.progress.phase = "battle";
  s.crews["team-1"]!.progress.nodeId = "r1-0";
  s.crews["team-1"]!.progress.roster = ["p0"];
  settleImmediate(s);
  const wallet = h.gold;
  settleImmediate(s);
  assert.equal(h.gold, wallet);
});

test("relic trigger matrix covers health,discard,exhaust,poison,chains,retention,help and openings", () => {
  const support = content.cards.find(
    (c) =>
      c.crossTeam &&
      c.target === "any-hero" &&
      c.effects.some((e) => e.op === "block"),
  )!;
  const cases = [
    ["blood-battery", ["blood-spark"], "energy"],
    ["folded-note", ["feint"], "draw"],
    ["recycler", ["blood-spark"], "draw"],
    ["glass-filter", ["toxic-dart"], "block"],
    ["tripwire", ["strike", "strike", "strike"], "block"],
    ["capacitor", ["strike"], "damage"],
    ["relay-pin", [support.id], "draw"],
  ] as const;
  for (const [id, cards, kind] of cases) {
    const { s } = setup(2),
      h = s.members.p0!.hero;
    h.relics = [{ relicId: id, acquiredFrom: "test" }];
    const b = createCombat(
        id,
        "route",
        [
          { hero: h, crewId: "team-1" },
          { hero: s.members.p1!.hero, crewId: "team-1" },
        ],
        200,
        "raider",
        42,
        0,
        content,
      ),
      a = b.actors.p0!;
    a.energy = 20;
    a.hand = [...cards, "guard"].map((cardId, i) => ({
      uid: `c${i}`,
      cardId,
      upgraded: false,
      heldAcrossTurn: id === "capacitor",
    }));
    const original = structuredClone(b);
    for (const [i, cardId] of cards.entries()) {
      const d = content.cards.find((c) => c.id === cardId)!;
      const target =
        d.target === "enemy" ? "main" : d.target === "any-hero" ? "p1" : "p0";
      playCard(
        b,
        "p0",
        `c${i}`,
        target,
        d.choose ? `c${cards.length}` : undefined,
        content,
      );
    }
    assert.equal(a.relicState!.turnUses[id], 1, id);
    assert(
      b.log.some((e) => e.relicId === id && e.kind === kind && e.amount > 0),
      id,
    );
    assert(original.actors.p0!.relicState!.turnUses[id] === undefined);
  }
  for (const [id, hand, energy, block] of [
    ["opening-lens", 6, 3, 0],
    ["overcharged-coil", 4, 4, 0],
    ["spare-shell", 5, 3, 2],
  ] as const) {
    const { s } = setup(1),
      h = s.members.p0!.hero;
    h.relics = [{ relicId: id, acquiredFrom: "test" }];
    const a = createCombat(
      id,
      "route",
      [{ hero: h, crewId: "team-1" }],
      100,
      "raider",
      42,
      0,
      content,
    ).actors.p0!;
    assert.equal(a.hand.length, hand);
    assert.equal(a.energy, energy);
    assert.equal(a.block, block);
  }
});
