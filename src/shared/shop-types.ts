export type ShopItem = { id: string; price: number; sold: boolean } & (
  | { kind: "card"; cardId: string }
  | { kind: "relic"; relicId: string }
);
export interface PlayerShop {
  id: string;
  memberId: string;
  revision: number;
  stock: ShopItem[];
  removalAvailable: boolean;
  ready: boolean;
  closed: boolean;
}
export interface EconomyRules {
  starting: number;
  battle: number;
  elite: number;
  boss: number;
  cards: { common: number; uncommon: number; rare: number };
  relics: { common: number; rare: number };
  removal: number;
  removalIncrease: number;
}
