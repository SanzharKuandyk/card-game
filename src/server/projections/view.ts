import { projectQuiz } from "../../domain/quizzes.ts";
import type {
  ActorIdentity,
  Combat,
  CombatView,
  CombatEvent,
  DomainContext,
  PlayerCard,
  Session,
  SessionView,
} from "../../shared/model.ts";
import { availableReward, currentCombat } from "../../domain/session.ts";
import { cardCost, definition } from "../../domain/combat.ts";
function boardLog(fight: Combat, members: Set<string>): CombatEvent[] {
  const visible: CombatEvent[] = [];
  const included = new Set<number>();
  const include = (event: CombatEvent) => {
    if (!included.has(event.id)) {
      visible.push(event);
      included.add(event.id);
    }
  };
  let play: CombatEvent | undefined;
  for (const event of fight.log) {
    if (event.kind === "play") {
      play = event;
      if (members.has(event.sourceId)) include(event);
      continue;
    }
    if (
      event.kind === "enemy" ||
      event.kind === "enemy-hit" ||
      event.kind === "poison"
    )
      play = undefined;
    if (members.has(event.sourceId) || members.has(event.targetId)) {
      if (play && (play.sourceId === event.sourceId || event.kind === "combo"))
        include(play);
      include(event);
    }
  }
  return visible
    .sort((a, b) => a.id - b.id)
    .slice(-40)
    .map((event) => structuredClone(event));
}
function combatView(
  s: Session,
  b: Combat,
  memberId: string | null,
): CombatView {
  const a = memberId ? b.actors[memberId] : undefined;
  const crewIds = a
    ? new Set(
        Object.values(b.actors)
          .filter((hero) => hero.crewId === a.crewId)
          .map((hero) => hero.memberId),
      )
    : null;
  const card = (c: Parameters<typeof definition>[1]): PlayerCard => ({
    ...c,
    definition: definition(s.content, c),
    cost: cardCost(s.content, c),
  });
  const p = b.predictionId
    ? s.content.predictions.find((p) => p.id === b.predictionId)
    : null;
  const prediction = p
    ? b.revealedPredictionIds.includes(p.id)
      ? structuredClone(p)
      : {
          id: p.id,
          title: p.title,
          rule: p.rule,
          steps: p.steps,
          choices: p.choices,
          source: p.source,
        }
    : null;
  return {
    id: b.id,
    openingRoom: b.openingRoom ?? false,
    kind: b.kind,
    turn: b.turn,
    phase: b.phase,
    enemies: structuredClone(b.enemies),
    intents: structuredClone(b.intents),
    actors: Object.values(b.actors)
      .filter((a) => !s.members[a.memberId]?.removed)
      .map((a) => ({
        relicState:
          memberId === a.memberId ? structuredClone(a.relicState) : undefined,
        memberId: a.memberId,
        crewId: a.crewId,
        name: s.members[a.memberId]!.name,
        character: s.members[a.memberId]!.hero.character,
        hp: a.hp,
        maxHp: a.maxHp,
        block: a.block,
        energy: a.energy,
        ended: a.ended,
        recovery: a.recovery,
        request: a.request,
        powers: { ...a.powers, "shelter-used": a.counters.shelter ?? 0 },
      })),
    hand: a ? a.hand.map(card) : [],
    handRevision: a?.handRevision ?? 0,
    choices: a ? [...a.hand, ...a.discard].map(card) : [],
    piles: {
      draw: a?.draw.length ?? 0,
      discard: a?.discard.length ?? 0,
      exhaust: a?.exhaust.length ?? 0,
    },
    log: b.log
      .filter(
        (event) =>
          !crewIds ||
          crewIds.has(event.sourceId) ||
          crewIds.has(event.targetId) ||
          (b.enemies.some((e) => e.id === event.sourceId) &&
            b.enemies.some((e) => e.id === event.targetId)),
      )
      .slice(-40),
    remainingMs: Math.max(0, b.deadline - s.activeMs),
    result: b.result,
    prediction,
    ownAnswer: memberId ? (b.answers[memberId] ?? null) : null,
    answered: Object.keys(b.answers).length,
    required: Object.keys(b.actors).length,
    reduction: b.reduction,
  };
}
export function project(
  s: Session,
  identity: ActorIdentity,
  context: DomainContext,
): SessionView {
  const memberId =
    identity.role === "player" ? (identity.memberId ?? null) : null;
  const m = memberId ? s.members[memberId] : null;
  const boss = s.bosses.find((b) => b.gate === s.activeBossGate);
  const crew = m?.crewId ? s.crews[m.crewId] : null;
  let b = currentCombat(s, memberId ?? undefined);
  if (identity.role !== "player" && !b && !boss)
    b =
      Object.values(s.crews).find((c) => c.progress.combat)?.progress.combat ??
      null;
  const reward = memberId ? availableReward(s, memberId) : undefined;
  const relicSafe =
    memberId &&
    !boss &&
    crew &&
    ["map", "reward", "rest", "event", "shop", "finished", "defeat"].includes(
      crew.progress.phase,
    );
  return {
    quiz: boss && !boss.combat ? projectQuiz(s, boss.quiz, memberId) : null,
    shop:
      memberId && !boss && crew?.progress.phase === "shop"
        ? structuredClone(crew.progress.shops?.[memberId] ?? null)
        : null,
    relics: s.content.relics,
    economy: s.content.economy,
    relicReward: relicSafe
      ? structuredClone(
          s.relicRewards.find((r) => r.memberId === memberId && !r.claimed) ??
            null,
        )
      : null,
    id: s.id,
    code: s.code,
    status: s.status,
    revision: s.revision,
    activeMs: s.activeMs,
    role: identity.role,
    memberId,
    crewId: m?.crewId ?? null,
    pendingTeam: m?.pendingTeam ? { ...m.pendingTeam } : undefined,
    crews: Object.values(s.crews).map((c) => {
      const fight = boss ? boss.combat : c.progress.combat;
      const members = new Set(
        c.members.filter((id) => !s.members[id]?.removed),
      );
      const projectBoard = (fight: Combat | null | undefined) =>
        fight &&
        (identity.role === "host" || identity.role === "projector") &&
        Object.values(fight.actors).some((actor) => actor.crewId === c.id)
          ? {
              id: fight.id,
              kind: fight.kind,
              result: fight.result,
              turn: fight.turn,
              phase: fight.phase,
              remainingMs: Math.max(0, fight.deadline - s.activeMs),
              enemies: structuredClone(fight.enemies),
              intents: fight.intents.map((intent) => ({
                ...intent,
                targets: intent.targets
                  .filter((t) => members.has(t.memberId))
                  .map((target) => ({ ...target })),
              })),
              actors: Object.values(fight.actors)
                .filter(
                  (a) =>
                    a.crewId === c.id &&
                    !s.members[a.memberId]?.removed &&
                    members.has(a.memberId),
                )
                .map((a) => ({
                  memberId: a.memberId,
                  crewId: c.id,
                  name: s.members[a.memberId]!.name,
                  character: s.members[a.memberId]!.hero.character,
                  hp: a.hp,
                  maxHp: a.maxHp,
                  block: a.block,
                  energy: a.energy,
                  ended: a.ended,
                  recovery: a.recovery,
                  request: a.request,
                  powers: { ...a.powers },
                  hand: a.hand.map((card) => ({
                    name: `${definition(s.content, card).name}${card.upgraded ? " +" : ""}`,
                    cost: cardCost(s.content, card),
                  })),
                })),
              log: boardLog(fight, members),
            }
          : null;
      return {
        id: c.id,
        name: c.name,
        colour: c.colour,
        symbol: c.symbol,
        nodeId: c.progress.nodeId,
        visited: [...c.progress.visited],
        row: c.progress.row,
        phase: c.progress.phase,
        members: c.members
          .filter((id) => !s.members[id]!.removed)
          .map((id) => ({
            id,
            name: s.members[id]!.name,
            online: context.presence.online.includes(id),
            hp: s.members[id]!.hero.hp,
            maxHp: 40,
            character: s.members[id]!.hero.character,
            pendingTeam: s.members[id]!.pendingTeam
              ? { ...s.members[id]!.pendingTeam }
              : undefined,
          })),
        votes: c.progress.votes,
        ...(identity.role === "projector" || identity.role === "host"
          ? {
              board: projectBoard(fight),
              boardEnding: !boss
                ? projectBoard(
                    s.bosses.findLast((entry) => entry.settled)?.combat,
                  )
                : null,
            }
          : {}),
      };
    }),
    unassigned: Object.values(s.members)
      .filter((m) => !m.crewId && !m.removed)
      .map((m) => ({ id: m.id, name: m.name })),
    map: s.map,
    progress: crew
      ? {
          ...structuredClone(crew.progress),
          shops:
            memberId && crew.progress.shops?.[memberId]
              ? { [memberId]: structuredClone(crew.progress.shops[memberId]!) }
              : undefined,
          combat: null,
        }
      : null,
    combat: b ? combatView(s, b, memberId) : null,
    // Keep the final accepted effects available through reward/route handoff.
    // Only enrolled players receive their own filtered encounter history.
    combatEndings: memberId
      ? [
          crew?.progress.combat,
          ...s.bosses.filter((boss) => boss.settled).map((boss) => boss.combat),
        ]
          .filter(
            (fight): fight is Combat =>
              !!fight?.result && !!fight.actors[memberId],
          )
          .map((fight) => {
            const { id, log, actors, enemies, result } = combatView(
              s,
              fight,
              memberId,
            );
            const visible = new Set(
              log.flatMap((event) => [event.sourceId, event.targetId]),
            );
            return {
              id,
              log,
              actors: actors.filter(
                (actor) =>
                  actor.crewId === crew?.id || visible.has(actor.memberId),
              ),
              enemies,
              result,
            };
          })
      : undefined,
    hero: m ? structuredClone(m.hero) : null,
    cards: s.content.cards,
    rewards: reward
      ? [
          {
            ...reward,
            cards: reward.offers.map((c) => ({
              ...c,
              definition: definition(s.content, c),
              cost: cardCost(s.content, c),
            })),
          },
        ]
      : [],
    boss: boss
      ? {
          gate: boss.gate,
          firstCrewId: boss.firstCrewId,
          remainingMs: Math.max(0, boss.quiz.deadline - s.activeMs),
          settled: boss.settled,
          result: boss.result,
          awards: boss.awards,
        }
      : null,
    bossHistory: s.bosses
      .filter((b) => b.settled)
      .map((b) => ({
        gate: b.gate,
        firstCrewId: b.firstCrewId,
        result: b.result,
        awards: b.awards,
      })),
    event: crew?.progress.eventId
      ? (s.content.events.find((e) => e.id === crew.progress.eventId) ?? null)
      : null,
    notice: s.notice,
    finishedReason: s.finishedReason,
  };
}
