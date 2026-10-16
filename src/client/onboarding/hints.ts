import type { Character } from "../../shared/model.ts";
import { LearningAnchor, LearningHintId } from "./model.ts";
import type { LearningContext, LearningHint } from "./model.ts";

export const combinations: Record<
  Character,
  { cards: string[]; text: string }
> = {
  guardian: {
    cards: ["brace", "shield-strike"],
    text: "Brace gives Block. Shield Strike deals damage using that Block.",
  },
  rogue: {
    cards: ["knifework", "finishing-cut"],
    text: "Knifework makes free attacks. Play them before Finishing Cut.",
  },
  alchemist: {
    cards: ["toxic-dart", "venom-coat"],
    text: "Toxic Dart adds Poison. Venom Coat gains Block from enemy Poison.",
  },
  channeler: {
    cards: ["charge", "windup"],
    text: "Charge strengthens Windup.",
  },
};

export function chooseLearningHint(ctx: LearningContext): LearningHint | null {
  const b = ctx.combat;
  const own = b?.actors.find((a) => a.memberId === ctx.memberId);
  if (
    !ctx.available ||
    ctx.selected ||
    ctx.progress.hidden ||
    !b?.openingRoom ||
    b.kind !== "route" ||
    b.phase !== "player" ||
    b.result ||
    !own ||
    own.recovery ||
    own.hp <= 0 ||
    own.ended
  )
    return null;
  const unseen = (id: LearningHintId) => !ctx.progress.seen.includes(id);
  const hint = (
    id: LearningHintId,
    text: string,
    anchor: LearningAnchor,
    cardUids: string[] = [],
  ): LearningHint => ({ id, text, anchor, cardUids });
  if (!ctx.hasPlayed && unseen(LearningHintId.Choose))
    return hint(
      LearningHintId.Choose,
      "Choose a card. Its corner shows the energy cost.",
      LearningAnchor.Hand,
    );
  if (ctx.hasPlayed && own.energy > 0 && unseen(LearningHintId.More))
    return hint(
      LearningHintId.More,
      "You can play more cards while you have energy.",
      LearningAnchor.Energy,
    );
  const incoming = b.intents
    .flatMap((i) => i.targets)
    .filter((t) => t.memberId === own.memberId)
    .reduce((n, t) => n + t.damage, 0);
  if (incoming > 0 && unseen(LearningHintId.Defence))
    return hint(
      LearningHintId.Defence,
      "Incoming attacks are above the enemy. Block protects your health.",
      LearningAnchor.Intent,
    );
  const recipe = ctx.character ? combinations[ctx.character] : null;
  if (recipe && unseen(LearningHintId.Combination)) {
    const cards = recipe.cards.map((id) =>
      b.hand.find((card) => card.cardId === id),
    );
    if (
      cards.every((c) => !!c) &&
      cards.reduce((n, c) => n + c!.cost, 0) <= own.energy &&
      (ctx.character !== "rogue" || b.hand.length - 1 + 3 <= 10)
    )
      return hint(
        LearningHintId.Combination,
        recipe.text,
        LearningAnchor.Hand,
        cards.map((c) => c!.uid),
      );
  }
  if (
    unseen(LearningHintId.End) &&
    (ctx.hasPlayed || !b.hand.some((c) => c.cost <= own.energy))
  )
    return hint(
      LearningHintId.End,
      "End turn when you’re done. The enemy waits for your team.",
      LearningAnchor.EndTurn,
    );
  return null;
}
