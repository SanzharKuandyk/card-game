export const keywords = [
  {
    id: "energy",
    label: "Energy",
    pattern: "energy",
    text: "Spend it to play cards. The number in a card's corner is its cost. You start each turn with 3 energy; card effects can give you more.",
  },
  {
    id: "block",
    label: "Block",
    pattern: "block",
    text: "Absorbs incoming damage before you lose health. It normally clears at the start of your next turn.",
  },
  {
    id: "damage",
    label: "Damage",
    pattern: "damage|attacks?",
    text: "Hurts the chosen enemy. Enemy Block absorbs damage first. Read the preview for the actual effect.",
  },
  {
    id: "health",
    label: "Health",
    pattern: "health|heals?",
    text: "At zero health you are downed and use recovery cards. Healing restores health, up to your maximum.",
  },
  {
    id: "draw",
    label: "Draw",
    pattern: "draw",
    text: "Take cards from your draw pile into your hand, up to 10. An empty draw pile shuffles your discard pile.",
  },
  {
    id: "discard",
    label: "Discard",
    pattern: "discard(?:ed|ing)?",
    text: "Put a card in the discard pile. It can return when that pile is shuffled. Card-triggered discards can activate discard bonuses; ending your turn does not.",
  },
  {
    id: "exhaust",
    label: "Exhaust",
    pattern: "exhaust(?:ed|ing)?",
    text: "Remove a card from this fight. Cards from your permanent deck return in the next fight.",
  },
  {
    id: "retain",
    label: "Retain",
    pattern: "retain(?:ed)?",
    text: "Keep this card in your hand when the turn ends, instead of discarding it.",
  },
  {
    id: "poison",
    label: "Poison",
    pattern: "poison",
    text: "At the enemy turn, deal damage equal to its Poison, ignoring Block. Then Poison decreases by 1.",
  },
  {
    id: "weak",
    label: "Weak",
    pattern: "weak",
    text: "The enemy deals 25% less attack damage. The number of remaining turns decreases after it acts.",
  },
  {
    id: "vulnerable",
    label: "Vulnerable",
    pattern: "vulnerable",
    text: "The enemy takes 50% more damage, except Poison. The number of remaining turns decreases after it acts.",
  },
  {
    id: "strength",
    label: "Strength",
    pattern: "strength",
    text: "Adds that much damage to each hit. It stays for this fight.",
  },
  {
    id: "charge",
    label: "Charge",
    pattern: "charge",
    text: "A stored bonus used by cards that mention Charge. Read each card to see how much it adds or spends.",
  },
  {
    id: "power",
    label: "Power",
    pattern: "powers?",
    text: "A lasting effect for this fight. Once played, the Power card does not go into the discard pile.",
  },
  {
    id: "copy",
    label: "Copy",
    pattern: "copy|copies",
    text: "Make a temporary version of a card. Follow its stated cost and restrictions. It does not join your permanent deck.",
  },
  {
    id: "repeat",
    label: "Repeat",
    pattern: "repeat(?:ed|s)?",
    text: "Make an attack happen again. The card tells you whose attack repeats and when.",
  },
  {
    id: "created",
    label: "Created cards",
    pattern: "create[sd]?|generated",
    text: "Cards made by an effect last only for this fight. They exhaust after being played and never join your permanent deck automatically.",
  },
] as const;
export type CardKeyword = (typeof keywords)[number];
const expression = new RegExp(
  `\\b(?:${keywords.map((k) => k.pattern).join("|")}|\\d+(?:%)?)\\b`,
  "gi",
);
export function cardTextParts(text: string) {
  const parts: { text: string; kind: string }[] = [];
  let start = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index > start)
      parts.push({ text: text.slice(start, match.index), kind: "" });
    const word = match[0];
    const keyword = keywords.find((k) =>
      new RegExp(`^(?:${k.pattern})$`, "i").test(word),
    );
    parts.push({ text: word, kind: keyword?.id ?? "number" });
    start = match.index + word.length;
  }
  if (start < text.length) parts.push({ text: text.slice(start), kind: "" });
  return parts;
}
export function keywordsIn(text?: string): readonly CardKeyword[] {
  if (!text) return keywords;
  const found = new Set(cardTextParts(text).map((part) => part.kind));
  return keywords.filter((keyword) => found.has(keyword.id));
}
