import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createServer } from "../src/server/main.ts";
import {
  addMember,
  applyCommand,
  triggerBoss,
  tick,
} from "../src/domain/session.ts";
import { answerQuiz } from "../src/domain/quizzes.ts";
import type { DomainContext } from "../src/shared/model.ts";
const dir = await mkdtemp(join(tmpdir(), "cards-v2-inspect-"));
const server = await createServer({
  dataDir: dir,
  automaticTicks: false,
  sessionSeed: 43,
});
await server.http.listen({ port: 0, host: "127.0.0.1" });
const address = server.http.server.address();
if (!address || typeof address === "string") throw Error("No address");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
try {
  const { session: s, token } = await server.app.create();
  const ids = Array.from({ length: 80 }, (_, i) => `member-${i}`);
  const ctx: DomainContext = {
    presence: { online: ids, hostOnline: true, absentFor: {} },
  };
  for (const [i, id] of ids.entries()) {
    addMember(
      s,
      id,
      `${["Alex", "Sam", "Maya", "Lee"][i % 4]} ${i % 5 === 0 ? "Longsurname" : ""}${i + 1}`,
    );
    applyCommand(
      s,
      { role: "player", memberId: id },
      {
        requestId: `join-${i}`,
        sessionId: s.id,
        encounterId: null,
        command: {
          kind: "team",
          character: "guardian",
          ...(i % 4
            ? { crewId: `team-${Math.floor(i / 4) + 1}` }
            : { name: `Team ${Math.floor(i / 4) + 1}` }),
        },
      },
      ctx,
    );
  }
  for (const [i, c] of Object.values(s.crews).entries()) {
    const node =
      s.map.find(
        (n) => n.row === 1 + (i % 7) && n.lane === (i % 7 === 0 ? 2 : i % 5),
      ) ?? s.map[0]!;
    c.progress.nodeId = node.id;
    c.progress.row = node.row;
    c.progress.roster = [...c.members];
  }
  s.status = "running";
  await server.app.repository.save(s);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await context.addCookies([{ name: "cg-host", value: token, url: base }]);
  const response = await context.request.post(
    `${base}/api/session/${s.id}/projector`,
  );
  const page = await context.newPage();
  await page.goto(
    `${base}/projector/${s.id}?view=${(await response.json()).token}&mode=map`,
  );
  await expect(page.locator(".map-projector")).toBeVisible();
  const scrollBefore = await page
    .locator(".map-projector .shared-map-scroll")
    .evaluate((el) => el.scrollLeft);
  await page.getByPlaceholder("Team or player").fill("Alex Longsurname1");
  await expect(page.locator(".map-highlight")).toHaveCount(1);
  assert.equal(
    await page
      .locator(".map-projector .shared-map-scroll")
      .evaluate((el) => el.scrollLeft),
    scrollBefore,
  );
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/v2-map-20-teams.png" });
  const report = [];
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      markers: document.querySelectorAll(".map-team-marker").length,
    }));
    console.log({ width, height, ...geometry });
    await page.screenshot({
      path: `docs/screenshots/v2-map-${width}x${height}.png`,
    });
    assert(!geometry.overflow);
    report.push({ view: "map", width, height, ...geometry });
    await page.screenshot({
      path: `docs/screenshots/v2-map-${width}x${height}.png`,
    });
  }
  triggerBoss(s, 8, "team-1", ctx);
  tick(s, 8001, ctx);
  tick(s, 6001, ctx);
  const q = s.bosses[0]!.quiz,
    r = q.rounds[0]!,
    question = s.content.quizzes.find((x) => x.id === r.questionId)!;
  for (const [i, id] of ids.entries())
    answerQuiz(
      s,
      id,
      q.id,
      r.questionId,
      q.phaseRevision,
      i % 3 === 0 ? "a" : question.correctOptionId,
    );
  tick(s, 12001, ctx);
  await server.app.repository.save(s);
  server.app.onPublish(s.id);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".projector-quiz .quiz-team")).toHaveCount(20);
  await page.screenshot({ path: "docs/screenshots/v2-quiz-20-teams.png" });
  const last = await page
    .locator(".projector-quiz .quiz-team")
    .last()
    .boundingBox();
  report.push({
    view: "quiz20",
    allVisible: !!last && last.y + last.height <= 1080,
  });
  assert(last && last.y + last.height <= 1080, "All20teamanswerpanelsmustfit");
  await page
    .getByRole("button", { name: "Inspect Team 1 answers", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Team 1", exact: true }),
  ).toContainText("Alex Longsurname1");
  await page.keyboard.press("Escape");
  const solo = await server.app.create();
  const ss = solo.session;
  for (const [i, id] of ids.entries()) {
    addMember(ss, id, `Player ${i + 1}`);
    applyCommand(
      ss,
      { role: "player", memberId: id },
      {
        requestId: `solo-${i}`,
        sessionId: ss.id,
        encounterId: null,
        command: { kind: "team", character: "guardian", name: `Team ${i + 1}` },
      },
      ctx,
    );
  }
  ss.status = "running";
  triggerBoss(ss, 8, null, ctx);
  tick(ss, 8001, ctx);
  tick(ss, 6001, ctx);
  const sq = ss.bosses[0]!.quiz,
    sr = sq.rounds[0]!;
  for (const [i, id] of ids.entries())
    answerQuiz(
      ss,
      id,
      sq.id,
      sr.questionId,
      sq.phaseRevision,
      ["a", "b", "c"][i % 3]!,
    );
  tick(ss, 12001, ctx);
  await server.app.repository.save(ss);
  await context.addCookies([{ name: "cg-host", value: solo.token, url: base }]);
  const soloResponse = await context.request.post(
    `${base}/api/session/${ss.id}/projector`,
  );
  await page.goto(
    `${base}/projector/${ss.id}?view=${(await soloResponse.json()).token}`,
  );
  await expect(page.locator(".projector-quiz .quiz-team")).toHaveCount(80);
  const soloLast = await page
    .locator(".projector-quiz .quiz-team")
    .last()
    .boundingBox();
  assert(
    soloLast && soloLast.y + soloLast.height <= 1080,
    "All80soloteamsmustfit",
  );
  report.push({ view: "quiz80", allVisible: true });
  await page.screenshot({ path: "docs/screenshots/v2-quiz-80-teams.png" });
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/v2-projector-responsive.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
  await server.http.close();
  await rm(dir, { recursive: true, force: true });
}
