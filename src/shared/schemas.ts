import { z } from "zod";
const character = z.enum(["guardian", "rogue", "alchemist", "channeler"]);
const id = z.string().min(1).max(150);
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("quiz:answer"),
    quizId: id,
    questionId: id,
    phaseRevision: z.number().int().nonnegative(),
    optionId: id,
  }),
  z.object({
    kind: z.literal("shop:buy"),
    shopId: id,
    shopRevision: z.number().int().nonnegative(),
    itemId: id,
  }),
  z.object({
    kind: z.literal("shop:remove"),
    shopId: id,
    shopRevision: z.number().int().nonnegative(),
    deckRevision: z.number().int().nonnegative(),
    cardUid: id,
  }),
  z.object({ kind: z.literal("shop:ready"), shopId: id, ready: z.boolean() }),
  z.object({
    kind: z.literal("relic:claim"),
    rewardId: id,
    relicId: id.nullable(),
  }),
  z.object({
    kind: z.literal("team"),
    name: z.string().trim().min(1).max(24).optional(),
    crewId: id.optional(),
    character,
  }),
  z.object({ kind: z.literal("travel"), nodeId: id }),
  z.object({
    kind: z.literal("team:change"),
    crewId: id.optional(),
    name: z.string().trim().min(1).max(24).optional(),
  }),
  z.object({ kind: z.literal("team:cancel") }),
  z.object({
    kind: z.literal("play"),
    cardUid: id,
    handRevision: z.number().int().nonnegative(),
    targetId: id.optional(),
    choiceUid: id.optional(),
  }),
  z.object({
    kind: z.literal("preview"),
    cardUid: id,
    targetId: id.optional(),
    choiceUid: id.optional(),
  }),
  z.object({ kind: z.literal("end-turn"), ended: z.boolean() }),
  z.object({
    kind: z.literal("request"),
    text: z.enum(["Protect me", "Wait", "Ready", ""]),
  }),
  z.object({
    kind: z.literal("prediction"),
    choice: z.number().int().min(0).max(2),
  }),
  z.object({ kind: z.literal("reward"), rewardId: id, cardUid: id.nullable() }),
  z.object({
    kind: z.literal("rest"),
    action: z.enum(["heal", "upgrade", "remove"]),
    cardUid: id.optional(),
  }),
  z.object({
    kind: z.literal("event"),
    choice: z.number().int().min(0).max(1),
    cardUid: id.optional(),
  }),
  z.object({ kind: z.literal("retry") }),
  z.object({ kind: z.literal("takeover") }),
  z.object({
    kind: z.literal("host"),
    action: z.enum([
      "start",
      "pause",
      "resume",
      "extend",
      "boss",
      "skip",
      "end",
      "remove",
      "move",
    ]),
    gate: z.union([z.literal(8), z.literal(15)]).optional(),
    quizId: id.optional(),
    phaseRevision: z.number().int().nonnegative().optional(),
    scope: z.enum(["quiz", "boss"]).optional(),
    memberId: id.optional(),
    crewId: id.optional(),
    name: z.string().trim().min(1).max(24).optional(),
  }),
]);
export const envelopeSchema = z.object({
  requestId: id,
  sessionId: id,
  encounterId: id.nullable(),
  command: commandSchema,
});
export const joinSchema = z.object({
  code: z.string().min(4).max(8),
  name: z.string().trim().min(1).max(24),
});
