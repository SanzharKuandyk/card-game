import type { Session, Crew, Command } from "../shared/model.ts";
import type { PlayerShop } from "../shared/shop-types.ts";
import { seedFrom, shuffle } from "./random.ts";
export function openShop(s: Session, crew: Crew): void {
  crew.progress.shops = {};
  for (const id of crew.progress.roster) {
    const hero = s.members[id]!.hero;
    const shopId = `${s.id}:${crew.id}:${crew.progress.nodeId}:${id}`;
    const rng = { rng: seedFrom(shopId) };
    const cards = s.content.cards.filter(
      (c) =>
        [hero.character, "shared"].includes(c.character) &&
        !["strike", "guard"].includes(c.id),
    );
    const picks = [
      ...shuffle(
        cards.filter((c) => c.rarity === "common"),
        rng,
      ).slice(0, 2),
      ...shuffle(
        cards.filter((c) => c.rarity === "uncommon"),
        rng,
      ).slice(0, 2),
      ...shuffle(
        cards.filter((c) => c.rarity === "rare"),
        rng,
      ).slice(0, 1),
    ];
    const relics = s.content.relics.filter(
      (r) =>
        [hero.character, "shared"].includes(r.character) &&
        !hero.relics.some((o) => o.relicId === r.id),
    );
    crew.progress.shops[id] = {
      id: shopId,
      memberId: id,
      revision: 0,
      stock: [
        ...picks.map((c, i) => ({
          id: `card:${i}`,
          kind: "card" as const,
          cardId: c.id,
          price:
            s.content.economy.cards[c.rarity as "common" | "uncommon" | "rare"],
          sold: false,
        })),
        ...[
          ...shuffle(
            relics.filter((r) => r.rarity === "common"),
            rng,
          ).slice(0, 2),
          ...shuffle(
            relics.filter((r) => r.rarity === "rare"),
            rng,
          ).slice(0, 1),
        ].map((r, i) => ({
          id: `relic:${i}`,
          kind: "relic" as const,
          relicId: r.id,
          price: s.content.economy.relics[r.rarity],
          sold: false,
        })),
      ],
      removalAvailable: true,
      ready: false,
      closed: false,
    };
  }
}
export function shopCommand(
  s: Session,
  memberId: string,
  cmd: Extract<Command, { kind: "shop:buy" | "shop:remove" | "shop:ready" }>,
): void {
  const member = s.members[memberId]!;
  const crew = s.crews[member.crewId!]!;
  const shop = crew.progress.shops?.[memberId];
  if (
    s.activeBossGate !== null ||
    crew.progress.phase !== "shop" ||
    !shop ||
    shop.id !== cmd.shopId ||
    shop.closed
  )
    throw new Error("This shop is not open");
  if (cmd.kind === "shop:ready") {
    shop.ready = cmd.ready;
    return;
  }
  if (shop.ready) throw new Error("Press Change before shopping");
  if (cmd.shopRevision !== shop.revision)
    throw new Error("Shop changed. Check the current item.");
  const hero = member.hero;
  if (cmd.kind === "shop:buy") {
    const item = shop.stock.find((i) => i.id === cmd.itemId);
    if (!item || item.sold) throw new Error("Item already sold or unavailable");
    if (hero.gold < item.price) throw new Error("Not enough gold");
    if (item.kind === "relic") {
      if (hero.relics.some((r) => r.relicId === item.relicId))
        throw new Error("Relic already owned");
      hero.relics.push({ relicId: item.relicId, acquiredFrom: shop.id });
    } else {
      hero.deck.push({
        uid: `${shop.id}:${item.id}`,
        cardId: item.cardId,
        upgraded: false,
      });
      hero.deckRevision++;
    }
    hero.gold -= item.price;
    item.sold = true;
  } else {
    if (!shop.removalAvailable || cmd.deckRevision !== hero.deckRevision)
      throw new Error("Deck changed or removal already used");
    const card = hero.deck.find((c) => c.uid === cmd.cardUid);
    if (
      !card ||
      hero.deck.length <= 6 ||
      (["strike", "guard"].includes(card.cardId) &&
        hero.deck.filter((c) => c.cardId === card.cardId).length <= 1)
    )
      throw new Error(
        "Keep at least six cards, including one Strike and one Guard",
      );
    const price = removalPrice(s, memberId);
    if (hero.gold < price) throw new Error("Not enough gold");
    hero.gold -= price;
    hero.deck = hero.deck.filter((c) => c.uid !== card.uid);
    hero.deckRevision++;
    hero.removalCount++;
    shop.removalAvailable = false;
  }
  shop.revision++;
}
export function removalPrice(s: Session, id: string): number {
  return (
    s.content.economy.removal +
    s.members[id]!.hero.removalCount * s.content.economy.removalIncrease
  );
}
export function closeShops(
  shops: Record<string, PlayerShop> | undefined,
): void {
  for (const shop of Object.values(shops ?? {})) shop.closed = true;
}
