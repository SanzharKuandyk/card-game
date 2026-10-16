import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
test("authored catalogue, starters, map gates and predictions are complete", async () => {
  const c = await loadContent();
  assert.equal(c.cards.filter((c) => c.rarity !== "token").length, 80);
  for (const deck of Object.values(c.starters)) assert.equal(deck.length, 10);
  for (let r = 1; r <= 15; r++) assert(c.map.some((n) => n.row === r));
  assert.deepEqual(
    c.map.filter((n) => n.kind === "boss").map((n) => n.row),
    [8, 15],
  );
  for (const p of c.predictions) {
    assert.equal(p.choices.length, 3);
    assert.equal(p.explanations.length, 3);
  }
  assert.equal(c.predictions.length, 12);
});
