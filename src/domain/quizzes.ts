import type { Session, BossRecord, Reward } from "../shared/model.ts";
import type { QuizEvent, QuizView } from "../shared/quiz-types.ts";
import { seedFrom, shuffle } from "./random.ts";
export function createQuiz(
  s: Session,
  gate: number,
  crewId: string | null,
  enrolled: string[],
): QuizEvent {
  const rng = { rng: seedFrom(`${s.seed}:quiz:${gate}`) };
  const ids = s.predictionOrder.slice(gate === 8 ? 0 : 2, gate === 8 ? 2 : 4);
  const rosterByCrew: Record<string, string[]> = {};
  for (const id of enrolled)
    (rosterByCrew[s.members[id]!.crewId!] ??= []).push(id);
  return {
    id: `${s.id}:quiz:${gate}`,
    gate,
    triggerCrewId: crewId,
    rosterByCrew,
    stage: "announce",
    phaseRevision: 0,
    roundIndex: 0,
    startedAt: s.activeMs,
    deadline: s.activeMs + s.content.quizTiming.announce,
    rounds: ids.map((id) => ({
      questionId: id,
      optionOrder: shuffle(
        s.content.quizzes.find((q) => q.id === id)!.options.map((o) => o.id),
        rng,
      ),
      submissions: {},
      result: null,
    })),
    settlement: null,
  };
}
function setStage(
  s: Session,
  q: QuizEvent,
  stage: QuizEvent["stage"],
  duration: number,
) {
  q.stage = stage;
  q.startedAt = s.activeMs;
  q.deadline = s.activeMs + duration;
  q.phaseRevision++;
}
export function answerQuiz(
  s: Session,
  id: string,
  quizId: string,
  questionId: string,
  revision: number,
  optionId: string,
): void {
  const q = s.bosses.find((b) => b.gate === s.activeBossGate)?.quiz;
  if (
    !q ||
    q.id !== quizId ||
    q.stage !== "answer" ||
    q.phaseRevision !== revision ||
    s.activeMs >= q.deadline
  )
    throw new Error("Question changed or closed");
  if (!Object.values(q.rosterByCrew).flat().includes(id))
    throw new Error("You are watching this quiz");
  const r = q.rounds[q.roundIndex]!;
  if (r.questionId !== questionId || !r.optionOrder.includes(optionId))
    throw new Error("Choose a current answer");
  if (r.submissions[id]) throw new Error("Answer already saved");
  r.submissions[id] = { optionId, submittedAtActiveMs: s.activeMs };
}
function settle(s: Session, q: QuizEvent) {
  if (q.settlement) return;
  const tiers: NonNullable<QuizEvent["settlement"]>["tiers"] = {};
  const rewardIds: string[] = [];
  for (const [crew, ids] of Object.entries(q.rosterByCrew)) {
    const correct = q.rounds.reduce(
      (sum, r) => sum + (r.result?.correctByCrew[crew] ?? 0),
      0,
    );
    const accuracy = correct / (ids.length * q.rounds.length);
    const tier =
      accuracy >= 0.75 ? "rare" : accuracy >= 0.5 ? "uncommon" : "basic";
    tiers[crew] = tier;
    for (const id of ids) {
      const source = `quiz:${q.gate}`;
      const rid = `${source}:${id}`;
      if (!s.rewards.some((r) => r.id === rid)) {
        const hero = s.members[id]!.hero;
        const rng = { rng: seedFrom(`${s.seed}:${rid}`) };
        const pool = s.content.cards.filter(
          (c) =>
            [hero.character, "shared"].includes(c.character) &&
            !["strike", "guard"].includes(c.id),
        );
        const rarities =
          tier === "rare"
            ? ["uncommon", "uncommon", "rare"]
            : tier === "uncommon"
              ? ["uncommon", "uncommon", "uncommon"]
              : ["common", "common", "uncommon"];
        const picked: string[] = [];
        for (const rarity of rarities) {
          const candidates = shuffle(
            pool.filter((c) => c.rarity === rarity && !picked.includes(c.id)),
            rng,
          );
          const tags = hero.deck.flatMap(
            (c) => s.content.cards.find((d) => d.id === c.cardId)!.tags,
          );
          const chosen =
            (picked.length === 0
              ? candidates.find((c) =>
                  c.tags.some((t) => t !== "general" && tags.includes(t)),
                )
              : null) ?? candidates[0];
          if (chosen) picked.push(chosen.id);
        }
        const reward: Reward = {
          id: rid,
          memberId: id,
          source,
          offers: picked.map((cardId, i) => ({
            uid: `${rid}:${i}`,
            cardId,
            upgraded: false,
          })),
          claimed: false,
          selected: null,
        };
        s.rewards.push(reward);
      }
      rewardIds.push(rid);
    }
  }
  q.settlement = { tiers, rewardIds };
}
export function advanceQuiz(s: Session, boss: BossRecord): void {
  const q = boss.quiz,
    t = s.content.quizTiming,
    r = q.rounds[q.roundIndex]!;
  const expired = s.activeMs >= q.deadline;
  if (q.stage === "announce" && expired)
    setStage(s, q, "demonstrate", t.demonstrate);
  else if (q.stage === "demonstrate" && expired)
    setStage(s, q, "answer", t.answer);
  else if (
    q.stage === "answer" &&
    (expired ||
      (s.activeMs - q.startedAt >= t.minimumAnswer &&
        Object.values(q.rosterByCrew)
          .flat()
          .every((id) => r.submissions[id])))
  ) {
    const question = s.content.quizzes.find((p) => p.id === r.questionId)!;
    const correctByCrew: Record<string, number> = {};
    for (const [crew, ids] of Object.entries(q.rosterByCrew))
      correctByCrew[crew] = ids.filter(
        (id) => r.submissions[id]?.optionId === question.correctOptionId,
      ).length;
    const entries = Object.entries(q.rosterByCrew);
    const accuracy =
      entries.reduce(
        (sum, [crew, ids]) => sum + correctByCrew[crew]! / ids.length,
        0,
      ) / entries.length;
    r.result = { correctByCrew, reduction: Math.floor(30 * accuracy) };
    boss.mitigation[q.roundIndex === 0 ? 2 : 4] = r.result.reduction;
    setStage(s, q, "reveal", t.reveal);
  } else if (q.stage === "reveal" && expired) {
    if (q.roundIndex + 1 < q.rounds.length) {
      q.roundIndex++;
      setStage(s, q, "demonstrate", t.demonstrate);
    } else {
      settle(s, q);
      setStage(s, q, "reward", t.reward);
    }
  } else if (q.stage === "reward" && expired) setStage(s, q, "complete", 0);
}
export function projectQuiz(
  s: Session,
  q: QuizEvent,
  memberId: string | null,
): QuizView {
  const round = q.rounds[q.roundIndex]!;
  const question = s.content.quizzes.find((p) => p.id === round.questionId)!;
  const revealed =
    q.stage === "reveal" || q.stage === "reward" || q.stage === "complete";
  const showQuestion = !["announce", "reward", "complete", "skipped"].includes(
    q.stage,
  );
  return {
    optionLabels: Object.fromEntries(
      round.optionOrder.map((id, i) => [id, String.fromCharCode(65 + i)]),
    ),
    id: q.id,
    gate: q.gate,
    triggerCrewId: q.triggerCrewId,
    stage: q.stage,
    phaseRevision: q.phaseRevision,
    roundIndex: q.roundIndex,
    remainingMs: Math.max(0, q.deadline - s.activeMs),
    enrolled:
      !!memberId && Object.values(q.rosterByCrew).flat().includes(memberId),
    question: showQuestion
      ? {
          id: question.id,
          topic: question.topic,
          kind: question.kind,
          prompt: question.prompt,
          rule: question.rule,
          source: question.source,
          setupReplay: question.setupReplay,
          options: round.optionOrder.map((id) => {
            const o = question.options.find((o) => o.id === id)!;
            return { id: o.id, text: o.text };
          }),
        }
      : null,
    ownAnswer: memberId
      ? (round.submissions[memberId]?.optionId ?? null)
      : null,
    teams: Object.entries(q.rosterByCrew).map(([id, ids]) => ({
      id,
      name: s.crews[id]!.name,
      correct: revealed
        ? q.rounds.reduce(
            (sum, r) => sum + (r.result?.correctByCrew[id] ?? 0),
            0,
          )
        : null,
      possible:
        ids.length *
        (q.stage === "reward" || q.stage === "complete"
          ? q.rounds.length
          : q.roundIndex + 1),
      tier: q.settlement?.tiers[id] ?? null,
      members: ids.map((id) => ({
        id,
        name: s.members[id]!.name,
        submitted: !!round.submissions[id],
        ...(revealed
          ? {
              optionId: round.submissions[id]?.optionId ?? null,
              correct:
                round.submissions[id]?.optionId === question.correctOptionId,
            }
          : {}),
      })),
    })),
    reveal:
      revealed && rResult(round)
        ? {
            correctOptionId: question.correctOptionId,
            explanations: Object.fromEntries(
              question.options.map((o) => [o.id, o.explanation]),
            ),
            replay: question.resultReplay,
            reduction: round.result!.reduction,
          }
        : null,
  };
}
function rResult(r: QuizEvent["rounds"][number]) {
  return r.result !== null;
}
