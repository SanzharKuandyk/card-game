import { z } from "zod";
import { RelicEffect } from "../../shared/relic-types.ts";
const replay = z
  .array(
    z.object({
      scene: z.object({
        nodes: z
          .array(
            z.object({
              shape: z.enum(["circle", "box", "text"]),
              x: z.number().min(0).max(420),
              y: z.number().min(0).max(110),
              w: z.number().min(0).max(420),
              h: z.number().min(0).max(110),
              label: z.string(),
              role: z.enum(["actor", "object", "sensor", "danger", "hint"]),
            }),
          )
          .min(1)
          .max(20),
        lines: z
          .array(
            z.object({
              x1: z.number(),
              y1: z.number(),
              x2: z.number(),
              y2: z.number(),
            }),
          )
          .max(20),
      }),
      label: z.string().min(1),
      detail: z.string().min(1),
      image: z.enum(["jump", "movement", "physics", "collision"]),
    }),
  )
  .min(1)
  .max(6);
export const quizzesSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      topic: z.enum(["movement", "physics", "collision"]),
      kind: z.enum(["predict", "repair"]),
      prompt: z.string().min(10),
      rule: z.string().min(10),
      options: z
        .array(
          z.object({
            id: z.string(),
            text: z.string().min(1),
            explanation: z.string().min(1),
          }),
        )
        .length(3),
      correctOptionId: z.string(),
      setupReplay: replay,
      resultReplay: replay,
      source: z.object({
        week: z.literal(6),
        physicalSlides: z.array(z.number().int().min(1).max(77)).min(1),
      }),
    }),
  )
  .length(12)
  .superRefine((qs, ctx) => {
    if (new Set(qs.map((q) => q.id)).size !== qs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate quiz ID" });
    for (const q of qs)
      if (
        new Set(q.options.map((o) => o.id)).size !== 3 ||
        new Set(q.options.map((o) => o.text)).size !== 3 ||
        !q.options.some((o) => o.id === q.correctOptionId)
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid outcomes in ${q.id}`,
        });
  });
export const relicsSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      text: z.string().min(10),
      rarity: z.enum(["common", "rare"]),
      character: z.enum([
        "guardian",
        "rogue",
        "alchemist",
        "channeler",
        "shared",
      ]),
      effect: z.enum(Object.values(RelicEffect)),
      requiresTeam: z.boolean().optional(),
      amount: z.number().int().positive().max(10),
      tags: z.array(z.string()).min(1),
    }),
  )
  .min(12)
  .refine(
    (rs) => new Set(rs.map((r) => r.id)).size === rs.length,
    "Duplicate relic ID",
  );
const positive = z.number().int().positive();
export const economySchema = z.object({
  starting: positive,
  battle: positive,
  elite: positive,
  boss: positive,
  cards: z.object({ common: positive, uncommon: positive, rare: positive }),
  relics: z.object({ common: positive, rare: positive }),
  removal: positive,
  removalIncrease: positive,
});
export const quizTimingSchema = z
  .object({
    announce: positive,
    demonstrate: positive,
    answer: positive,
    minimumAnswer: positive,
    reveal: positive,
    reward: positive,
  })
  .refine((t) => t.minimumAnswer <= t.answer, "Invalid minimum answer time");
