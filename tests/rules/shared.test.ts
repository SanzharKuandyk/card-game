import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
import {
  addMember,
  applyCommand,
  createSession,
  settleImmediate,
  tick,
  triggerBoss,
} from "../../src/domain/session.ts";
import { project } from "../../src/server/projections/view.ts";
import type {
  Command,
  DomainContext,
  Session,
} from "../../src/shared/model.ts";
const content = await loadContent();
function fixture() {
  const s = createSession("s", "ABCDEF", 42, content);
  const context: DomainContext = {
    presence: { online: ["a", "b", "c"], hostOnline: true, absentFor: {} },
  };
  for (const id of ["a", "b", "c"]) addMember(s, id, id);
  for (const [id, crewId] of [
    ["a", undefined],
    ["b", "team-1"],
    ["c", undefined],
  ] as const)
    command(s, id, { kind: "team", character: "guardian", crewId }, context);
  command(s, "host", { kind: "host", action: "start" }, context);
  command(s, "a", { kind: "travel", nodeId: "r1-0" }, context);
  command(s, "b", { kind: "travel", nodeId: "r1-0" }, context);
  command(s, "c", { kind: "travel", nodeId: "r1-0" }, context);
  return { s, context };
}
function command(
  s: Session,
  id: string,
  command: Command,
  context: DomainContext,
) {
  return applyCommand(
    s,
    id === "host" ? { role: "host" } : { role: "player", memberId: id },
    {
      requestId: `${id}-${s.revision++}`,
      sessionId: s.id,
      encounterId:
        s.bosses.find((b) => b.gate === s.activeBossGate)?.combat?.id ??
        s.crews[s.members[id]?.crewId ?? ""]?.progress.combat?.id ??
        null,
      command,
    },
    context,
  );
}
test("first-arrival reward is permanent; suspended pile state restores; settlement cannot repeat", () => {
  const { s, context } = fixture();
  const before = structuredClone(s.crews["team-2"]!.progress);
  triggerBoss(s, 8, "team-1", context);
  s.bosses[0]!.quiz.stage = "reward";
  const reward = s.rewards.find((r) => r.memberId === "a")!;
  command(
    s,
    "a",
    { kind: "reward", rewardId: reward.id, cardUid: reward.offers[0]!.uid },
    context,
  );
  assert.equal(s.members.a!.hero.deck.length, 11);
  s.bosses[0]!.quiz.stage = "complete";
  tick(s, 1, context);
  const boss = s.bosses[0]!;
  assert(
    boss
      .combat!.actors.a!.draw.concat(boss.combat!.actors.a!.hand)
      .some((c) => c.uid === reward.offers[0]!.uid),
  );
  boss.combat!.actors.c!.hp = 19;
  boss.combat!.result = "victory";
  settleImmediate(s);
  assert.equal(s.members.c!.hero.hp, 19);
  assert.deepEqual(
    s.crews["team-2"]!.progress.combat!.actors.c!.hand,
    before.combat!.actors.c!.hand,
  );
  assert.equal(s.crews["team-2"]!.progress.combat!.actors.c!.hp, 19);
  const rewards = s.rewards.length;
  settleImmediate(s);
  assert.equal(s.rewards.length, rewards);
});
test("quiz accuracy averages frozen teams and projector hides choices until reveal", () => {
  const { s, context } = fixture();
  triggerBoss(s, 8, null, context);
  tick(s, 8001, context);
  tick(s, 6001, context);
  const q = s.bosses[0]!.quiz,
    round = q.rounds[0]!;
  const correct = s.content.quizzes.find(
    (p) => p.id === round.questionId,
  )!.correctOptionId;
  for (const id of ["a", "c"])
    command(
      s,
      id,
      {
        kind: "quiz:answer",
        quizId: q.id,
        questionId: round.questionId,
        phaseRevision: q.phaseRevision,
        optionId: correct,
      },
      context,
    );
  const hidden = project(s, { role: "projector" }, context).quiz!;
  assert.equal(hidden.reveal, null);
  assert(!JSON.stringify(hidden).includes("correctOptionId"));
  assert(
    hidden.teams.every((t) => t.members.every((m) => m.optionId === undefined)),
  );
  tick(s, 25001, context);
  assert.equal(q.stage, "reveal");
  assert.equal(round.result!.reduction, 22);
  const revealed = project(s, { role: "projector" }, context).quiz!;
  assert.equal(revealed.reveal!.correctOptionId, correct);
  assert.equal(revealed.teams[0]!.members[1]!.optionId, null);
});
test("pause, all-offline suspension, host skip and deck changes during battle", () => {
  const { s, context } = fixture();
  const clock = s.activeMs;
  command(s, "host", { kind: "host", action: "pause" }, context);
  tick(s, 60000, context);
  assert.equal(s.activeMs, clock);
  command(s, "host", { kind: "host", action: "resume" }, context);
  tick(s, 60000, { presence: { online: [], hostOnline: true, absentFor: {} } });
  assert.equal(s.activeMs, clock);
  triggerBoss(s, 8, null, context);
  tick(s, 20001, context);
  const first = structuredClone(s.crews["team-1"]!.progress);
  command(s, "host", { kind: "host", action: "skip" }, context);
  assert.equal(s.bosses[0]!.result, "skipped");
  assert.equal(s.rewards.length, 0);
  first.combat!.deadline += s.activeMs - s.bosses[0]!.startedAt;
  assert.deepEqual(s.crews["team-1"]!.progress, first);
  assert.equal(
    s.crews["team-1"]!.progress.combat!.deadline - s.activeMs,
    60000,
  );
  assert.throws(() => triggerBoss(s, 8, null, context), /already/);
});
