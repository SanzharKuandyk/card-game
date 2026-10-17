import type { Combat, Enemy } from "../shared/model.ts";

export interface EnemyPlan {
  label: string;
  kind: "attack" | "guard" | "charge" | "summon";
  base: number;
  block: number;
  heavy: boolean;
  focus: boolean;
  detail: string;
}

// Frozen on the encounter. Old encounters keep their original patterns.
export function enemyPlan(b: Combat, e: Enemy): EnemyPlan | null {
  if (!e.tactics) return null;
  const n = Object.keys(b.actors).length;
  const cycle = b.turn % 3;
  const plan: EnemyPlan = {
    label: "Swipe",
    kind: "attack",
    base: 7,
    block: 0,
    heavy: false,
    focus: false,
    detail: "Attacks everyone shown above. Block and Weak reduce the hit.",
  };
  if (e.pattern === "support")
    return {
      ...plan,
      label: "Hype squad",
      kind: "charge",
      base: 0,
      detail:
        "Gives every other standing enemy 3 Strength. Defeat it first to stop the buff.",
    };
  if (e.pattern === "healer")
    return {
      ...plan,
      label: "Snack break",
      kind: "summon",
      base: 0,
      detail: `Restores up to ${4 * n} health to each other standing enemy. It cannot heal itself or revive enemies.`,
    };
  if (e.pattern === "sentinel") {
    const phase = b.turn % 4;
    if (phase === 2)
      return {
        ...plan,
        label: "Mine. All mine.",
        kind: "guard",
        base: 0,
        block: 10 * n,
        detail: `Gains ${10 * n} Block. Next turn: 20 damage per player before focus and escalation. Break all its Block during that turn to reduce the attack to 8.`,
      };
    if (phase === 3) {
      const broken = e.tactics.brokenTurn === b.turn;
      return {
        ...plan,
        label: broken ? "Dazed" : "Get off my sofa",
        base: broken ? 8 : 20,
        heavy: !broken,
        focus: true,
        detail: broken
          ? "Guard broken: the heavy attack became a weaker swipe."
          : "Remove all its Block this turn to reduce this attack. Poison bypasses Block but does not break it.",
      };
    }
    if (phase === 0)
      return {
        ...plan,
        label: "Bad mood",
        kind: "charge",
        base: 0,
        detail:
          "Gains 3 Strength for the rest of this fight. Prepare for stronger attacks.",
      };
    return { ...plan, label: "Paw sweep", base: 8 };
  }
  if (e.pattern === "guard") {
    if (cycle === 2)
      return {
        ...plan,
        label: "Not moving",
        kind: "guard",
        base: 0,
        block: 8 * n,
        detail: `Gains ${8 * n} Block. Next turn, break all its Block to turn its 14-damage heavy attack into a 5-damage swipe.`,
      };
    if (cycle === 0) {
      const broken = e.tactics.brokenTurn === b.turn;
      return {
        ...plan,
        label: broken ? "Off balance" : "Body slam",
        base: broken ? 5 : 14,
        heavy: !broken,
        focus: true,
        detail:
          "Break all its Block this turn to weaken this attack. Block removal cards also work.",
      };
    }
    return plan;
  }
  const boss = e.pattern === "colossus";
  const charging = boss ? cycle === 0 : cycle === 2;
  const heavy = boss ? cycle === 1 && b.turn > 1 : cycle === 0;
  const threshold = (boss ? 12 : 8) * n;
  if (charging) {
    const stopped = e.tactics.interruptedTurn === b.turn + 1;
    return {
      ...plan,
      label: stopped
        ? "Charge stopped"
        : `Wind-up ${e.tactics.damageThisTurn}/${threshold}`,
      kind: "charge",
      base: 0,
      block: stopped ? 0 : 3 * n,
      detail: `Deal ${threshold} health damage this turn to cancel next turn's heavy attack. Poison counts; damage absorbed by Block does not. ${e.tactics.damageThisTurn} dealt so far.`,
    };
  }
  if (heavy)
    return {
      ...plan,
      label:
        e.tactics.interruptedTurn === b.turn
          ? "Staggered"
          : boss
            ? "Personal space"
            : "Zoomies",
      kind: e.tactics.interruptedTurn === b.turn ? "charge" : "attack",
      base: e.tactics.interruptedTurn === b.turn ? 0 : boss ? 20 : 14,
      heavy: true,
      focus: true,
      detail:
        e.tactics.interruptedTurn === b.turn
          ? "Your damage during the wind-up cancelled this attack."
          : "Heavy attack. Use Block, Weak or help a threatened teammate.",
    };
  return { ...plan, label: boss ? "Back off" : "Swipe", base: boss ? 8 : 7 };
}

export function enemyDamaged(
  b: Combat,
  e: Enemy,
  actual: number,
  previousBlock: number,
): void {
  if (!e.tactics) return;
  e.tactics.damageThisTurn += actual;
  if (previousBlock > 0 && e.block === 0) e.tactics.brokenTurn = b.turn;
  const charging =
    e.pattern === "colossus"
      ? b.turn % 3 === 0
      : e.pattern === "raider" && b.turn % 3 === 2;
  const threshold =
    (e.pattern === "colossus" ? 12 : 8) * Object.keys(b.actors).length;
  if (
    charging &&
    e.tactics.damageThisTurn >= threshold &&
    e.tactics.interruptedTurn !== b.turn + 1
  ) {
    e.tactics.interruptedTurn = b.turn + 1;
  }
}
