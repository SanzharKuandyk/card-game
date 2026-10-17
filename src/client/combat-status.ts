import type { Enemy } from "../shared/model.ts";
import { keywords } from "./card-keywords.ts";
export interface StatusBadge {
  id: string;
  label: string;
  text: string;
}
const term = (id: string) => keywords.find((item) => item.id === id)!.text;
export function enemyStatuses(enemy: Enemy): StatusBadge[] {
  const result: StatusBadge[] = [];
  for (const id of ["poison", "weak", "vulnerable", "strength"] as const) {
    if (enemy[id])
      result.push({
        id,
        label: `${keywords.find((k) => k.id === id)!.label} ${enemy[id]}`,
        text:
          id === "strength"
            ? `Adds ${enemy.strength} to this enemy's attack damage before it is split across targets. The intention already includes it.`
            : term(id),
      });
  }
  if (enemy.repeat)
    result.push({
      id: "repeat",
      label: "Repeat",
      text: enemy.repeat.allowSelf
        ? `Your next Attack repeats its original damage and enemy status values ${enemy.repeat.amount} time(s). Other effects and resource costs do not repeat.`
        : `The next teammate Attack repeats its original damage and enemy status values ${enemy.repeat.amount} time(s). The player who set it up cannot trigger it. Other effects and resource costs do not repeat.`,
    });
  return result;
}
const powers: Record<string, [string, (n: number) => string]> = {
  "block-bank": [
    "Stored Block",
    (n) =>
      `Keep up to ${n} Block at turn start. Uses the higher limit when combined with Shield Spool.`,
  ],
  "blood-block": [
    "Blood Block",
    (n) => `The first health-spending card each turn gives ${n} Block.`,
  ],
  "discard-energy": [
    "Discard energy",
    (n) => `Your first deliberate discard each turn gives ${n} energy.`,
  ],
  "exhaust-energy": [
    "Exhaust energy",
    (n) => `Your first Exhaust each turn gives ${n} energy.`,
  ],
  "start-block": [
    "Turn Block",
    (n) => `Gain ${n} Block at the start of your next turns.`,
  ],
  "energy-debt": [
    "Energy owed",
    (n) => `Start your next turn with ${n} less energy, then this clears.`,
  ],
  strength: [
    "Strength",
    (n) => `Each damage hit gains ${n} damage for this fight.`,
  ],
  charge: [
    "Charge",
    (n) =>
      `${n} stored Charge. Cards that mention Charge use it; each card says whether it is spent.`,
  ],
  "keep-block": [
    "Keep Block",
    () => "Your Block stays when your next turn starts. Lasts this fight.",
  ],
  "double-first-block": [
    "Double Block",
    () => "Your first Block gain each turn is doubled. Lasts this fight.",
  ],
  thorns: [
    "Thorns",
    (n) =>
      `When an enemy attacks you, deal ${n} damage back, even if you Block the hit.`,
  ],
  "hp-strength": [
    "Blood strength",
    (n) =>
      `Whenever a card spends your health, gain ${n} Strength for this fight.`,
  ],
  "hp-draw": [
    "Blood draw",
    (n) =>
      `The first time a card spends your health each turn, draw ${n} cards.`,
  ],
  "block-damage": [
    "Block damage",
    (n) =>
      `Whenever you gain Block, deal ${n} damage to the first standing enemy.`,
  ],
  rhythm: [
    "Rhythm",
    (n) => `Every third card you play in a turn gives you ${n} Block.`,
  ],
  "spark-bonus": [
    "Spark damage",
    (n) => `Your Spark attacks gain ${n} damage per hit for this fight.`,
  ],
  "discard-draw": [
    "Discard draw",
    (n) =>
      `Your first deliberate discard each turn draws ${n} cards. Ending your turn does not trigger it.`,
  ],
  "attack-chain": [
    "Attack chain",
    (n) =>
      `Every fifth Attack you play in a turn deals ${n} damage to all enemies.`,
  ],
  "exhaust-block": [
    "Exhaust Block",
    (n) => `Whenever you Exhaust a card, gain ${n} Block.`,
  ],
  "exhaust-draw": [
    "Exhaust draw",
    (n) => `Whenever you Exhaust a card, draw ${n} cards.`,
  ],
  "poison-mist": [
    "Poison mist",
    (n) =>
      `At the start of your turn, apply ${n} Poison to every standing enemy.`,
  ],
  "scrap-damage": [
    "Scrap damage",
    (n) => `Whenever you create Scrap, deal ${n} damage to all enemies.`,
  ],
  "charge-start": [
    "Build Charge",
    (n) => `Gain ${n} Charge at the start of each turn.`,
  ],
  echo: [
    "Echo",
    () =>
      "Your first Attack each turn repeats its damage and enemy status effects. The repeat does not repeat itself.",
  ],
  "help-draw": [
    "Help draw",
    (n) =>
      `The first card you play on another player each turn draws you ${n} cards.`,
  ],
};
export function heroStatuses(values: Record<string, number>): StatusBadge[] {
  return Object.entries(values).flatMap(([id, n]) => {
    const power = powers[id];
    return n && power
      ? [
          {
            id,
            label: `${power[0]}${["keep-block", "double-first-block", "echo"].includes(id) ? "" : ` ${n}`}`,
            text: power[1](n),
          },
        ]
      : [];
  });
}
