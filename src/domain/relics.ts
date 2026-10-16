import type { BattleActor, Content, Hero, Session } from "../shared/model.ts";
import type {
  RelicDefinition,
  RelicEffect,
  EncounterRelics,
} from "../shared/relic-types.ts";
import { shuffle, seedFrom } from "./random.ts";
export function encounterRelics(hero: Hero, content: Content): EncounterRelics {
  const activeRelicIds = hero.relics?.map((r) => r.relicId) ?? [];
  return {
    activeRelicIds,
    definitions: content.relics.filter((r) => activeRelicIds.includes(r.id)),
    turnUses: {},
    encounterUses: {},
  };
}
export function relic(
  a: BattleActor,
  effect: RelicEffect,
): RelicDefinition | undefined {
  return a.relicState?.definitions.find((r) => r.effect === effect);
}
export function takeRelic(
  a: BattleActor,
  effect: RelicEffect,
): RelicDefinition | undefined {
  const r = relic(a, effect);
  if (!r || !a.relicState || a.relicState.turnUses[r.id]) return;
  a.relicState.turnUses[r.id] = 1;
  return r;
}
export function grantRelicReward(s: Session, id: string, source: string): void {
  const rid = `relic:${source}:${id}`;
  if (s.relicRewards.some((r) => r.id === rid)) return;
  const h = s.members[id]!.hero;
  const pool = shuffle(
    s.content.relics.filter(
      (r) =>
        [h.character, "shared"].includes(r.character) &&
        !h.relics.some((o) => o.relicId === r.id),
    ),
    { rng: seedFrom(`${s.seed}:${rid}`) },
  );
  s.relicRewards.push({
    id: rid,
    memberId: id,
    source,
    offers: pool.slice(0, 3).map((r) => r.id),
    claimed: false,
    selected: null,
  });
}
export function claimRelic(
  s: Session,
  id: string,
  rewardId: string,
  relicId: string | null,
): void {
  const r = s.relicRewards.find((r) => r.id === rewardId && r.memberId === id);
  if (!r || r.claimed)
    throw new Error("Relic reward already decided or unavailable");
  const h = s.members[id]!.hero;
  if (relicId) {
    if (
      !r.offers.includes(relicId) ||
      h.relics.some((o) => o.relicId === relicId)
    )
      throw new Error("Choose an available relic");
    h.relics.push({ relicId, acquiredFrom: r.source });
  }
  r.claimed = true;
  r.selected = relicId;
}
export function victoryRelics(s: Session, id: string, source: string): void {
  const h = s.members[id]!.hero;
  const key = `relic-heal:${source}:${id}`;
  if (s.economyGrants[key] !== undefined) return;
  s.economyGrants[key] = 0;
  const r = s.content.relics.find(
    (r) =>
      r.effect === "victory-heal" && h.relics.some((o) => o.relicId === r.id),
  );
  if (r && h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + r.amount);
}
