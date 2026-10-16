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
  for (let i = 0; i < 1; i++) {
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
  await page.locator(".map-node.available").first().click();
  await page.getByRole("heading", { name: "Turn 1" }).waitFor();
  const state = server.app.sessions.get(session.id)!;
  const combat = state.crews["team-1"]!.progress.combat!;
  const actor = combat.actors[players[0]!.memberId]!;
  actor.hand = ["shield-strike", "heavy-swing", "guard", "guard", "brace"].map(
    (cardId, i) => ({ cardId, uid: "inspect-" + i, upgraded: false }),
  );
  actor.handRevision++;
  server.app.onPublish(session.id);
  await page.locator('[data-card-uid="inspect-0"]').click();
  const reports = [];
  for (const [width, height] of [
    [388, 619],
    [388, 650],
    [360, 700],
    [360, 800],
    [294, 534],
    [667, 375],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.screenshot({
      path: "docs/screenshots/compact-action-" + width + "x" + height + ".png",
    });
    reports.push({
      width,
      height,
      ...(await page.evaluate(() => {
        const description = document.querySelector(".selected-description")!;
        const text = description.querySelector(".rich-card-text")!;
        const select = document.querySelector(".enemy-target")!;
        const footer = document.querySelector(".play-footer")!;
        const area = document.querySelector(".action-details")!;
        return {
          noOverlap:
            description.getBoundingClientRect().bottom <=
            select.getBoundingClientRect().top,
          footerVisible: footer.getBoundingClientRect().bottom <= innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          descriptionEllipsis: getComputedStyle(text).textOverflow,
          detailScroll: area.scrollHeight > area.clientHeight,
        };
      })),
    });
  }
  await page.setViewportSize({ width: 388, height: 619 });
  const trigger = page.getByRole("button", { name: "Explain card keywords" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Card keywords" });
  await dialog.waitFor();
  const full = await dialog.locator(".full-card-description").innerText();
  if (full !== state.content.cards.find((c) => c.id === "shield-strike")!.text)
    throw new Error("Full description missing");
  await page.screenshot({
    path: "docs/screenshots/compact-action-details.png",
  });
  await page.keyboard.press("Escape");
  if (!(await trigger.evaluate((el) => document.activeElement === el)))
    throw new Error("Focus not restored");
  await writeFile(
    "docs/compact-action-responsive.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports));
} finally {
  for (const sock of sockets) sock.disconnect();
  await browser.close();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
