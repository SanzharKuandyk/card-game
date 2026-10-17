export const RelicEffect = {
  BlockCarry: "block-carry",
  HealthBlock: "health-block",
  DiscardSpark: "discard-spark",
  ZeroBlock: "zero-block",
  PoisonSpread: "poison-spread",
  ExhaustEnergy: "exhaust-energy",
  ChargeBlock: "charge-block",
  RetainedDraw: "retained-draw",
  TurnDraw: "turn-draw",
  EmptyEnergy: "empty-energy",
  HelpBlock: "help-block",
  LowHealthBlock: "low-health-block",
  FirstBlock: "first-block",
  HealthEnergy: "health-energy",
  ThirdAttack: "third-attack",
  DiscardDraw: "discard-draw",
  PoisonBlock: "poison-block",
  ExhaustDraw: "exhaust-draw",
  HelpDraw: "help-draw",
  RetainedDamage: "retained-damage",
  OpeningDraw: "opening-draw",
  TurnBlock: "turn-block",
  VictoryHeal: "victory-heal",
  OpeningEnergy: "opening-energy",
} as const;
export type RelicEffect = (typeof RelicEffect)[keyof typeof RelicEffect];
export interface RelicDefinition {
  id: string;
  name: string;
  text: string;
  rarity: "common" | "rare";
  character: "guardian" | "rogue" | "alchemist" | "channeler" | "shared";
  effect: RelicEffect;
  requiresTeam?: boolean;
  amount: number;
  tags: string[];
}
export interface OwnedRelic {
  relicId: string;
  acquiredFrom: string;
}
export interface EncounterRelics {
  definitions: RelicDefinition[];
  activeRelicIds: string[];
  turnUses: Record<string, number>;
  encounterUses: Record<string, number>;
}
export interface RelicReward {
  id: string;
  memberId: string;
  source: string;
  offers: string[];
  claimed: boolean;
  selected: string | null;
}
