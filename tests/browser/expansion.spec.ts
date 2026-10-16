import { test, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createServer } from "../../src/server/main.ts";
import { openShop } from "../../src/domain/shops.ts";
import type { Command, Envelope } from "../../src/shared/model.ts";
let server: Awaited<ReturnType<typeof createServer>>, dir: string, base: string;
const sockets: Socket[] = [];
test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cards-v2-browser-"));
  server = await createServer({
    dataDir: dir,
    automaticTicks: false,
    sessionSeed: 43,
  });
  await server.http.listen({ port: 0, host: "127.0.0.1" });
  const a = server.http.server.address();
  if (!a || typeof a === "string") throw Error("No address");
  base = `http://127.0.0.1:${a.port}`;
  await mkdir("docs/screenshots", { recursive: true });
});
test.afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await server.http.close();
  await rm(dir, { recursive: true, force: true });
});
async function connect(id: string, token: string, role: "host" | "player") {
  const sock = io(base, {
    auth: { sessionId: id, role },
    transports: ["websocket"],
    extraHeaders: { cookie: `cg-${role}=${token}` },
  });
  sockets.push(sock);
  await new Promise<void>((r, j) => {
    sock.once("connect", () => r());
    sock.once("connect_error", j);
  });
  return sock;
}
async function fixture(browser: Browser, size = 4) {
  const created = await server.app.create(),
    id = created.session.id;
  const get = () => server.app.sessions.get(id)!;
  const host = await connect(id, created.token, "host");
  const send = async (
    sock: Socket,
    command: Command,
    requestId = crypto.randomUUID(),
  ) => {
    const s = get();
    const encounterId =
      s.bosses.find((b) => b.gate === s.activeBossGate)?.combat?.id ?? null;
    const ack = await sock.emitWithAck("command", {
      requestId,
      sessionId: id,
      encounterId,
      command,
    });
    assert(ack.accepted, ack.message);
    return ack;
  };
  const members = [];
  for (let i = 0; i < size + 1; i++) {
    const p = await server.app.join(
      created.session.code,
      ["Alex", "Sam", "Maya", "Lee", "Ilya"][i] ?? "Ilya",
    );
    const sock = await connect(id, p.token, "player");
    await send(sock, {
      kind: "team",
      character: i === size ? "channeler" : "guardian",
      ...(i === 0
        ? { name: "Red team" }
        : i === size
          ? { name: "Blue team" }
          : { crewId: "team-1" }),
    });
    members.push({ ...p, sock });
  }
  await send(host, { kind: "host", action: "start" });
  for (const [i, m] of members.entries())
    if ((i < size && i < Math.floor(size / 2) + 1) || i === size)
      await send(m.sock, { kind: "travel", nodeId: "r1-0" });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  await context.addCookies([
    { name: "cg-player", value: members[0]!.token, url: base },
  ]);
  const phone = await context.newPage();
  await phone.goto(`${base}/play/${id}`);
  await phone
    .getByRole("button", { name: "Take control", exact: true })
    .click();
  await expect(
    phone.getByRole("button", { name: "Take control", exact: true }),
  ).toHaveCount(0);
  const hc = await browser.newContext();
  await hc.addCookies([{ name: "cg-host", value: created.token, url: base }]);
  const token = await hc.request.post(`${base}/api/session/${id}/projector`);
  const projector = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await projector.goto(
    `${base}/projector/${id}?view=${(await token.json()).token}`,
  );
  await expect(projector.locator(".team-board")).toHaveCount(2);
  return { id, get, host, send, members, phone, projector, context };
}
async function layouts(page: Page, prefix: string, footer: string) {
  const report = [];
  for (const [width, height] of [
    [294, 534],
    [360, 800],
    [388, 619],
    [667, 375],
    [844, 390],
    [768, 1024],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.waitForTimeout(80);
    const result = await page.evaluate((selector) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        footerVisible: rect.top >= 0 && rect.bottom <= innerHeight,
      };
    }, footer);
    assert(!result.overflow, `${prefix} ${width} overflow`);
    assert(result.footerVisible, `${prefix} ${width} footer`);
    report.push({ width, height, ...result });
    await page.screenshot({
      path: `docs/screenshots/${prefix}-${width}x${height}.png`,
    });
  }
  await writeFile(
    `docs/${prefix}-responsive.json`,
    JSON.stringify(report, null, 2),
  );
  await page.setViewportSize({ width: 360, height: 800 });
}

test("two-team quiz: first arrival, all-member offers, projector reveal, support and exact return", async ({
  browser,
}) => {
  const f = await fixture(browser);
  const { get, phone, projector, send, members, host } = f;
  const original = structuredClone(get().crews["team-2"]!.progress.combat!);
  const crew = get().crews["team-1"]!;
  crew.progress.phase = "map";
  crew.progress.row = 7;
  crew.progress.nodeId = "r7-2";
  crew.progress.combat = null;
  server.app.onPublish(f.id);
  await projector.getByRole("button", { name: "Map", exact: true }).click();
  await expect(projector.locator(".shared-map.map-projector")).toBeVisible();
  await expect(projector.locator(".map-team-index")).toContainText("Red team");
  await projector.screenshot({ path: "docs/screenshots/v2-shared-map.png" });
  await send(members[1]!.sock, { kind: "travel", nodeId: "r8-0" });
  await send(members[2]!.sock, { kind: "travel", nodeId: "r8-0" });
  await phone.locator('[data-node-id="r8-0"]').click();
  await expect(phone.locator(".quiz-panel")).toContainText(
    "Red team reached the boss",
  );
  await expect(projector.locator(".projector-quiz")).toBeVisible();
  assert.equal(get().bosses.length, 1);
  for (let round = 0; round < 2; round++) {
    await server.app.advance(round ? 6001 : 8001);
    if (!round) await server.app.advance(6001);
    await expect(phone.getByRole("button", { name: "Confirm", exact: true }))
      .toBeEnabled({ timeout: 1000 })
      .catch(() => {});
    const q = get().bosses[0]!.quiz,
      r = q.rounds[round]!,
      question = get().content.quizzes.find((q) => q.id === r.questionId)!;
    if (!round) {
      await layouts(phone, "v2-quiz", ".quiz-footer");
      assert.equal(
        server.app.view(f.id, { role: "projector" }).quiz!.reveal,
        null,
      );
    }
    await phone
      .locator(".quiz-options button")
      .filter({
        hasText: question.options.find(
          (o) => o.id === question.correctOptionId,
        )!.text,
      })
      .click();
    await phone.getByRole("button", { name: "Confirm", exact: true }).click();
    for (const [i, m] of members.entries())
      if (i)
        await send(m.sock, {
          kind: "quiz:answer",
          quizId: q.id,
          questionId: r.questionId,
          phaseRevision: q.phaseRevision,
          optionId:
            i === 4 && !round
              ? question.options.find((o) => o.id !== question.correctOptionId)!
                  .id
              : question.correctOptionId,
        });
    await server.app.advance(12001);
    await expect(projector.locator(".quiz-explanation")).toBeVisible();
    await expect(projector.locator(".quiz-member-chips")).toContainText([
      "Alex",
    ]);
    if (!round)
      await projector.screenshot({
        path: "docs/screenshots/v2-quiz-projector.png",
      });
    await server.app.advance(12001);
  }
  assert.equal(get().bosses[0]!.quiz.settlement!.tiers["team-1"], "rare");
  assert.equal(get().rewards.filter((r) => r.source === "quiz:8").length, 5);
  for (let i = 0; i < 2; i++) {
    await phone.locator(".reward-panel .card").first().click();
    await phone
      .locator(".reward-panel")
      .getByRole("button", { name: "Choose", exact: true })
      .click();
    await expect
      .poll(() => get().members[members[0]!.memberId]!.hero.deck.length)
      .toBe(11 + i);
  }
  await expect
    .poll(() => get().members[members[0]!.memberId]!.hero.deck.length)
    .toBe(12);
  for (const r of get().rewards.filter(
    (r) => r.memberId !== members[0]!.memberId && !r.claimed,
  ))
    await send(members.find((m) => m.memberId === r.memberId)!.sock, {
      kind: "reward",
      rewardId: r.id,
      cardUid: r.offers[0]!.uid,
    });
  await server.app.advance(8001);
  await expect(
    phone.getByRole("heading", { name: "Boss", exact: true }),
  ).toBeVisible();
  let b = get().bosses[0]!.combat!;
  const helper = members[4]!;
  const support = get().content.cards.find(
    (c) =>
      c.crossTeam &&
      c.target === "any-hero" &&
      c.effects.some((e) => e.op === "block"),
  )!;
  assert(support);
  b.actors[helper.memberId]!.hand = [
    { uid: "support", cardId: support.id, upgraded: false },
  ];
  b.actors[helper.memberId]!.energy = 5;
  server.app.onPublish(f.id);
  await send(helper.sock, {
    kind: "play",
    cardUid: "support",
    handRevision: b.actors[helper.memberId]!.handRevision,
    targetId: members[0]!.memberId,
  });
  b = get().bosses[0]!.combat!;
  assert(b.actors[members[0]!.memberId]!.block > 0);
  b.enemies[0]!.hp = 1;
  const a = b.actors[members[0]!.memberId]!;
  a.hand = [{ uid: "finish", cardId: "strike", upgraded: false }];
  a.handRevision++;
  a.energy = 3;
  server.app.onPublish(f.id);
  await phone.locator('[data-card-uid="finish"]').click();
  await phone.getByRole("button", { name: /^Play ·/ }).click();
  await expect.poll(() => get().activeBossGate).toBe(null);
  const restored = get().crews["team-2"]!.progress.combat!;
  assert.deepEqual(
    restored.actors[helper.memberId]!.hand,
    original.actors[helper.memberId]!.hand,
  );
  assert.equal(
    restored.actors[helper.memberId]!.energy,
    original.actors[helper.memberId]!.energy,
  );
  const count = get().rewards.length;
  await server.app.advance(1);
  assert.equal(get().rewards.length, count);
  await send(host, { kind: "host", action: "pause" });
});

test("shop page: buy,remove,relic popup,rotation and boss interruption preserve purchases", async ({
  browser,
}) => {
  const f = await fixture(browser, 1),
    { get, phone, send, host } = f;
  const c = get().crews["team-1"]!;
  c.progress.combat = null;
  c.progress.phase = "shop";
  c.progress.nodeId = "r3-0";
  c.progress.row = 3;
  c.progress.roster = [f.members[0]!.memberId];
  get().members[f.members[0]!.memberId]!.hero.gold = 250;
  openShop(get(), c);
  server.app.onPublish(f.id);
  await expect(phone).toHaveURL(/\/shop\//);
  await expect(
    phone.getByRole("heading", { name: "Shop", exact: true }),
  ).toBeVisible();
  await layouts(phone, "v2-shop", ".shop-footer");
  const shop = get().crews["team-1"]!.progress.shops![f.members[0]!.memberId]!,
    item = shop.stock.find((i) => i.kind === "relic")!;
  await phone
    .locator(".relic-shop-item")
    .first()
    .getByRole("button", { name: /Buy/ })
    .click();
  await expect
    .poll(() => get().members[f.members[0]!.memberId]!.hero.gold)
    .toBe(250 - item.price);

  await phone.getByRole("button", { name: "Relics · 1", exact: true }).click();
  await expect(
    phone.getByRole("dialog", { name: "Relics", exact: true }),
  ).toContainText(
    get().content.relics.find(
      (r) => r.id === (item.kind === "relic" ? item.relicId : ""),
    )!.text,
  );
  await phone.screenshot({ path: "docs/screenshots/v2-relic-popup.png" });
  await phone.setViewportSize({ width: 667, height: 375 });
  await phone.evaluate(() => {
    document.documentElement.style.setProperty("--safe-left", "47px");
    document.documentElement.style.setProperty("--safe-bottom", "21px");
  });
  const safeDialog = await phone
    .getByRole("dialog", { name: "Relics", exact: true })
    .boundingBox();
  expect(safeDialog!.x).toBeGreaterThanOrEqual(47);
  expect(safeDialog!.x + safeDialog!.width).toBeLessThanOrEqual(667);
  expect(safeDialog!.y + safeDialog!.height).toBeLessThanOrEqual(354);
  await phone.evaluate(() => {
    document.documentElement.style.removeProperty("--safe-left");
    document.documentElement.style.removeProperty("--safe-bottom");
  });
  await phone.setViewportSize({ width: 360, height: 800 });
  await phone.keyboard.press("Escape");
  await phone.locator(".shop-removal").getByRole("button").click();
  await phone.locator(".deck-grid .card").first().click();
  await phone
    .getByRole("dialog", { name: "Remove this card?", exact: true })
    .getByRole("button", { name: /Remove ·/ })
    .click();
  await expect
    .poll(() => get().members[f.members[0]!.memberId]!.hero.deck.length)
    .toBe(9);
  const saved = structuredClone(get().crews["team-1"]!.progress.shops);
  const wallet = get().members[f.members[0]!.memberId]!.hero.gold;
  await send(host, { kind: "host", action: "boss", gate: 8 });
  await expect(phone.locator(".quiz-panel")).toBeVisible();
  const q = get().bosses[0]!.quiz;
  await send(host, {
    kind: "host",
    action: "skip",
    scope: "quiz",
    quizId: q.id,
    phaseRevision: q.phaseRevision,
  });
  await server.app.advance(1);
  await expect(phone).toHaveURL(new RegExp(`/play/${f.id}$`));
  await send(host, { kind: "host", action: "skip" });
  await expect(phone).toHaveURL(/\/shop\//);
  assert.deepEqual(get().crews["team-1"]!.progress.shops, saved);
  assert.equal(get().members[f.members[0]!.memberId]!.hero.gold, wallet);
  await phone.reload();
  await expect(
    phone.getByRole("heading", { name: "Shop", exact: true }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "Done", exact: true }).click();
  await server.app.advance(1);
  await expect(phone).toHaveURL(new RegExp(`/play/${f.id}$`));
});

test("quiz disconnect,restart and duplicate receipt keep answers and grant no skipped reward", async ({
  browser,
}) => {
  const f = await fixture(browser, 2),
    { get, phone, send, host, members } = f;
  await send(host, { kind: "host", action: "boss", gate: 8 });
  await server.app.advance(8001);
  await server.app.advance(6001);
  const q = get().bosses[0]!.quiz,
    r = q.rounds[0]!;
  const env: Envelope = {
    requestId: "lost-ack-answer",
    sessionId: f.id,
    encounterId: null,
    command: {
      kind: "quiz:answer",
      quizId: q.id,
      questionId: r.questionId,
      phaseRevision: q.phaseRevision,
      optionId: "a",
    },
  };
  const first = await members[2]!.sock.emitWithAck("command", env);
  assert(first.accepted);
  members[1]!.sock.disconnect();
  await phone.locator(".quiz-options button").first().click();
  await phone.getByRole("button", { name: "Confirm", exact: true }).click();
  await server.app.advance(25001);
  await expect(phone.locator(".quiz-explanation")).toBeVisible();
  const snapshot = structuredClone(get().bosses[0]!.quiz);
  const port = Number(new URL(base).port);
  await server.http.close();
  server = await createServer({ dataDir: dir, automaticTicks: false });
  await server.http.listen({ port, host: "127.0.0.1" });
  await expect(
    phone.getByText("Paused", { exact: true }).first(),
  ).toBeVisible();
  assert.deepEqual(get().bosses[0]!.quiz, snapshot);
  host.connect();
  members[2]!.sock.connect();
  await expect.poll(() => host.connected).toBe(true);
  await expect.poll(() => members[2]!.sock.connected).toBe(true);
  const duplicate = await members[2]!.sock.emitWithAck("command", env);
  assert.deepEqual(duplicate, first);
  await send(host, { kind: "host", action: "resume" });
  await send(host, { kind: "host", action: "skip" });
  assert.equal(get().rewards.length, 0);
  assert.equal(get().bosses[0]!.result, "skipped");
  assert.equal(
    get().bosses[0]!.quiz.rounds[0]!.submissions[members[2]!.memberId]!
      .optionId,
    "a",
  );
});
