import { generateMap } from "../../domain/map.ts";
import {
  quizzesSchema,
  relicsSchema,
  economySchema,
  quizTimingSchema,
} from "./extensions.ts";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { Content } from "../../shared/model.ts";
const effect = z.object({
  op: z.enum([
    "damage",
    "block",
    "draw",
    "energy",
    "lose-hp",
    "poison",
    "weak",
    "vulnerable",
    "strength",
    "power",
    "discard",
    "exhaust",
    "recover",
    "generate",
    "retain",
    "reduce-cost",
    "copy",
    "double-block",
    "spend-block",
    "repeat-ally",
    "charge",
    "heal",
    "all-block",
    "all-energy",
    "self-block",
    "strip-block",
    "consume-poison",
    "spend-charge",
  ]),
  amount: z.number().min(0).max(100),
  key: z.string().optional(),
  scale: z
    .enum([
      "block",
      "attacks",
      "discarded",
      "exhausted",
      "poison",
      "charge",
      "lost-hp",
      "other-attacks",
    ])
    .optional(),
  all: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
  pool: z.number().int().positive().max(20).optional(),
  hits: z.number().int().min(1).max(10).optional(),
  factor: z.number().int().min(1).max(10).optional(),
});
const version = z.object({
  cost: z.number().int().min(0).max(5),
  text: z.string().min(1),
  effects: z.array(effect).min(1),
});
const card = version.extend({
  id: z.string(),
  name: z.string().min(1),
  character: z.enum(["guardian", "rogue", "alchemist", "channeler", "shared"]),
  rarity: z.enum(["common", "uncommon", "rare", "token"]),
  type: z.enum(["attack", "skill", "power"]),
  target: z.enum([
    "enemy",
    "self",
    "ally",
    "any-hero",
    "hand",
    "discard",
    "none",
  ]),
  tags: z.array(z.string()).min(1),
  upgrade: version,
  exhaust: z.boolean().optional(),
  retain: z.boolean().optional(),
  choose: z.enum(["hand", "discard"]).optional(),
  crossTeam: z.boolean().optional(),
  discardEffect: z.array(effect).optional(),
  exhaustOnDiscard: z.boolean().optional(),
  nonCopyable: z.boolean().optional(),
  requiresTeam: z.boolean().optional(),
});
const prediction = z.object({
  id: z.string(),
  title: z.string(),
  rule: z.string().min(20),
  steps: z.array(z.string()).min(2),
  choices: z.array(z.string()).length(3),
  correct: z.number().int().min(0).max(2),
  explanations: z.array(z.string()).length(3),
  source: z.object({
    week: z.union([z.literal(2), z.literal(4), z.literal(5)]),
    slides: z.array(z.number().int().positive()).min(1),
  }),
});
const powerKeys = new Set([
  "block-bank",
  "blood-block",
  "discard-energy",
  "exhaust-energy",
  "start-block",
  "energy-debt",
  "thorns",
  "keep-block",
  "double-first-block",
  "hp-strength",
  "block-damage",
  "hp-draw",
  "rhythm",
  "spark-bonus",
  "discard-draw",
  "attack-chain",
  "exhaust-block",
  "exhaust-draw",
  "poison-mist",
  "scrap-damage",
  "charge-start",
  "echo",
  "help-draw",
]);
export async function loadContent(root = resolve("content")): Promise<Content> {
  const read = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(resolve(root, path), "utf8"));
  const depth = z
    .object({
      version: z.literal(1),
      cards: z.literal(120),
      relics: z.literal(24),
      fixedEncounters: z.record(z.string().regex(/^[1-9][0-9]*$/), z.string()),
    })
    .parse(await read("depth.json"));
  const portraits = z
    .array(
      z.object({
        id: z.string(),
        path: z.string().regex(/^\/assets\/enemies\/[a-z-]+\.(jpg|png)$/),
        enemyName: z.string().min(1).max(30).optional(),
        alt: z.string().min(1),
        position: z.string().regex(/^\d+% \d+%$/),
        title: z.string().min(1),
        author: z.string().min(1),
        license: z.string().min(1),
        fit: z.enum(["cover", "contain"]).optional(),
        download: z.string().optional(),
        rightsStatus: z.enum(["verified", "unverified"]).optional(),
        licenseUrl: z.url(),
        source: z.url(),
        checkedAt: z.string(),
        changes: z.string().min(1),
      }),
    )
    .min(5)
    .parse(await read("enemies/portraits.json"));
  if (new Set(portraits.map((p) => p.id)).size !== portraits.length)
    throw new Error("Duplicate portrait ID");
  for (const p of portraits)
    await access(resolve(root, "../public", p.path.slice(1)));
  const cards = z.array(card).parse(await read("cards/catalogue.json"));
  const starters = z
    .object({
      guardian: z.array(z.string()).length(10),
      rogue: z.array(z.string()).length(10),
      alchemist: z.array(z.string()).length(10),
      channeler: z.array(z.string()).length(10),
    })
    .parse(await read("cards/starters.json"));
  const map = generateMap(0, depth.fixedEncounters);
  const quizzes = quizzesSchema.parse(
    await read("learning/week6-questions.json"),
  );
  const relics = relicsSchema.parse(await read("relics/relics.json"));
  const economy = economySchema.parse(await read("economy/shop.json"));
  const quizTiming = quizTimingSchema.parse(
    await read("learning/quiz-rules.json"),
  );
  const predictions = z
    .array(prediction)
    .length(12)
    .parse(await read("learning/predictions.json"));
  const sources = z
    .array(
      z.object({
        week: z.number().int().positive(),
        file: z.string().min(1),
        reference: z.literal("physical slide number"),
        slideCount: z.number().int().positive(),
      }),
    )
    .parse(await read("learning/sources.json"));
  const week6 = sources.find((s) => s.week === 6);
  if (
    !week6 ||
    quizzes.some((q) =>
      q.source.physicalSlides.some((n) => n > week6.slideCount),
    )
  )
    throw new Error("Invalid Week 6 quiz source");
  for (const p of predictions) {
    const source = sources.find((s) => s.week === p.source.week);
    if (!source || p.source.slides.some((slide) => slide > source.slideCount))
      throw new Error(`Invalid lecture reference in ${p.id}`);
  }
  const enemies = z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        pattern: z.string(),
        weight: z.number().positive(),
        portrait: z.string().optional(),
        portraitPool: z.array(z.string()).min(2).optional(),
      }),
    )
    .parse(await read("enemies/encounters.json"));
  const fixedIds = new Set(Object.values(depth.fixedEncounters));
  const fixedPortraits = new Set(
    enemies.filter((e) => fixedIds.has(e.id)).map((e) => e.portrait),
  );
  for (const e of enemies) {
    const pool = e.portraitPool ?? [];
    if (
      !portraits.some((p) => p.id === e.portrait) ||
      pool.some((id) => !portraits.some((p) => p.id === id))
    )
      throw new Error(`Missing portrait for ${e.id}`);
    if (new Set(pool).size !== pool.length)
      throw new Error(`Duplicate portrait in pool for ${e.id}`);
    if (
      (fixedIds.has(e.id) && e.portraitPool) ||
      pool.some((id) => fixedPortraits.has(id))
    )
      throw new Error(`Fixed encounter portrait cannot be randomized: ${e.id}`);
  }
  for (const [row, id] of Object.entries(depth.fixedEncounters)) {
    if (
      !enemies.some((e) => e.id === id) ||
      !map.some((n) => n.row === Number(row)) ||
      !map
        .filter((n) => n.row === Number(row))
        .every((n) => ["battle", "elite"].includes(n.kind))
    )
      throw new Error(`Invalid fixed encounter at row ${row}`);
  }
  const events = z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        text: z.string(),
        choices: z
          .array(
            z.object({
              label: z.string(),
              effect: z.enum(["heal", "upgrade", "remove", "card"]),
              amount: z.number().int().positive(),
              text: z.string(),
            }),
          )
          .length(2),
      }),
    )
    .parse(await read("maps/events.json"));
  const timing = z
    .object({
      turn: z.number().positive(),
      openingTurn: z.number().int().positive().optional(),
      enemy: z.number().positive(),
      intro: z.number().positive(),
      prediction: z.number().positive(),
      feedback: z.number().positive(),
      vote: z.number().positive(),
    })
    .parse(await read("timing.json"));
  const ids = new Set(cards.map((c) => c.id));
  if (
    ids.size !== cards.length ||
    cards.filter((c) => c.rarity !== "token").length !== depth.cards
  )
    throw new Error("Catalogue must have 120 distinct cards plus tokens.");
  for (const [character, deck] of Object.entries(starters))
    for (const id of deck) {
      const c = cards.find((c) => c.id === id);
      if (
        !c ||
        ![character, "shared"].includes(c.character) ||
        c.rarity === "token"
      )
        throw new Error(`Invalid starter ${character}/${id}`);
    }
  for (const character of ["guardian", "rogue", "alchemist", "channeler"])
    for (const [rarity, count] of [
      ["common", 12],
      ["uncommon", 6],
      ["rare", 6],
    ] as const)
      if (
        cards.filter((c) => c.character === character && c.rarity === rarity)
          .length !== count
      )
        throw new Error(`Invalid ${character} ${rarity} count`);
  if (new Set(enemies.map((e) => e.id)).size !== enemies.length)
    throw new Error("Duplicate enemy ID");
  for (const [rarity, count] of [
    ["common", 16],
    ["uncommon", 8],
    ["token", 2],
  ] as const)
    if (
      cards.filter((c) => c.character === "shared" && c.rarity === rarity)
        .length !== count
    )
      throw new Error(`Invalid shared ${rarity} count`);
  for (const c of cards) {
    if (c.exhaustOnDiscard && (!c.discardEffect?.length || !c.exhaust))
      throw new Error(`Invalid discard exhaustion in ${c.id}`);
  }
  for (const c of cards)
    for (const e of [
      ...c.effects,
      ...c.upgrade.effects,
      ...(c.discardEffect ?? []),
    ]) {
      if (e.op === "power" && !powerKeys.has(e.key ?? ""))
        throw new Error(`Unsupported power in ${c.id}`);
      if (
        e.op === "generate" &&
        !ids.has(e.key === "scrap-discard" ? "scrap" : (e.key ?? ""))
      )
        throw new Error(`Missing token in ${c.id}`);
    }
  if (
    new Set(predictions.map((p) => p.id)).size !== 12 ||
    predictions.some((p) => new Set(p.choices).size !== 3)
  )
    throw new Error("Prediction outcomes must be distinct");
  for (const id of [
    "raider",
    "guard",
    "support",
    "colossus",
    "sentinel",
    "healer",
    "milk-cat",
  ])
    if (enemies.filter((e) => e.id === id).length !== 1)
      throw new Error(`Missing or duplicate enemy: ${id}`);
  if (relics.length !== depth.relics) throw new Error("Expected 24 relics");
  const body = {
    depth,
    portraits,
    quizzes,
    relics,
    economy,
    quizTiming,
    cards,
    starters,
    map,
    predictions,
    sources,
    enemies,
    events,
    timing,
  };
  return {
    ...body,
    version: "cards-v2",
    hash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}
