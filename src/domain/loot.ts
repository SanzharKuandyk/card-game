import type { CardDefinition, Hero, Session } from "../shared/model.ts";
import { nextRandom, shuffle } from "./random.ts";

export function lootTeamSize(s: Session, hero: Hero): number {
  const member = s.members[hero.memberId];
  const crew = member?.crewId ? s.crews[member.crewId] : undefined;
  return crew?.progress.roster.length || crew?.members.length || 1;
}

export function lootPool(s: Session, hero: Hero): CardDefinition[] {
  const size = lootTeamSize(s, hero);
  return s.content.cards.filter(
    (c) =>
      [hero.character, "shared"].includes(c.character) &&
      !["strike", "guard"].includes(c.id) &&
      c.rarity !== "token" &&
      (!s.content.depth ||
        ((!c.requiresTeam || size > 1) &&
          !(
            c.type === "power" &&
            c.effects.some((e) =>
              [
                "echo",
                "keep-block",
                "double-first-block",
                "block-bank",
              ].includes(e.key ?? ""),
            ) &&
            hero.deck.some((d) => d.cardId === c.id)
          ))),
  );
}

export function buildWeights(s: Session, hero: Hero): Map<string, number> {
  const weights = new Map<string, number>();
  // Count investment beyond the starter list, plus upgrades; starter tags alone
  // should not pretend the player has already chosen both of their builds.
  const starters = [...s.content.starters[hero.character]];
  for (const instance of hero.deck) {
    const index = starters.indexOf(instance.cardId);
    const starter = index >= 0;
    if (starter) starters.splice(index, 1);
    const value = (starter ? 0 : 1) + (instance.upgraded ? 1 : 0);
    for (const tag of s.content.cards.find((c) => c.id === instance.cardId)!
      .tags)
      if (tag !== "general") weights.set(tag, (weights.get(tag) ?? 0) + value);
  }
  return weights;
}

export function rollOffers(
  s: Session,
  hero: Hero,
  rarities: string[],
  rng: { rng: number },
): CardDefinition[] {
  const pool = lootPool(s, hero);
  const weights = buildWeights(s, hero);
  const picks: CardDefinition[] = [];
  for (const [index, rarity] of rarities.entries()) {
    const candidates = shuffle(
      pool.filter(
        (c) => c.rarity === rarity && !picks.some((p) => p.id === c.id),
      ),
      rng,
    );
    if (!candidates.length) continue;
    const scores = candidates.map((c) => {
      const affinity = Math.min(
        4,
        c.tags.reduce((n, tag) => n + (weights.get(tag) ?? 0), 0),
      );
      if (index === 0) return 1 + affinity;
      // Second slot invites a different direction. Third stays an open roll.
      return index === 1 &&
        picks[0] &&
        !c.tags.some((tag) => picks[0]!.tags.includes(tag))
        ? 3
        : 1;
    });
    let roll = nextRandom(rng) * scores.reduce((n, x) => n + x, 0);
    const chosen =
      candidates.find((_, i) => (roll -= scores[i]!) < 0) ?? candidates[0]!;
    picks.push(chosen);
  }
  return picks;
}
