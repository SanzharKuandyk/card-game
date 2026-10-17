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
  for (let i = 0; i < 4; i++) {
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
          historyReachable: (() => {
            const box = document
              .querySelector(".scene-history")!
              .getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight;
          })(),
          actorCount: document.querySelectorAll(".combat-arena .hero").length,
          arenaScroll: (() => {
            const arena = document.querySelector(".combat-arena")!;
            return arena.scrollHeight > arena.clientHeight;
          })(),
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

  await page
    .locator(".map-node.available")
    .filter({ hasText: "Battle" })
    .first()
    .click();
  for (const player of players.slice(1, 3))
    await send(player.sock, session.id, { kind: "travel", nodeId: "r1-0" });
  await page.getByRole("heading", { name: "Turn 1" }).waitFor();

  await capture("scene-team");
  const combat = server.app.sessions.get(session.id)!.crews["team-1"]!.progress
    .combat!;
  const actor = combat.actors[players[0]!.memberId]!;
  actor.hand.push(...actor.draw.splice(0, 10 - actor.hand.length));
  actor.handRevision++;
  server.app.onPublish(session.id);
  await page.locator(".hand .card").nth(9).waitFor();
  await capture("scene-full-hand");
  await page.setViewportSize({ width: 294, height: 534 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("dialog", { name: "History", exact: true }).waitFor();
  await page.screenshot({ path: "docs/screenshots/scene-history-294x534.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "History", exact: true })
    .waitFor({ state: "detached" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".hand .card").first().click();
  await capture("scene-selected");
  const state = server.app.sessions.get(session.id)!;
  const longNames = [...state.content.cards]
    .sort((a, b) => b.name.length - a.name.length)
    .slice(0, 10);
  actor.hand = longNames.map((card, i) => ({
    uid: `long-${i}`,
    cardId: card.id,
    upgraded: true,
  }));
  actor.handRevision++;
  const hero = state.members[players[0]!.memberId]!.hero;
  hero.deck = [...state.content.cards]
    .sort((a, b) => b.text.length - a.text.length)
    .map((card, i) => ({
      uid: `deck-${i}`,
      cardId: card.id,
      upgraded: i % 2 === 0,
    }));
  server.app.onPublish(session.id);
  await page.locator('[data-card-uid="long-0"]').waitFor();
  await capture("card-long-names");
  const populated = server.app.sessions.get(session.id)!.crews["team-1"]!
    .progress.combat!;
  populated.enemies[0]!.poison = 5;
  populated.enemies[0]!.weak = 2;
  populated.enemies[0]!.vulnerable = 1;
  populated.actors[players[0]!.memberId]!.powers.strength = 2;
  populated.actors[players[0]!.memberId]!.powers["keep-block"] = 1;
  server.app.onPublish(session.id);
  await page.locator(".enemy-unit .actor-effects").waitFor();
  await capture("scene-effects");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: /^Poison 5/ }).click();
  await page.getByRole("dialog", { name: / · (Poison 5|Effects)/ }).waitFor();
  await page.screenshot({ path: "docs/screenshots/effect-explanation.png" });
  await page.keyboard.press("Escape");
  for (const profile of [
    { width: 390, height: 844, top: 47, bottom: 34, side: 0 },
    { width: 844, height: 390, top: 0, bottom: 21, side: 47 },
  ]) {
    await page.setViewportSize(profile);
    await page.evaluate(({ top, bottom, side }) => {
      for (const [edge, amount] of Object.entries({
        top,
        bottom,
        left: side,
        right: side,
      }))
        document.documentElement.style.setProperty(
          `--safe-${edge}`,
          `${amount}px`,
        );
    }, profile);
    await page.screenshot({
      path: `docs/screenshots/safe-area-${profile.width}x${profile.height}.png`,
    });
    reports.push({
      scene: "safe-area",
      ...profile,
      ...(await page.evaluate(({ top, bottom, side }) => {
        const header = document
          .querySelector(".battle-heading")!
          .getBoundingClientRect();
        const footer = document
          .querySelector(".play-footer")!
          .getBoundingClientRect();
        return {
          controlsInsideSafeArea:
            header.top >= top &&
            header.left >= side &&
            header.right <= innerWidth - side &&
            footer.bottom <= innerHeight - bottom,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      }, profile)),
    });
  }
  await page.evaluate(() => {
    for (const edge of ["top", "bottom", "left", "right"])
      document.documentElement.style.removeProperty(`--safe-${edge}`);
  });
  await page.getByRole("button", { name: /^Cards ·/ }).click();
  await page.locator("dialog[open]").waitFor();
  for (const [width, height] of [
    [360, 800],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.screenshot({
      path: `docs/screenshots/card-deck-${width}x${height}.png`,
    });
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  state.crews["team-1"]!.progress.phase = "reward";
  state.rewards.push({
    id: "visual-reward",
    memberId: hero.memberId,
    source: "battle:visual",
    offers: hero.deck.slice(0, 3),
    claimed: false,
    selected: null,
  });
  server.app.onPublish(session.id);
  await page
    .getByRole("heading", { name: "Choose a card", exact: true })
    .waitFor();
  for (const [width, height] of [
    [360, 800],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.screenshot({
      path: `docs/screenshots/card-reward-${width}x${height}.png`,
      fullPage: true,
    });
  }
  await writeFile(
    "docs/scene-responsive.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports));
} finally {
  for (const sock of sockets) sock.disconnect();
  await browser.close();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
