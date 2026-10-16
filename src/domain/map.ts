import type { MapNode, Room } from "../shared/model.ts";
import { nextRandom, seedFrom } from "./random.ts";
export const BossGates = [8, 15] as const;
export const MAP_ROWS = 15;
// One graph per session. Edge constraints create alternate routes without dead ends.
export function generateMap(seed: number): MapNode[] {
  const rng = { rng: seedFrom(`${seed}:shared-map-v2`) };
  const nodes: MapNode[] = [];
  for (let row = 1; row <= MAP_ROWS; row++) {
    const gate = BossGates.includes(row as 8 | 15);
    const count = gate || row === 1 ? 1 : 5;
    const offset = Math.floor(nextRandom(rng) * 5);
    for (let lane = 0; lane < count; lane++) {
      let kind: Room = "battle";
      if (gate) kind = "boss";
      else if (row > 2) {
        const choices: Room[] =
          row === 7 || row === 14
            ? ["rest", "elite", "battle", "shop", "battle"]
            : row === 3 || row === 6 || row === 10 || row === 13
              ? ["shop", "battle", "elite", "rest", "battle"]
              : ["battle", "elite", "event", "battle", "rest"];
        kind = choices[(lane + offset) % choices.length]!;
      }
      if ([4, 6, 9, 12].includes(row) && !gate)
        kind = (lane + offset) % 4 === 0 ? "elite" : "battle";
      // Rest, merchant and elite rooms never repeat along an immediate edge.
      if (
        ["rest", "shop", "elite"].includes(kind) &&
        nodes.some(
          (n) =>
            n.row === row - 1 &&
            Math.abs(n.lane - lane) <= 1 &&
            n.kind === kind,
        )
      )
        kind = "battle";
      const pressure =
        kind === "elite"
          ? lane % 2
            ? 1.25
            : 1.1
          : kind === "battle" && row > 2
            ? nextRandom(rng) < 0.35
              ? 1.2
              : 1.05
            : 1;
      nodes.push({
        id: `r${row}-${lane}`,
        row,
        lane: count === 1 ? 2 : lane,
        kind,
        next: [],
        pressure,
        risk:
          kind === "elite"
            ? "severe"
            : pressure > 1.1
              ? "dangerous"
              : "standard",
      });
    }
  }
  for (const node of nodes) {
    const next = nodes.filter((n) => n.row === node.row + 1);
    const sameRow = nodes.filter((n) => n.row === node.row);
    node.next = next
      .filter(
        (n) =>
          next.length === 1 ||
          sameRow.length === 1 ||
          Math.abs(n.lane - node.lane) <= 1,
      )
      .map((n) => n.id);
  }
  validateMap(nodes);
  return nodes;
}
export function validateMap(nodes: MapNode[]): void {
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error("Duplicate map node");
  const reached = new Set(nodes.filter((n) => n.row === 1).map((n) => n.id));
  for (let row = 1; row <= MAP_ROWS; row++) {
    const current = nodes.filter((n) => n.row === row);
    if (!current.length || current.some((n) => !reached.has(n.id)))
      throw new Error(`Unreachable row ${row}`);
    if (
      BossGates.includes(row as 8 | 15) &&
      (current.length !== 1 || current[0]!.kind !== "boss")
    )
      throw new Error("Invalid boss gate");
    for (const n of current) {
      if (row < MAP_ROWS && !n.next.length) throw new Error("Map dead end");
      for (const id of n.next) {
        if (nodes.find((t) => t.id === id)?.row !== row + 1)
          throw new Error("Map skips a row");
        reached.add(id);
      }
    }
  }
}
