import type { CombatEvent, CombatView } from "../shared/model.ts";

export type CombatScene = Pick<
  CombatView,
  "id" | "log" | "enemies" | "intents" | "actors" | "result"
> &
  Partial<Pick<CombatView, "phase" | "turn">>;
export interface CombatBeat<T extends CombatScene = CombatView> {
  key: string;
  title: string;
  sourceId: string;
  card?: CombatEvent["card"];
  events: CombatEvent[];
  before: T;
  after: T;
}

export type PlaybackStage = "card" | "windup" | "impact" | "exit";
export const beforeImpact = (stage: PlaybackStage) =>
  stage === "card" || stage === "windup";

export interface PlaybackItem {
  key: string;
  title: string;
  source: string;
  card?: CombatEvent["card"];
  details: string[];
}
export function playbackItem(
  beat: CombatBeat<CombatScene>,
  completed = false,
): PlaybackItem {
  const name = (id: string) =>
    beat.after.actors.find((a) => a.memberId === id)?.name ??
    beat.after.enemies.find((e) => e.id === id)?.name ??
    "Team";
  return {
    key: beat.key,
    title: beat.title,
    source: name(beat.sourceId),
    card: beat.card,
    details: [
      beat.card?.text ?? beat.title,
      ...(completed
        ? beat.events
            .filter((e) => e.kind !== "play")
            .map((e) => `${name(e.targetId)}: ${effectText(e)}`)
        : []),
    ],
  };
}

// One timing contract for phones and team tiles. Even reduced motion retains
// anticipation; it removes movement, not the order of cause and consequence.
export function beatTiming(backlog: number, reduced: boolean, enemy = false) {
  return {
    card: backlog > 2 ? 800 : 1000,
    windup: reduced ? 500 : enemy ? 950 : 350,
    impact: enemy ? 1300 : backlog > 2 ? 650 : 900,
    exit: reduced ? 0 : 250,
  };
}

function copyScene<T extends CombatScene>(scene: T): T {
  return {
    ...scene,
    actors: scene.actors.map((actor) => ({ ...actor })),
    enemies: scene.enemies.map((enemy) => ({ ...enemy })),
  };
}

function applyVisualEvent(scene: CombatScene, event: CombatEvent) {
  const target =
    scene.actors.find((a) => a.memberId === event.targetId) ??
    scene.enemies.find((e) => e.id === event.targetId);
  if (target && event.targetState) Object.assign(target, event.targetState);
  else if (target) {
    // Compatibility with already-saved events; no combat decisions are made here.
    if (["damage", "enemy-hit", "poison", "cost"].includes(event.kind)) {
      target.hp = Math.max(0, target.hp - event.amount);
      target.block = Math.max(0, target.block - (event.blocked ?? 0));
    } else if (event.kind === "block") target.block += event.amount;
    else if (event.kind === "heal")
      target.hp = Math.min(target.maxHp, target.hp + event.amount);
    else if (event.kind === "energy" && "energy" in target)
      target.energy += event.amount;
  }
  const source = scene.actors.find((a) => a.memberId === event.sourceId);
  if (source && event.kind === "play")
    source.energy =
      event.sourceEnergy ??
      Math.max(0, source.energy - (event.card?.cost ?? 0));
}

// Group one accepted card and all of its triggered effects into one visual beat.
// Enemy sweeps also stay together, so four teammates do not mean four pauses.
export function combatBeats<T extends CombatScene>(
  before: T,
  after: T,
  afterId: number,
): CombatBeat<T>[] {
  const beats: CombatBeat<T>[] = [];
  let current: CombatBeat<T> | undefined;
  for (const event of after.log.filter((entry) => entry.id > afterId)) {
    const enemy = after.enemies.some((entry) => entry.id === event.sourceId);
    if (
      !current ||
      event.kind === "play" ||
      (enemy && event.sourceId !== current.sourceId && event.kind !== "downed")
    ) {
      current = {
        key: `${after.id}:${event.id}`,
        title:
          event.kind === "play"
            ? event.text
            : enemy
              ? (after.intents.find(
                  (intent) => intent.enemyId === event.sourceId,
                )?.label ?? "Enemy turn")
              : event.kind === "poison"
                ? "Poison"
                : "Effect",
        sourceId: event.sourceId,
        card: event.card,
        events: [],
        before,
        after,
      };
      beats.push(current);
    }
    current.events.push(event);
  }
  // Each action gets its own state. A batched socket update must not reveal
  // damage from a later enemy while the first enemy is still winding up.
  const scene = copyScene(before);
  if (after.phase) scene.phase = after.phase;
  if (after.turn) scene.turn = after.turn;
  for (const [index, beat] of beats.entries()) {
    beat.before = copyScene(scene);
    for (const event of beat.events) applyVisualEvent(scene, event);
    beat.after = copyScene(scene);
    if (index === beats.length - 1) beat.after = after;
  }
  return beats;
}

export function effectText(event: CombatEvent): string {
  if (["damage", "enemy-hit", "poison"].includes(event.kind)) {
    // Older saved events have readable text but no structured absorption field.
    if (event.blocked === undefined) return event.text;
    if (event.amount === 0 && event.blocked > 0)
      return `${event.blocked} blocked · No health lost`;
    return `${event.blocked ? `${event.blocked} blocked · ` : ""}${event.amount} health lost${event.kind === "poison" ? " · Poison ignores Block" : ""}`;
  }
  return event.text;
}

export function impactFor(beat: Pick<CombatBeat, "events"> | null, id: string) {
  const effects =
    beat?.events.filter(
      (event) => event.targetId === id && event.kind !== "play",
    ) ?? [];
  const lost = effects
    .filter((e) => ["damage", "enemy-hit", "poison", "cost"].includes(e.kind))
    .reduce((sum, e) => sum + e.amount, 0);
  const blocked = effects.reduce((sum, e) => sum + (e.blocked ?? 0), 0);
  const gain = (kind: string) =>
    effects
      .filter((e) => e.kind === kind)
      .reduce((sum, e) => sum + e.amount, 0);
  const labels = [
    lost ? `−${lost} HP` : "",
    blocked ? `${blocked} blocked` : "",
    gain("block") ? `+${gain("block")} Block` : "",
    gain("heal") ? `+${gain("heal")} HP` : "",
    gain("energy") ? `+${gain("energy")} energy` : "",
  ];
  if (!labels.some(Boolean))
    labels.push(
      effects.find((e) =>
        ["status", "power", "setup", "combo", "draw"].includes(e.kind),
      )?.text ?? "",
    );
  return {
    lost,
    blocked,
    label: labels.filter(Boolean).join(" · "),
    tone: lost
      ? "damage"
      : blocked || gain("block")
        ? "block"
        : gain("heal")
          ? "heal"
          : "effect",
  };
}
