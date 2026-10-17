import { grantReward } from "./rewards.ts";
export { grantReward, eligibleCards } from "./rewards.ts";
import { generateMap, MAP_ROWS, BossGates } from "./map.ts";
import { grantGold } from "./economy.ts";
import { openShop, shopCommand, closeShops } from "./shops.ts";
import { createQuiz, answerQuiz, advanceQuiz } from "./quizzes.ts";
import { grantRelicReward, claimRelic, victoryRelics } from "./relics.ts";
import type {
  ActorIdentity,
  BossRecord,
  Character,
  Combat,
  Command,
  Content,
  Crew,
  DomainContext,
  Envelope,
  Hero,
  Reward,
  Session,
} from "../shared/model.ts";
import {
  beginTurn,
  createCombat,
  definition,
  enemyPhase,
  makeIntents,
  playCard,
  preview,
  recoveryPlay,
} from "./combat.ts";
import { nextRandom, seedFrom, shuffle } from "./random.ts";
export function createSession(
  id: string,
  code: string,
  seed: number,
  content: Content,
): Session {
  const s: Session = {
    id,
    code,
    map: generateMap(seed, content.depth?.fixedEncounters),
    economyGrants: {},
    relicRewards: [],
    rulesVersion: "cards-v2",
    status: "lobby",
    revision: 0,
    activeMs: 0,
    seed,
    rng: seed,
    content: structuredClone(content),
    members: {},
    crews: {},
    rewards: [],
    bosses: [],
    activeBossGate: null,
    predictionOrder: [],
    notice: "",
    finishedReason: null,
  };
  const ordered = (["movement", "physics", "collision"] as const).map((topic) =>
    shuffle(
      content.quizzes.filter((q) => q.topic === topic).map((q) => q.id),
      s,
    ),
  );
  s.predictionOrder = [
    ordered[0]![0]!,
    ordered[1]![0]!,
    ordered[2]![0]!,
    shuffle(
      content.quizzes
        .map((q) => q.id)
        .filter(
          (id) =>
            ![ordered[0]![0], ordered[1]![0], ordered[2]![0]].includes(id),
        ),
      s,
    )[0]!,
  ];
  return s;
}
export function makeHero(id: string, character: Character, s: Session): Hero {
  return {
    memberId: id,
    character,
    gold: s.content.economy.starting,
    relics: [],
    deckRevision: 0,
    removalCount: 0,
    hp: 40,
    maxHp: 40,
    deck: s.content.starters[character].map((cardId, i) => ({
      uid: `${id}:starter:${i}`,
      cardId,
      upgraded: false,
    })),
  };
}
export function addMember(s: Session, id: string, name: string): void {
  if (Object.keys(s.members).length >= 80) throw new Error("Session is full");
  if (s.status === "finished") throw new Error("Session has ended");
  s.members[id] = {
    id,
    name,
    crewId: null,
    hero: makeHero(id, "guardian", s),
    removed: false,
    joinedAt: s.activeMs,
  };
}
export function currentCombat(s: Session, memberId?: string): Combat | null {
  if (s.activeBossGate !== null)
    return s.bosses.find((b) => b.gate === s.activeBossGate)?.combat ?? null;
  const m = memberId ? s.members[memberId] : undefined;
  return m?.crewId && s.crews[m.crewId]?.progress.phase === "battle"
    ? (s.crews[m.crewId]?.progress.combat ?? null)
    : null;
}
function required(ids: string[], context: DomainContext): string[] {
  return ids.filter(
    (id) =>
      context.presence.online.includes(id) ||
      (context.presence.absentFor[id] ?? Infinity) < 15000,
  );
}
function syncHealth(s: Session, b: Combat): void {
  for (const a of Object.values(b.actors))
    if (s.members[a.memberId]) s.members[a.memberId]!.hero.hp = a.hp;
}
function crewRoster(s: Session, crew: Crew, context: DomainContext): string[] {
  return crew.members.filter(
    (id) => !s.members[id]!.removed && required([id], context).length > 0,
  );
}
function enterNode(
  s: Session,
  crew: Crew,
  nodeId: string,
  context: DomainContext,
): void {
  const p = crew.progress;
  const node = s.map.find((n) => n.id === nodeId)!;
  p.nodeId = node.id;
  p.routeNote = undefined;
  p.row = node.row;
  p.votes = {};
  p.voteDeadline = null;
  p.choices = {};
  p.combat = null;
  p.roster = crewRoster(s, crew, context);
  if (!p.roster.length) throw new Error("A player must be connected");
  if (node.kind === "boss") {
    const settled = s.bosses.find((b) => b.gate === node.row && b.settled);
    if (settled) {
      finishRoom(crew);
      return;
    }
    triggerBoss(s, node.row, crew.id, context);
    return;
  }
  if (node.kind === "battle" || node.kind === "elite") {
    p.phase = "battle";
    const budget =
      node.row === 1
        ? 20
        : node.kind === "elite"
          ? node.row < BossGates[0]
            ? 50
            : 60
          : node.row < BossGates[0]
            ? 32
            : 42;
    const pattern =
      node.kind === "elite"
        ? "elite"
        : node.row > BossGates[0]
          ? "late"
          : "raider";
    p.combat = createCombat(
      `${s.id}:${crew.id}:${node.id}:${p.defeats}`,
      "route",
      p.roster.map((id) => ({ hero: s.members[id]!.hero, crewId: crew.id })),
      budget * (node.pressure ?? 1),
      pattern,
      seedFrom(`${s.seed}:${node.id}`),
      s.activeMs,
      s.content,
      {
        encounterId: node.encounterId,
        openingRoom:
          node.row === 1 && s.content.timing.openingTurn !== undefined,
      },
    );
  } else if (node.kind === "shop") {
    p.phase = "shop";
    openShop(s, crew);
  } else if (node.kind === "rest") p.phase = "rest";
  else {
    p.phase = "event";
    p.eventId =
      s.content.events[
        Math.floor(
          nextRandom({ rng: seedFrom(`${s.seed}:${node.id}:event`) }) *
            s.content.events.length,
        )
      ]!.id;
  }
}
function finishRoom(crew: Crew): void {
  const p = crew.progress;
  if (p.nodeId && !p.visited.includes(p.nodeId)) p.visited.push(p.nodeId);
  closeShops(p.shops);
  p.phase = p.row >= MAP_ROWS ? "finished" : "map";
  p.combat = null;
  p.votes = {};
  p.voteDeadline = null;
  p.choices = {};
}
function settleRoute(s: Session, crew: Crew): void {
  const p = crew.progress;
  const b = p.combat!;
  syncHealth(s, b);
  if (b.result === "victory") {
    p.phase = "reward";
    const node = s.map.find((n) => n.id === p.nodeId)!;
    for (const id of p.roster) {
      grantReward(s, id, `room:${crew.id}:${node.id}`, node.kind === "elite");
      grantGold(
        s,
        id,
        `room:${crew.id}:${node.id}`,
        node.kind === "elite"
          ? s.content.economy.elite
          : s.content.economy.battle,
      );
      victoryRelics(s, id, `room:${crew.id}:${node.id}`);
      if (node.kind === "elite")
        grantRelicReward(s, id, `room:${crew.id}:${node.id}`);
    }
  } else if (b.result === "defeat") {
    p.phase = "defeat";
    p.defeats++;
  } else finishRoom(crew);
}
export function triggerBoss(
  s: Session,
  gate: number,
  firstCrewId: string | null,
  context: DomainContext,
): void {
  if (s.activeBossGate !== null) throw new Error("A boss is already active");
  if (s.bosses.some((b) => b.gate === gate))
    throw new Error("That boss has already been called");
  if (!BossGates.includes(gate as 8 | 15)) throw new Error("Unknown boss gate");
  if (
    gate === BossGates[1] &&
    !s.bosses.some((b) => b.gate === BossGates[0] && b.settled)
  )
    throw new Error("Finish the middle boss first");
  const enrolled = Object.values(s.members)
    .filter((m) => m.crewId && !m.removed && required([m.id], context).length)
    .map((m) => m.id);
  if (!enrolled.length) throw new Error("No teams are connected");
  const suspended = Object.fromEntries(
    Object.values(s.crews).map((c) => [c.id, structuredClone(c.progress)]),
  );
  const boss: BossRecord = {
    quiz: createQuiz(s, gate, firstCrewId, enrolled),
    mitigation: {},
    gate,
    startedAt: s.activeMs,
    firstCrewId,
    enrolled,
    suspended,
    combat: null,
    countdown: s.activeMs + s.content.timing.intro,
    settled: false,
    result: null,
    awards: [],
  };
  s.bosses.push(boss);
  s.activeBossGate = gate;
  s.notice = firstCrewId
    ? `${s.crews[firstCrewId]!.name} reached the boss first`
    : "Boss called";
  if (firstCrewId)
    for (const id of s.crews[firstCrewId]!.progress.roster)
      grantReward(s, id, `first:${gate}`, true);
}
function settleBoss(s: Session, boss: BossRecord): void {
  if (boss.settled) return;
  const b = boss.combat;
  boss.result = b?.result ?? "skipped";
  boss.settled = true;
  if (b) {
    syncHealth(s, b);
    const crews = Object.values(s.crews).filter((c) =>
      boss.enrolled.some((id) => s.members[id]!.crewId === c.id),
    );
    for (const [name, key] of [
      ["Damage", "damage"],
      ["Protection", "protection"],
      ["Teamwork", "helped"],
    ] as const) {
      const values = crews.map((c) => {
        const ids = boss.enrolled.filter(
          (id) => s.members[id]!.crewId === c.id,
        );
        const value =
          key === "helped"
            ? new Set(ids.flatMap((id) => b.contributions[id]?.helped ?? []))
                .size / ids.length
            : ids.reduce(
                (sum, id) => sum + (b.contributions[id]?.[key] ?? 0),
                0,
              ) / ids.length;
        return { id: c.id, value };
      });
      const max = Math.max(0, ...values.map((v) => v.value));
      if (max > 0)
        boss.awards.push({
          name,
          crewIds: values.filter((v) => v.value === max).map((v) => v.id),
          value: max,
        });
    }
  }
  if (boss.result === "victory")
    for (const id of boss.enrolled) {
      grantReward(s, id, `boss:${boss.gate}`, true);
      grantGold(s, id, `boss:${boss.gate}`, s.content.economy.boss);
    }
  for (const [crewId, progress] of Object.entries(boss.suspended)) {
    const crew = s.crews[crewId];
    if (!crew) continue;
    crew.progress = structuredClone(progress);
    if (crew.progress.combat)
      crew.progress.combat.deadline += s.activeMs - boss.startedAt;
    if (crew.progress.voteDeadline !== null)
      crew.progress.voteDeadline += s.activeMs - boss.startedAt;
    if (crew.progress.combat) {
      for (const a of Object.values(crew.progress.combat.actors)) {
        a.hp = s.members[a.memberId]!.hero.hp;
        if (a.hp === 0) {
          a.recovery = true;
          a.ended = false;
        }
      }
    }
    if (
      crew.progress.row === boss.gate &&
      s.map.find((n) => n.id === crew.progress.nodeId)?.kind === "boss"
    )
      finishRoom(crew);
  }
  s.activeBossGate = null;
  s.notice = `Boss ${boss.result}`;
  if (boss.gate === BossGates[1]) {
    s.status = "finished";
    s.finishedReason = `Final boss ${boss.result}`;
  }
}
function validateDeckChoice(
  hero: Hero,
  uid: string | undefined,
  action: "upgrade" | "remove",
  s: Session,
): void {
  const card = hero.deck.find((c) => c.uid === uid);
  if (!card) throw new Error("Choose a card");
  if (action === "upgrade") {
    if (card.upgraded) throw new Error("That card is already upgraded");
    card.upgraded = true;
  } else {
    if (hero.deck.length <= 6) throw new Error("Keep at least 6 cards");
    if (
      ["strike", "guard"].includes(card.cardId) &&
      hero.deck.filter((c) => c.cardId === card.cardId).length <= 1
    )
      throw new Error("Keep one Strike and one Guard");
    hero.deck = hero.deck.filter((c) => c.uid !== uid);
  }
  hero.deckRevision++;
  if (!s.content.cards.some((c) => c.id === card.cardId))
    throw new Error("Unknown card");
}
function safeReward(s: Session, memberId: string, reward: Reward): boolean {
  const boss = s.bosses.find((b) => b.gate === s.activeBossGate);
  if (boss && !boss.combat)
    return (
      boss.quiz.stage === "reward" &&
      (reward.source.startsWith("first:") ||
        reward.source === `quiz:${boss.gate}`)
    );
  if (boss) return false;
  const member = s.members[memberId]!;
  return (
    s.status === "lobby" ||
    s.status === "finished" ||
    (!!member.crewId &&
      ["map", "reward", "rest", "event", "finished", "defeat", "shop"].includes(
        s.crews[member.crewId]!.progress.phase,
      ))
  );
}
export function applyCommand(
  s: Session,
  identity: ActorIdentity,
  envelope: Envelope,
  context: DomainContext,
): { message: string; preview?: ReturnType<typeof preview> } {
  const cmd = envelope.command;
  if (cmd.kind === "host") {
    if (identity.role !== "host") throw new Error("Host only");
    hostCommand(s, cmd, context);
    return { message: "Saved" };
  }
  if (identity.role !== "player" || !identity.memberId)
    throw new Error("Read-only view");
  const m = s.members[identity.memberId];
  if (!m || m.removed) throw new Error("Player is not active");
  if (cmd.kind === "takeover") return { message: "Control transferred" };
  if (cmd.kind === "team") {
    if (s.activeBossGate !== null)
      throw new Error("Choose a team after the boss");
    if (m.crewId) throw new Error("Already in a team");
    let crew = cmd.crewId ? s.crews[cmd.crewId] : undefined;
    if (cmd.crewId && !crew) throw new Error("Team not found");
    if (crew && crew.members.length >= 4) throw new Error("Team is full");
    if (!crew) {
      const n = Object.keys(s.crews).length;
      const id = `team-${n + 1}`;
      crew = {
        id,
        name: cmd.name ?? `Team ${n + 1}`,
        colour: [
          "#ca613c",
          "#397b72",
          "#685baf",
          "#bd861f",
          "#ae4d77",
          "#4179ae",
        ][n % 6]!,
        symbol: ["◆", "●", "▲", "■"][n % 4]!,
        members: [],
        progress: {
          nodeId: null,
          row: 0,
          phase: "map",
          roster: [],
          votes: {},
          voteDeadline: null,
          visited: [],
          choices: {},
          combat: null,
          defeats: 0,
          eventId: null,
        },
      };
      s.crews[id] = crew;
    }
    m.crewId = crew.id;
    m.hero = makeHero(m.id, cmd.character, s);
    crew.members.push(m.id);
    return { message: "Joined team" };
  }
  if (
    s.status !== "running" &&
    !(["reward", "relic:claim"].includes(cmd.kind) && s.status === "finished")
  )
    throw new Error(
      s.status === "paused"
        ? "Paused"
        : s.status === "lobby"
          ? "Waiting to start"
          : "Session ended",
    );
  if (!m.crewId) throw new Error("Choose a team");
  const crew = s.crews[m.crewId]!;
  if (cmd.kind === "quiz:answer") {
    answerQuiz(
      s,
      m.id,
      cmd.quizId,
      cmd.questionId,
      cmd.phaseRevision,
      cmd.optionId,
    );
    return { message: "Answer saved" };
  }
  if (cmd.kind === "relic:claim") {
    if (
      s.activeBossGate !== null ||
      ![
        "map",
        "reward",
        "rest",
        "event",
        "shop",
        "finished",
        "defeat",
      ].includes(crew.progress.phase)
    )
      throw new Error("Claim after this fight");
    claimRelic(s, m.id, cmd.rewardId, cmd.relicId);
    return { message: "Saved" };
  }
  if (
    cmd.kind === "shop:buy" ||
    cmd.kind === "shop:remove" ||
    cmd.kind === "shop:ready"
  ) {
    shopCommand(s, m.id, cmd);
    return { message: "Saved" };
  }
  if (cmd.kind === "reward") {
    const reward = s.rewards.find(
      (r) => r.id === cmd.rewardId && r.memberId === m.id,
    );
    if (!reward) throw new Error("Reward not found");
    if (reward.claimed) throw new Error("Reward already decided");
    if (!safeReward(s, m.id, reward))
      throw new Error("Finish this fight before changing your deck");
    const card = cmd.cardUid
      ? reward.offers.find((c) => c.uid === cmd.cardUid)
      : null;
    if (cmd.cardUid && !card) throw new Error("Choose an offered card");
    if (card) {
      m.hero.deck.push({ ...card });
      m.hero.deckRevision++;
    }
    reward.claimed = true;
    if (crew.progress.phase === "reward")
      crew.progress.choices[m.id] = "reward";
    reward.selected = card?.cardId ?? null;
    if (
      crew.progress.phase === "reward" &&
      crew.progress.roster.every(
        (id) =>
          !s.rewards.some(
            (r) =>
              r.memberId === id &&
              !r.claimed &&
              r.source.startsWith(`room:${crew.id}:${crew.progress.nodeId}`),
          ),
      )
    )
      if (
        !s.relicRewards.some(
          (r) =>
            pRosterHas(crew, r.memberId) &&
            !r.claimed &&
            r.source === `room:${crew.id}:${crew.progress.nodeId}`,
        )
      )
        finishRoom(crew);
    return {
      message: card ? `${definition(s.content, card).name} added` : "Skipped",
    };
  }
  if (cmd.kind === "travel") {
    if (s.activeBossGate !== null) throw new Error("Boss is starting");
    if (crew.progress.phase !== "map")
      throw new Error("Finish this room first");
    const node = s.map.find((n) => n.id === cmd.nodeId);
    const allowed = crew.progress.nodeId
      ? s.map.find((n) => n.id === crew.progress.nodeId)!.next
      : s.map.filter((n) => n.row === 1).map((n) => n.id);
    if (!node || !allowed.includes(node.id))
      throw new Error("Choose a connected room");
    crew.progress.roster = crewRoster(s, crew, context);
    crew.progress.votes[m.id] = node.id;
    crew.progress.voteDeadline ??= s.activeMs + s.content.timing.vote;
    resolveVote(s, crew, context, false);
    return { message: "Vote saved" };
  }
  if (s.activeBossGate !== null && !currentCombat(s, m.id))
    throw new Error("Boss is starting");
  if (cmd.kind === "rest" || cmd.kind === "event") {
    if (s.activeBossGate !== null)
      throw new Error("Return to this room after the boss");
    const p = crew.progress;
    if (!p.roster.includes(m.id))
      throw new Error("You join at the next encounter");
    if (p.choices[m.id]) throw new Error("Choice already saved");
    if (cmd.kind === "rest") {
      if (p.phase !== "rest") throw new Error("Not at a rest site");
      if (cmd.action === "heal") m.hero.hp = Math.min(40, m.hero.hp + 12);
      else validateDeckChoice(m.hero, cmd.cardUid, cmd.action, s);
      p.choices[m.id] = cmd.action;
    } else {
      if (p.phase !== "event") throw new Error("Not at an event");
      const event = s.content.events.find((e) => e.id === p.eventId)!;
      const choice = event.choices[cmd.choice];
      if (!choice) throw new Error("Choose an option");
      if (choice.effect === "heal")
        m.hero.hp = Math.min(40, m.hero.hp + choice.amount);
      else if (choice.effect === "card")
        grantReward(s, m.id, `event:${crew.id}:${p.nodeId}`, false, true);
      else validateDeckChoice(m.hero, cmd.cardUid, choice.effect, s);
      p.choices[m.id] = String(cmd.choice);
    }
    if (p.roster.every((id) => p.choices[id])) finishRoom(crew);
    return { message: "Saved" };
  }
  if (cmd.kind === "retry") {
    if (s.activeBossGate !== null || crew.progress.phase !== "defeat")
      throw new Error("Retry is not available");
    for (const id of crew.progress.roster) s.members[id]!.hero.hp = 40;
    enterNode(s, crew, crew.progress.nodeId!, context);
    return { message: "Retry" };
  }
  const b = currentCombat(s, m.id);
  if (!b) throw new Error("No active fight");
  if (envelope.encounterId !== b.id)
    throw new Error("Fight changed. Your screen has refreshed.");
  const a = b.actors[m.id];
  if (!a) throw new Error("You are watching this fight");
  if (cmd.kind === "preview") {
    if (a.recovery)
      return {
        message:
          cmd.cardUid === "rally"
            ? "Restore 12 health. Normal cards next turn."
            : "Give a standing teammate 4 Block.",
      };
    return {
      message: "Preview",
      preview: preview(
        b,
        m.id,
        cmd.cardUid,
        cmd.targetId,
        cmd.choiceUid,
        s.content,
      ),
    };
  }
  if (cmd.kind === "play") {
    if (cmd.handRevision !== a.handRevision)
      throw new Error("Hand changed. Choose again.");
    if (a.recovery) {
      if (!["rally", "shelter"].includes(cmd.cardUid))
        throw new Error("Choose Rally or Shelter");
      recoveryPlay(
        b,
        m.id,
        cmd.cardUid === "rally" ? "rally" : "shelter",
        cmd.targetId,
      );
    } else
      playCard(b, m.id, cmd.cardUid, cmd.targetId, cmd.choiceUid, s.content);
    syncHealth(s, b);
  } else if (cmd.kind === "end-turn") {
    if (b.phase !== "player") throw new Error("Wait for your turn");
    a.ended = cmd.ended;
  } else if (cmd.kind === "request") {
    a.request = cmd.text;
  } else if (cmd.kind === "prediction") {
    if (b.phase !== "prediction" || !b.predictionId)
      throw new Error("Prediction is closed");
    if (b.answers[m.id] !== undefined) throw new Error("Answer already saved");
    b.answers[m.id] = cmd.choice;
  } else throw new Error("Action is not available");
  return { message: "Saved" };
}
function resolveVote(
  s: Session,
  c: Crew,
  context: DomainContext,
  expired: boolean,
): void {
  const votes = c.progress.votes;
  const participants = [
    ...new Set([
      ...required(c.progress.roster, context),
      ...Object.keys(votes),
    ]),
  ];
  if (!participants.length) return;
  const counts = Object.values(votes).reduce<Record<string, number>>((r, v) => {
    r[v] = (r[v] ?? 0) + 1;
    return r;
  }, {});
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return;
  let target: string | undefined;
  if (ranked[0]![1] > participants.length / 2) target = ranked[0]![0];
  else if (expired) {
    const leading = ranked.filter((r) => r[1] === ranked[0]![1]);
    target = leading[Math.floor(nextRandom(s) * leading.length)]![0];
    s.notice = `${c.name}: tied vote selected ${s.map.find((n) => n.id === target)!.kind}`;
  }
  if (target) {
    enterNode(s, c, target, context);
    if (expired && ranked[0]![1] <= participants.length / 2)
      c.progress.routeNote = `Tied vote: ${s.map.find((n) => n.id === target)!.kind} selected by the seeded draw.`;
  }
}
export function tick(
  s: Session,
  elapsed: number,
  context: DomainContext,
): void {
  if (s.status !== "running") return;
  if (
    s.activeBossGate !== null &&
    !required(
      s.bosses.find((b) => b.gate === s.activeBossGate)!.enrolled,
      context,
    ).length
  )
    return;
  if (!context.presence.hostOnline) return;
  if (
    !context.presence.online.some(
      (id) => s.members[id]?.crewId && !s.members[id]?.removed,
    )
  )
    return;
  s.activeMs += elapsed;
  if (s.activeBossGate !== null) {
    const boss = s.bosses.find((b) => b.gate === s.activeBossGate)!;
    if (!boss.combat) {
      advanceQuiz(s, boss);
      const waiting = required(boss.enrolled, context);
      if (
        boss.quiz.stage === "reward" &&
        s.activeMs - boss.quiz.startedAt >= 8000 &&
        waiting.length &&
        waiting.every(
          (id) =>
            !s.rewards.some(
              (r) =>
                r.memberId === id &&
                !r.claimed &&
                (r.source === `quiz:${boss.gate}` ||
                  r.source === `first:${boss.gate}`),
            ),
        )
      ) {
        boss.quiz.stage = "complete";
        boss.quiz.phaseRevision++;
      }
      if (boss.quiz.stage === "complete" || boss.quiz.stage === "skipped") {
        boss.combat = createCombat(
          `${s.id}:boss:${boss.gate}`,
          "boss",
          boss.enrolled.map((id) => ({
            hero: s.members[id]!.hero,
            crewId: s.members[id]!.crewId!,
          })),
          boss.gate === BossGates[0] ? 75 : 100,
          boss.gate === BossGates[0] ? "middle" : "final",
          seedFrom(`${s.seed}:boss:${boss.gate}`),
          s.activeMs,
          s.content,
        );
      }
      return;
    }
    advanceCombat(s, boss.combat, context);
    syncHealth(s, boss.combat);
    if (boss.combat.result) settleBoss(s, boss);
    return;
  }
  for (const crew of Object.values(s.crews)) {
    const p = crew.progress;
    if (!required(crew.members, context).length) {
      if (p.combat) p.combat.deadline += elapsed;
      if (p.voteDeadline !== null) p.voteDeadline += elapsed;
      continue;
    }
    if (
      p.phase === "map" &&
      p.voteDeadline !== null &&
      s.activeMs >= p.voteDeadline
    )
      resolveVote(s, crew, context, true);
    if (s.activeBossGate !== null) break;
    if (
      p.phase === "battle" &&
      p.combat &&
      required(Object.keys(p.combat.actors), context).length
    ) {
      advanceCombat(s, p.combat, context);
      syncHealth(s, p.combat);
      if (p.combat.result) settleRoute(s, crew);
    }
    if (p.phase === "shop") {
      const waiting = required(p.roster, context);
      if (waiting.length && waiting.every((id) => p.shops?.[id]?.ready))
        finishRoom(crew);
    }
    if (["reward", "rest", "event"].includes(p.phase)) {
      const waiting = required(p.roster, context);
      if (
        waiting.length &&
        waiting.every((id) =>
          p.phase === "reward"
            ? !s.relicRewards.some(
                (r) =>
                  r.memberId === id &&
                  !r.claimed &&
                  r.source === `room:${crew.id}:${p.nodeId}`,
              ) &&
              !s.rewards.some(
                (r) =>
                  r.memberId === id &&
                  !r.claimed &&
                  r.source.startsWith(`room:${crew.id}:${p.nodeId}`),
              )
            : !!p.choices[id],
        )
      )
        finishRoom(crew);
    }
  }
}
function advanceCombat(s: Session, b: Combat, context: DomainContext): void {
  if (b.result) return;
  const online = required(Object.keys(b.actors), context);
  if (!online.length) return;
  if (b.phase === "player") {
    if (online.every((id) => b.actors[id]!.ended) || s.activeMs >= b.deadline)
      enemyPhase(b, s.activeMs, s.content);
  } else if (b.phase === "enemy" && s.activeMs >= b.deadline) {
    beginTurn(b, s.activeMs, s.content);
    if (b.kind === "boss") {
      b.reduction =
        s.bosses.find((boss) => boss.gate === s.activeBossGate)?.mitigation[
          b.turn
        ] ?? 0;
      b.intents = makeIntents(b);
    }
  }
}
function hostCommand(
  s: Session,
  cmd: Extract<Command, { kind: "host" }>,
  context: DomainContext,
): void {
  if (cmd.action === "start") {
    if (s.status !== "lobby") throw new Error("Already started");
    if (!Object.values(s.members).some((m) => m.crewId && !m.removed))
      throw new Error("Assign at least one player");
    s.status = "running";
    s.notice = "Started";
  } else if (cmd.action === "pause") {
    if (s.status !== "running") throw new Error("Not running");
    s.status = "paused";
    s.notice = "Paused";
  } else if (cmd.action === "resume") {
    if (s.status !== "paused") throw new Error("Not paused");
    s.status = "running";
    s.notice = "Resumed";
  } else if (cmd.action === "extend") {
    if (s.status === "finished") throw new Error("Session ended");
    const b = s.bosses.find((b) => b.gate === s.activeBossGate);
    if (
      b &&
      cmd.quizId &&
      (b.quiz.id !== cmd.quizId || b.quiz.phaseRevision !== cmd.phaseRevision)
    )
      throw new Error("Quiz phase changed");
    if (b?.combat) b.combat.deadline += 30000;
    else if (b) b.quiz.deadline += 30000;
    else
      for (const c of Object.values(s.crews))
        if (c.progress.combat) c.progress.combat.deadline += 30000;
    s.notice = "+30 seconds";
  } else if (cmd.action === "boss") {
    if (s.status !== "running") throw new Error("Start or resume first");
    triggerBoss(
      s,
      cmd.gate ??
        (s.bosses.some((b) => b.gate === BossGates[0])
          ? BossGates[1]
          : BossGates[0]),
      null,
      context,
    );
  } else if (cmd.action === "skip") {
    if (s.activeBossGate !== null) {
      const boss = s.bosses.find((b) => b.gate === s.activeBossGate)!;
      if (
        cmd.quizId &&
        (boss.quiz.id !== cmd.quizId ||
          boss.quiz.phaseRevision !== cmd.phaseRevision)
      )
        throw new Error("Quiz phase changed");
      if (!boss.combat && cmd.scope === "quiz") {
        if (
          cmd.quizId !== boss.quiz.id ||
          cmd.phaseRevision !== boss.quiz.phaseRevision
        )
          throw new Error("Quiz phase changed");
        boss.quiz.stage = "skipped";
        boss.quiz.phaseRevision++;
        return;
      }
      if (!boss.combat) {
        boss.quiz.stage = "skipped";
        boss.quiz.phaseRevision++;
      }
      if (boss.combat) {
        boss.combat.result = "skipped";
        boss.combat.phase = "result";
      }
      settleBoss(s, boss);
    } else {
      for (const c of Object.values(s.crews))
        if (c.progress.phase !== "map" && c.progress.phase !== "finished")
          finishRoom(c);
      s.notice = "Room skipped";
    }
  } else if (cmd.action === "remove") {
    const m = s.members[cmd.memberId ?? ""];
    if (!m) throw new Error("Player not found");
    m.removed = true;
    s.notice = `${m.name} removed`;
  } else if (cmd.action === "end") {
    if (s.activeBossGate !== null) {
      const boss = s.bosses.find((b) => b.gate === s.activeBossGate)!;
      if (boss.combat) {
        boss.combat.result = "skipped";
        boss.combat.phase = "result";
      }
      settleBoss(s, boss);
    }
    s.status = "finished";
    s.finishedReason = "Host ended session";
  }
}
export function settleImmediate(s: Session): void {
  if (s.activeBossGate !== null) {
    const boss = s.bosses.find((b) => b.gate === s.activeBossGate)!;
    if (boss.combat?.result) settleBoss(s, boss);
  } else
    for (const c of Object.values(s.crews))
      if (c.progress.phase === "battle" && c.progress.combat?.result)
        settleRoute(s, c);
}
export function availableReward(
  s: Session,
  memberId: string,
): Reward | undefined {
  return s.rewards.find(
    (r) => r.memberId === memberId && !r.claimed && safeReward(s, memberId, r),
  );
}

function pRosterHas(c: Crew, id: string) {
  return c.progress.roster.includes(id);
}
