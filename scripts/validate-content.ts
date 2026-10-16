import { loadContent } from "../src/server/content/load.ts";
const c = await loadContent();
console.log(
  `Content valid: ${c.cards.filter((c) => c.rarity !== "token").length} cards, ${c.quizzes.length} Week 6 questions, ${c.relics.length} relics, 15 shared map rows.`,
);
