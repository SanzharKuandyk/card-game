import { lootPool, rollOffers } from "./loot.ts";
import type { Session, Hero, Reward } from "../shared/model.ts";
import { definition } from "./combat.ts";
import { shuffle } from "./random.ts";
export function eligibleCards(s: Session, hero: Hero, rarity: string) {
  return lootPool(s, hero).filter((c) => c.rarity === rarity);
}
export function grantReward(
  s: Session,
  memberId: string,
  source: string,
  rare = false,
  commonOnly = false,
): Reward {
  const id = `${source}:${memberId}`;
  const existing = s.rewards.find((r) => r.id === id);
  if (existing) return existing;
  const hero = s.members[memberId]!.hero;
  const pool = eligibleCards(s, hero, rare ? "rare" : "common");
  const basics = shuffle(pool, s);
  const uncommon = shuffle(eligibleCards(s, hero, "uncommon"), s);
  const tags = hero.deck.flatMap((i) => definition(s.content, i).tags);
  const relevant =
    basics.find((c) =>
      c.tags.some((t) => tags.includes(t) && t !== "general"),
    ) ?? basics[0]!;
  const alternate = basics.find((c) => c.id !== relevant.id) ?? basics[1]!;
  const picks = s.content.depth
    ? rollOffers(
        s,
        hero,
        rare
          ? ["rare", "rare", "rare"]
          : commonOnly
            ? ["common", "common", "common"]
            : ["common", "common", "uncommon"],
        s,
      )
    : rare || commonOnly
      ? basics.slice(0, 3)
      : [relevant, alternate, uncommon[0]!];
  const reward: Reward = {
    id,
    memberId,
    source,
    offers: picks.map((c, i) => ({
      uid: `${id}:${i}`,
      cardId: c.id,
      upgraded: false,
    })),
    claimed: false,
    selected: null,
  };
  s.rewards.push(reward);
  return reward;
}
