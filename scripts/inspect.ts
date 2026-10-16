import { chromium } from "@playwright/test";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server/main.ts";
import type { Command } from "../src/shared/model.ts";
const dataDir = await mkdtemp(join(tmpdir(), "cards-inspect-"));
const server = await createServer({
  dataDir,
  automaticTicks: false,
});
await server.http.listen({ port: 0, host: "127.0.0.1" });
const address = server.http.server.address();
if (!address || typeof address === "string") throw new Error("No address");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const sockets: Socket[] = [];
async function socket(role: string, token: string, id: string) {
  const sock = io(base, {
    auth: { sessionId: id, role },
    transports: ["websocket"],
    extraHeaders: {
      cookie: `cg-${role === "host" ? "host" : "player"}=${token}`,
    },
  });
  sockets.push(sock);
  await new Promise<void>((r, j) => {
    sock.once("connect", () => r());
    sock.once("connect_error", j);
  });
  return sock;
}
async function send(sock: Socket, id: string, command: Command) {
  const s = server.app.sessions.get(id)!;
  const response = (await sock.emitWithAck("command", {
    requestId: crypto.randomUUID(),
    sessionId: id,
    encounterId:
      s.bosses.find((b) => b.gate === s.activeBossGate)?.combat?.id ?? null,
    command,
  })) as { accepted: boolean; message: string };
  if (!response.accepted) throw new Error(response.message);
}
try {
  const { session, token } = await server.app.create();
  const host = await socket("host", token, session.id);
  const players: (Awaited<ReturnType<typeof server.app.join>> & {
    sock: Socket;
  })[] = [];
  for (let i = 0; i < 80; i++) {
    const player = await server.app.join(
      session.code,
      i === 0 ? "Alex" : `Player ${i + 1}`,
    );
    const sock = await socket("player", player.token, session.id);
    await send(sock, session.id, {
      kind: "team",
      character: ["guardian", "rogue", "alchemist", "channeler"][
        i % 4
      ] as "guardian",
      ...(i < 4 && i > 0
        ? { crewId: "team-1" }
        : { name: `Team ${i < 4 ? 1 : i - 2}` }),
    });
    players.push({ ...player, sock });
  }
  const context = await browser.newContext();
  await context.addCookies([
    { name: "cg-player", value: players[0]!.token, url: base },
    { name: "cg-host", value: token, url: base },
  ]);
  const page = await context.newPage();
  await page.goto(`${base}/play/${session.id}`);
  await send(host, session.id, { kind: "host", action: "start" });
  await page.getByRole("heading", { name: "Map", exact: true }).waitFor();
  await page.getByRole("button", { name: "Take control" }).click();
  await mkdir("docs/screenshots", { recursive: true });
  const reports: object[] = [];
  const sizes = [
    [294, 534],
    [360, 800],
    [667, 375],
    [844, 390],
    [768, 1024],
    [1366, 768],
  ];
  async function capture(scene: string) {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width: width!, height: height! });
      await page.screenshot({
        path: `docs/screenshots/${scene}-${width}x${height}.png`,
        fullPage: true,
      });
      reports.push({
        scene,
        width,
        height,
        ...(await page.evaluate(() => ({
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          documentHeight: document.documentElement.scrollHeight,
          handVisible: [...document.querySelectorAll(".hand .card")].every(
            (card) => {
              const box = card.getBoundingClientRect();
              return (
                box.top >= 0 &&
                box.bottom <= innerHeight &&
                box.left >= 0 &&
                box.right <= innerWidth
              );
            },
          ),
          playReachable:
            !document.querySelector(".play-footer") ||
            (() => {
              const box = document
                .querySelector(".play-footer")!
                .getBoundingClientRect();
              return box.top >= 0 && box.bottom <= innerHeight;
            })(),
        }))),
      });
    }
  }
  await capture("map");
  await page
    .locator(".map-node.available")
    .filter({ hasText: "Battle" })
    .first()
    .click();
  for (const player of players.slice(1, 3))
    await send(player.sock, session.id, { kind: "travel", nodeId: "r1-0" });
  await page.getByRole("heading", { name: "Turn 1" }).waitFor();
  await capture("fight");
  await page.locator(".hand .card").first().click();
  await capture("selected-card");
  await page
    .getByRole("button", { name: "Explain card keywords", exact: true })
    .click();
  await capture("keywords");
  await page
    .getByRole("dialog", { name: "Card keywords", exact: true })
    .getByRole("button", { name: "Done", exact: true })
    .click();
  const fixtureCombat = server.app.sessions.get(session.id)!.crews["team-1"]!
    .progress.combat!;
  const fixtureActor = fixtureCombat.actors[players[0]!.memberId]!;
  const originalHand = structuredClone(fixtureActor.hand);
  const originalDraw = structuredClone(fixtureActor.draw);
  fixtureActor.hand.push(
    ...fixtureActor.draw.splice(0, 10 - fixtureActor.hand.length),
  );
  fixtureCombat.enemies[0]!.poison = 4;
  server.app.onPublish(session.id);
  await page.locator(".hand .card").nth(9).waitFor();
  await capture("full-hand-poison");
  fixtureActor.energy = 0;
  server.app.onPublish(session.id);
  await page
    .getByRole("status", { name: "0 energy left", exact: true })
    .waitFor();
  await capture("empty-energy");
  fixtureActor.energy = 3;
  fixtureActor.hand = originalHand;
  fixtureActor.draw = originalDraw;
  fixtureCombat.enemies[0]!.poison = 0;
  server.app.onPublish(session.id);
  await page.getByRole("button", { name: /^Cards ·/ }).click();
  await page.locator("dialog[open]").waitFor();
  await capture("deck");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const hostPage = await context.newPage();
  await hostPage.goto(`${base}/host/${session.id}`);
  await hostPage.setViewportSize({ width: 1366, height: 768 });
  await hostPage.screenshot({
    path: "docs/screenshots/host.png",
    fullPage: true,
  });
  await send(host, session.id, { kind: "host", action: "skip" });
  async function teamAction(command: Command) {
    await send(players[0]!.sock, session.id, { kind: "takeover" });
    for (const player of players.slice(0, 3))
      await send(player.sock, session.id, command);
    await page.getByRole("button", { name: "Take control" }).waitFor();
    await page.getByRole("button", { name: "Take control" }).click();
  }
  await teamAction({ kind: "travel", nodeId: "r2-1" });
  await page.locator(".room-choices").waitFor();
  await capture("event");
  await send(host, session.id, { kind: "host", action: "skip" });
  await teamAction({ kind: "travel", nodeId: "r3-1" });
  await page.getByRole("heading", { name: "Rest", exact: true }).waitFor();
  await capture("rest");
  await send(host, session.id, { kind: "host", action: "skip" });
  await teamAction({ kind: "travel", nodeId: "r4-0" });
  await send(host, session.id, { kind: "host", action: "skip" });
  // A strict majority commits the gate before the fourth vote arrives.
  await send(players[0]!.sock, session.id, { kind: "takeover" });
  for (const player of players.slice(0, 3))
    await send(player.sock, session.id, { kind: "travel", nodeId: "r5-0" });
  await page.getByRole("button", { name: "Take control" }).waitFor();
  await page.getByRole("button", { name: "Take control" }).click();
  await page
    .getByRole("heading", { name: "First arrival", exact: true })
    .waitFor();
  await capture("reward");
  await server.app.advance(20001);
  await page.getByRole("heading", { name: "Boss", exact: true }).waitFor();
  await capture("boss");
  const projectorResult = await context.request.post(
    `${base}/api/session/${session.id}/projector`,
  );
  const projectorToken = (await projectorResult.json()).token;
  const projector = await context.newPage();
  await projector.goto(
    `${base}/projector/${session.id}?view=${projectorToken}`,
  );
  await projector.setViewportSize({ width: 1920, height: 1080 });
  await projector.locator(".live-team-grid").waitFor();
  await projector.locator(".team-board .board-turn").first().waitFor();
  await projector.screenshot({
    path: "docs/screenshots/projector-80.png",
    fullPage: true,
  });
  reports.push({
    scene: "projector",
    width: 1920,
    height: 1080,
    ...(await projector.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      documentHeight: document.documentElement.scrollHeight,
    }))),
  });
  await projector.locator(".live-team-grid").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await projector.locator(".team-board").last().waitFor();
  await projector.screenshot({
    path: "docs/screenshots/projector-last-teams.png",
    fullPage: true,
  });
  await server.app.advance(60001);
  await server.app.advance(8001);
  await page.locator(".prediction").waitFor();
  await capture("prediction");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: "docs/screenshots/reduced-motion.png",
    fullPage: true,
  });
  await writeFile(
    "docs/responsive.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports));
  await context.close();
} finally {
  await browser.close();
  for (const sock of sockets) sock.disconnect();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
