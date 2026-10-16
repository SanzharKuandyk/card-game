import { test, expect, webkit } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server/main.ts";
import type { SessionView } from "../../src/shared/model.ts";
type Running = Awaited<ReturnType<typeof createServer>>;
let server: Running, base: string, dataDir: string;
test.beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cards-browser-"));
  server = await createServer({
    dataDir,
    automaticTicks: false,
    sessionSeed: 42,
  });
  await server.http.listen({ port: 0, host: "127.0.0.1" });
  const address = server.http.server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  base = `http://127.0.0.1:${address.port}`;
});
test.afterEach(async () => {
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
});
async function host(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/#host`);
  await expect(page.getByLabel("Host code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page).toHaveURL(/\/host\/[\da-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Host", exact: true }),
  ).toBeVisible();
  const id = page.url().split("/host/")[1]!;
  const s = server.app.sessions.get(id)!;
  return { context, page, id, code: s.code };
}
async function player(
  browser: Browser,
  code: string,
  name: string,
  character = "guardian",
  crew?: string,
) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${base}/join/${code}`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  if (crew) await page.getByLabel("Choose team").selectOption({ label: crew });
  else await page.getByLabel("Team name").fill(`${name} team`);
  await page
    .getByRole("button", { name: new RegExp(`^${character}`, "i") })
    .click();
  await page.getByRole("button", { name: "Join team" }).click();
  await expect(
    page.getByText("Waiting to start", { exact: true }),
  ).toBeVisible();
  return { context, page };
}
async function view(context: BrowserContext, id: string): Promise<SessionView> {
  const r = await context.request.get(`${base}/api/session/${id}`);
  return (await r.json()) as SessionView;
}
async function playAvailable(page: Page, context: BrowserContext, id: string) {
  const v = await view(context, id);
  const b = v.combat!;
  const actor = b.actors.find((a) => a.memberId === v.memberId)!;
  const priorities: Record<string, number> = {
    relay: b.actors.some(
      (a) => a.crewId === actor.crewId && a.memberId !== actor.memberId,
    )
      ? 110
      : 50,
    "blood-spark": actor.hp >= 8 ? 110 : -1,
    charge: 90,
    windup: (actor.powers.charge ?? 0) >= 6 ? 100 : 65,
    brace: b.hand.some((c) => c.cardId === "shield-strike") ? 95 : 30,
    "shield-strike": actor.block > 0 ? 100 : -1,
    "heavy-swing": 75,
    strike: 60,
    guard: 20,
  };
  const cards = [...b.hand].sort((x, y) => {
    const priority = (c: typeof x) =>
      priorities[c.cardId] ??
      (c.definition.type === "power" && b.turn <= 2 ? 80 : 40);
    return priority(y) - priority(x);
  });
  for (const card of cards) {
    if ((priorities[card.cardId] ?? 0) < 0) continue;
    if (
      card.cost > actor.energy ||
      card.definition.choose ||
      ["hand", "discard", "ally", "any-hero"].includes(card.definition.target)
    )
      continue;
    await page.locator(`[data-card-uid="${card.uid}"]`).click();
    await page.getByRole("button", { name: /^Play(?: ·|$)/ }).click();
    return true;
  }
  return false;
}

test("phone fallback, practice and foreground recovery in WebKit", async ({
  browser,
}) => {
  const h = await host(browser);
  const safari = await webkit.launch();
  try {
    const phone = await safari.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    // Local HTTP on older phones has getRandomValues, but no randomUUID.
    await phone.addInitScript(() =>
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: undefined,
        configurable: true,
      }),
    );
    // A tunnel/Wi-Fi may reject WebSocket upgrades; polling must remain usable.
    await phone.routeWebSocket("**/socket.io/**", (socket) => socket.close());
    const page = await phone.newPage();
    await page.goto(`${base}/join/${h.code}`);
    await page.getByLabel("Name", { exact: true }).fill("Phone player");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.getByRole("button", { name: /^guardian/i }).click();
    await page.getByRole("button", { name: "Join team" }).click();
    await page.getByRole("button", { name: "Try a turn", exact: true }).click();
    const practice = page.getByRole("dialog", { name: "Try a turn" });
    await practice.getByRole("button", { name: /Strike, 1 energy/ }).click();
    await practice.getByRole("button", { name: /Practice enemy/ }).click();
    await practice.getByRole("button", { name: "Play", exact: true }).click();
    await expect(practice).toContainText("6/12 HP");
    await practice
      .getByRole("button", { name: "End turn", exact: true })
      .click();
    await practice.getByRole("button", { name: "Got it", exact: true }).click();
    await h.page.getByRole("button", { name: "Start", exact: true }).click();
    await page.locator(".route-node.available").first().click();
    await expect(
      page.getByRole("heading", { name: "Turn 1", exact: true }),
    ).toBeVisible();
    const saved = await view(phone, h.id);
    await expect(
      page.getByRole("button", { name: /^Your character: Phone player/ }),
    ).toContainText("YOU");
    await expect(
      page.getByRole("status", { name: "3 energy left" }),
    ).toBeVisible();
    const explained =
      saved.combat!.hand.find((c) => /Block|Exhaust/.test(c.definition.text)) ??
      saved.combat!.hand[0]!;
    await page.locator(`[data-card-uid="${explained.uid}"]`).click();
    await page
      .getByRole("button", { name: "Explain card keywords", exact: true })
      .click();
    const glossary = page.getByRole("dialog", {
      name: "Card keywords",
      exact: true,
    });
    await expect(glossary).toContainText("Spend it to play cards");
    await expect(glossary).toContainText(
      /Absorbs incoming damage|Remove a card from this fight/,
    );
    await glossary.getByRole("button", { name: "Done", exact: true }).click();
    expect((await view(phone, h.id)).combat!.hand.map((c) => c.uid)).toEqual(
      saved.combat!.hand.map((c) => c.uid),
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await phone.setOffline(true);
      await expect(page.locator(".connection-banner")).toContainText(
        "Reconnecting",
      );
      await phone.setOffline(false);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("pageshow"));
      });
      await expect(page.locator(".connection-banner")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "End turn", exact: true }),
      ).toBeEnabled();
      expect((await view(phone, h.id)).combat!.hand.map((c) => c.uid)).toEqual(
        saved.combat!.hand.map((c) => c.uid),
      );
      await expect(
        page.getByRole("button", { name: "Take control", exact: true }),
      ).toHaveCount(0);
    }
    await page.reload();
    await expect(
      page.getByRole("button", { name: "End turn", exact: true }),
    ).toBeEnabled();
    expect((await view(phone, h.id)).memberId).toBe(saved.memberId);
    // A transient namespace rejection disables Socket.IO's normal auto-retry.
    // Foreground recovery must retry it without needing another reload/tap.
    let rejectWake = true;
    server.io.use((socket, next) => {
      if (socket.handshake.auth.role === "player" && rejectWake) {
        rejectWake = false;
        next(new Error("Temporarily unavailable"));
      } else next();
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator(".connection-banner")).toContainText(
      "Reconnecting",
    );
    await expect(page.locator(".connection-banner")).toHaveCount(0, {
      timeout: 15000,
    });
    expect(rejectWake).toBe(false);
    expect((await view(phone, h.id)).combat!.hand.map((c) => c.uid)).toEqual(
      saved.combat!.hand.map((c) => c.uid),
    );
    const peer = [...server.io.sockets.sockets.values()].find(
      (s) => s.data.identity?.identity.memberId === saved.memberId,
    )!;
    let dropAck = true;
    peer.use((packet, next) => {
      if (packet[0] === "command" && packet[1]?.command?.kind === "request") {
        const ack = packet[packet.length - 1] as (value: unknown) => void;
        packet[packet.length - 1] = (value: unknown) => {
          if (dropAck) {
            dropAck = false;
            return;
          }
          ack(value);
        };
      }
      next();
    });
    await page.getByLabel("Team signal").selectOption("Ready");
    await expect
      .poll(async () => (await view(phone, h.id)).combat!.actors[0]!.request)
      .toBe("Ready");
    const committedRevision = server.app.sessions.get(h.id)!.revision;
    await phone.setOffline(true);
    await phone.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await expect
      .poll(() =>
        page.evaluate(
          (id) => sessionStorage.getItem(`pending:${id}:player`),
          h.id,
        ),
      )
      .toBeNull();
    expect(server.app.sessions.get(h.id)!.revision).toBe(committedRevision);
    await expect(
      page.getByRole("button", { name: "End turn", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "End turn", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Change", exact: true }),
    ).toBeVisible();
    await phone.close();
  } finally {
    await safari.close();
    await h.context.close();
  }
});
test("four-player fight, rotation, reward and reconnect", async ({
  browser,
}) => {
  const h = await host(browser);
  const players = [];
  for (const [i, ch] of [
    "guardian",
    "rogue",
    "alchemist",
    "channeler",
  ].entries())
    players.push(
      await player(
        browser,
        h.code,
        `Player ${i + 1}`,
        ch,
        i ? "Player 1 team · " + i + "/4" : undefined,
      ),
    );
  const popup = h.page.waitForEvent("popup");
  await h.page
    .getByRole("button", { name: "Join as player", exact: true })
    .click();
  const teacherPlayer = await popup;
  await expect(
    teacherPlayer.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  await h.page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    teacherPlayer.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  // Three of four votes commit the route; the fourth then has no open ballot.
  for (const p of players.slice(0, 3))
    await p.page
      .locator(".route-node.available")
      .filter({ hasText: "Battle" })
      .first()
      .click();
  await expect(
    players[0]!.page.getByRole("heading", { name: "Turn 1" }),
  ).toBeVisible();
  const liveProjector = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await liveProjector.goto(
    (await h.page
      .getByRole("link", { name: "Projector", exact: true })
      .getAttribute("href"))!,
  );
  const liveTeam = liveProjector.getByRole("article", {
    name: "Player 1 team board",
    exact: true,
  });
  await expect(liveTeam.locator(".board-member")).toHaveCount(4);
  await expect(liveProjector.locator("iframe")).toHaveCount(0);
  const initialHand = (await view(players[0]!.context, h.id)).combat!.hand;
  await players[0]!.page
    .locator(`[data-card-uid="${initialHand[0]!.uid}"]`)
    .click();
  await expect(liveTeam.locator(".board-member").first()).toContainText(
    "Player 1",
  );
  await expect(liveTeam.locator(".board-member").last()).toContainText(
    "Player 4",
  );
  await liveTeam.getByRole("button", { name: "Inspect Player 1 team" }).click();
  await expect(liveTeam.getByRole("dialog")).toContainText(
    initialHand[0]!.definition.name,
  );
  await liveTeam
    .getByRole("dialog")
    .getByRole("button", { name: "Close" })
    .click();
  await liveProjector.screenshot({
    path: "docs/screenshots/projector-live-fight.png",
    fullPage: true,
  });
  await players[0]!.page.setViewportSize({ width: 667, height: 375 });
  await expect(
    players[0]!.page.getByRole("button", { name: "End turn", exact: true }),
  ).toBeVisible();
  for (let round = 0; round < 8; round++) {
    for (const p of [players[3]!, ...players.slice(0, 3)]) {
      for (let i = 0; i < 3; i++) {
        const v = await view(p.context, h.id);
        if (v.progress?.phase !== "battle" || v.combat?.phase !== "player")
          break;
        if (!(await playAvailable(p.page, p.context, h.id))) break;
      }
    }
    const v = await view(players[0]!.context, h.id);
    if (v.rewards.length) break;
    for (const p of players)
      if ((await view(p.context, h.id)).combat?.phase === "player")
        await p.page
          .getByRole("button", { name: "End turn", exact: true })
          .click();
    await server.app.advance(1);
    await server.app.advance(8001);
  }
  await expect(
    players[0]!.page.getByRole("heading", { name: "Choose a card" }),
  ).toBeVisible();
  await expect(liveTeam.locator(":scope > header")).toContainText(
    "Choosing cards",
  );
  expect(
    server.app.sessions
      .get(h.id)!
      .crews[
        "team-1"
      ]!.progress.combat!.log.some((event) => event.kind === "combo"),
  ).toBeTruthy();
  await players[0]!.page
    .getByRole("button", { name: /energy$/ })
    .first()
    .click();
  await players[0]!.page
    .getByRole("button", { name: "Choose", exact: true })
    .click();
  await players[0]!.page.reload();
  await expect(
    players[0]!.page.getByRole("button", { name: /Cards · 11/ }),
  ).toBeVisible();
  await liveProjector.close();
  for (const p of players) await p.context.close();
  await h.page.goto(`${base}/`);
  await expect(
    h.page.getByRole("heading", { name: "Host", exact: true }),
  ).toBeVisible();
  await expect(h.page.getByLabel("Host code", { exact: true })).toHaveCount(0);
  await h.page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(h.page).toHaveURL(/\/host\/[\da-f-]+$/);
  await expect(h.page).not.toHaveURL(new RegExp(`/host/${h.id}$`));
  await expect(
    h.page.getByRole("heading", { name: "Host", exact: true }),
  ).toBeVisible();
  const freshId = h.page.url().split("/host/")[1]!;
  expect(Object.keys(server.app.sessions.get(freshId)!.members)).toHaveLength(
    0,
  );
  await h.page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(h.page).not.toHaveURL(new RegExp(`/host/${freshId}$`));
  await expect(
    h.page.getByRole("heading", { name: "Host", exact: true }),
  ).toBeVisible();
  await h.context.close();
});
test("card reveal, damage impact, reduced motion and finishing blow", async ({
  browser,
}) => {
  const h = await host(browser);
  const p = await player(browser, h.code, "Alex");
  await h.page.getByRole("button", { name: "Start", exact: true }).click();
  await p.page.locator(".route-node.available").first().click();
  await expect(
    p.page.getByRole("heading", { name: "Turn 1", exact: true }),
  ).toBeVisible();
  const session = server.app.sessions.get(h.id)!;
  const fight = Object.values(session.crews)[0]!.progress.combat!;
  const actor = Object.values(fight.actors)[0]!;
  // Reviewed fixed hand, then real UI commands and server outcomes.
  const intentionButton = p.page.getByRole("button", {
    name: /^Raider intention:/,
  });
  await intentionButton.click();
  await expect(
    p.page.getByRole("dialog", { name: "Raider · Sweep" }),
  ).toContainText("Alex: 6 damage before Block");
  await p.page.keyboard.press("Escape");
  await expect(intentionButton).toBeFocused();
  fight.enemies[0]!.poison = 3;
  actor.powers["keep-block"] = 1;
  server.app.onPublish(h.id);
  await p.page.getByRole("button", { name: "Poison 3", exact: true }).click();
  await expect(
    p.page.getByRole("dialog", { name: "Raider · Poison 3" }),
  ).toContainText("ignoring Block");
  await p.page.keyboard.press("Escape");
  await p.page.getByRole("button", { name: "Keep Block", exact: true }).click();
  await expect(
    p.page.getByRole("dialog", { name: "Alex · Keep Block" }),
  ).toContainText("stays when your next turn starts");
  await p.page.keyboard.press("Escape");
  fight.enemies[0]!.poison = 0;
  delete actor.powers["keep-block"];
  actor.hand = ["strike", "guard", "strike"].map((cardId, index) => ({
    uid: `feedback-${index}`,
    cardId,
    upgraded: false,
  }));
  actor.handRevision++;
  fight.enemies[0]!.block = 2;
  server.app.onPublish(h.id);
  await p.page.locator('[data-card-uid="feedback-0"]').click();
  await p.page.getByRole("button", { name: /^Play ·/ }).click();
  await expect(
    p.page.locator(".played-card-stage:not(.card-impact)"),
  ).toContainText("Alex played");
  await p.page.screenshot({ path: "docs/screenshots/card-reveal-360x800.png" });
  await expect(p.page.locator(".enemy .effect-burst")).toHaveText(
    "−4 HP · 2 blocked",
  );
  await p.page.screenshot({ path: "docs/screenshots/card-impact-360x800.png" });
  await expect(p.page.getByRole("region", { name: "Last play" })).toContainText(
    "2 blocked · 4 health lost",
  );
  await expect(p.page.locator(".played-card-stage")).toHaveCount(0);
  const history = p.page.getByRole("button", { name: "History", exact: true });
  await history.click();
  await expect(
    p.page.getByRole("dialog", { name: "History", exact: true }),
  ).toContainText("2 blocked · 4 health lost");
  await p.page.keyboard.press("Escape");
  await expect(
    p.page.getByRole("dialog", { name: "History", exact: true }),
  ).toHaveCount(0);
  await expect(history).toBeFocused();
  // Snapshot/resync does not play the accepted card twice.
  server.app.onPublish(h.id);
  await expect(p.page.locator(".played-card-stage")).toHaveCount(0);
  await p.page.reload();
  await expect(p.page.locator(".hand")).toBeVisible();
  await expect(p.page.locator(".played-card-stage")).toHaveCount(0);
  await p.page.emulateMedia({ reducedMotion: "reduce" });
  await p.page.bringToFront();
  await expect
    .poll(() => p.page.evaluate(() => document.visibilityState))
    .toBe("visible");
  await p.page.locator('[data-card-uid="feedback-1"]').click();
  await p.page.getByRole("button", { name: /^Play ·/ }).click();
  await expect(p.page.locator(".hero .effect-burst")).toHaveText("+5 Block");
  await expect(p.page.locator(".played-card-stage")).toBeHidden();
  await expect(p.page.getByRole("region", { name: "Last play" })).toContainText(
    "+5 Block",
  );
  await p.page.screenshot({
    path: "docs/screenshots/block-feedback-reduced-motion.png",
  });
  await p.page.emulateMedia({ reducedMotion: "no-preference" });
  await p.page.getByRole("button", { name: "End turn", exact: true }).click();
  await server.app.advance(1);
  await expect(p.page.locator(".combat-link.active")).toBeVisible();
  await expect(p.page.locator(".hero.own .hero-hp")).toContainText("40/40");
  await expect(p.page.locator(".personal-danger")).toContainText(
    "40 HP · 5 Block",
  );
  await expect(p.page.locator(".hero.own .effect-burst")).toHaveCount(0);
  await p.page.screenshot({
    path: "docs/screenshots/enemy-windup-360x800.png",
  });
  await expect(p.page.getByRole("region", { name: "Last play" })).toContainText(
    "5 blocked · 1 health lost",
  );
  await expect(p.page.locator(".hero.own .hero-hp")).toContainText("39/40");
  await expect(p.page.locator(".personal-danger")).toContainText(
    "39 HP · 0 Block",
  );
  await p.page.screenshot({
    path: "docs/screenshots/enemy-impact-360x800.png",
  });
  await server.app.advance(8001);
  const currentFight = Object.values(server.app.sessions.get(h.id)!.crews)[0]!
    .progress.combat!;
  const currentActor = Object.values(currentFight.actors)[0]!;
  currentActor.hand = [
    { uid: "last-strike", cardId: "strike", upgraded: false },
  ];
  currentActor.handRevision++;
  currentFight.enemies[0]!.hp = 4;
  server.app.onPublish(h.id);
  await p.page.emulateMedia({ reducedMotion: "no-preference" });
  await p.page.locator('[data-card-uid="last-strike"]').click();
  await p.page.getByRole("button", { name: /^Play ·/ }).click();
  await expect(
    p.page.locator(".played-card-stage:not(.card-impact)"),
  ).toBeVisible();
  await expect(
    p.page.getByRole("heading", { name: "Choose a card", exact: true }),
  ).toHaveCount(0);
  await expect(p.page.getByRole("region", { name: "Last play" })).toContainText(
    "Victory",
  );
  await expect(
    p.page.getByRole("heading", { name: "Choose a card", exact: true }),
  ).toBeVisible();
  await p.context.close();
  await h.context.close();
});

test("projector keeps two team plays and impacts in their own tiles", async ({
  browser,
}) => {
  const h = await host(browser);
  const alex = await player(browser, h.code, "Alex");
  const sam = await player(browser, h.code, "Sam");
  await h.page.getByRole("button", { name: "Start", exact: true }).click();
  for (const p of [alex, sam]) {
    await p.page.locator(".route-node.available").first().click();
    await expect(
      p.page.getByRole("heading", { name: "Turn 1", exact: true }),
    ).toBeVisible();
  }
  const projector = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await projector.goto(
    (await h.page
      .getByRole("link", { name: "Projector", exact: true })
      .getAttribute("href"))!,
  );
  const tiles = ["Alex team", "Sam team"].map((name) =>
    projector.getByRole("article", { name: `${name} board`, exact: true }),
  );
  await expect(tiles[1]!).toBeVisible();
  const beforeViewSwitch = JSON.stringify(server.app.sessions.get(h.id)!.crews);
  for (let i = 0; i < 3; i++) {
    await projector.getByRole("button", { name: "Map", exact: true }).click();
    await expect(projector.locator(".shared-map.map-projector")).toBeVisible();
    await expect(tiles[1]!).toBeHidden();
    await projector
      .getByRole("button", { name: "Battles", exact: true })
      .click();
    await expect(tiles[1]!).toBeVisible();
  }
  expect(JSON.stringify(server.app.sessions.get(h.id)!.crews)).toBe(
    beforeViewSwitch,
  );
  for (const [i, crew] of Object.values(
    server.app.sessions.get(h.id)!.crews,
  ).entries()) {
    const fight = crew.progress.combat!;
    const actor = Object.values(fight.actors)[0]!;
    actor.hand = [
      {
        uid: `projector-${i}`,
        cardId: i ? "guard" : "strike",
        upgraded: false,
      },
    ];
    actor.handRevision++;
    fight.enemies[0]!.block = 2;
  }
  server.app.onPublish(h.id);
  await alex.page.locator('[data-card-uid="projector-0"]').click();
  await sam.page.locator('[data-card-uid="projector-1"]').click();
  await Promise.all(
    [alex.page, sam.page].map((page) =>
      page.getByRole("button", { name: /^Play ·/ }).click(),
    ),
  );
  await expect(tiles[0]!.locator(".board-playback")).toContainText("Strike");
  await expect(tiles[1]!.locator(".board-playback")).toContainText("Guard");
  await expect(tiles[0]!.locator(".board-enemies .effect-burst")).toHaveText(
    "−4 HP · 2 blocked",
  );
  await expect(tiles[1]!.locator(".board-member .effect-burst")).toHaveText(
    "+5 Block",
  );
  await projector.screenshot({
    path: "docs/screenshots/projector-team-impacts.png",
  });
  await expect(projector.locator("iframe, .played-card-stage")).toHaveCount(0);
  await expect(projector.locator(".board-playback.is-playing")).toHaveCount(0);
  server.app.onPublish(h.id);
  await expect(projector.locator(".board-playback.is-playing")).toHaveCount(0);
  await projector.reload();
  await expect(tiles[1]!).toBeVisible();
  await expect(projector.locator(".board-playback.is-playing")).toHaveCount(0);
  await projector.emulateMedia({ reducedMotion: "reduce" });
  for (const p of [alex, sam])
    await p.page.getByRole("button", { name: "End turn", exact: true }).click();
  await expect
    .poll(() =>
      Object.values(server.app.sessions.get(h.id)!.crews).every((c) =>
        Object.values(c.progress.combat!.actors).every((a) => a.ended),
      ),
    )
    .toBe(true);
  await server.app.advance(1);
  await expect(tiles[0]!.locator(".board-playback")).toContainText(
    "6 health lost",
  );
  await expect(tiles[1]!.locator(".board-playback")).toContainText(
    "5 blocked · 1 health lost",
  );
  await projector.setViewportSize({ width: 1366, height: 768 });
  await projector.screenshot({
    path: "docs/screenshots/projector-enemy-impacts.png",
  });
  expect(
    await projector.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await server.app.advance(8001);
  const fight = Object.values(server.app.sessions.get(h.id)!.crews)[0]!.progress
    .combat!;
  const actor = Object.values(fight.actors)[0]!;
  actor.hand = [{ uid: "projector-finish", cardId: "strike", upgraded: false }];
  actor.handRevision++;
  fight.enemies[0]!.hp = 4;
  server.app.onPublish(h.id);
  await alex.page.locator('[data-card-uid="projector-finish"]').click();
  await alex.page.getByRole("button", { name: /^Play ·/ }).click();
  await expect(tiles[0]!.locator(".board-playback")).toContainText("Victory");
  await expect(tiles[0]!.locator(".board-playback")).toContainText(
    "4 health lost",
  );
  await projector.close();
  await alex.context.close();
  await sam.context.close();
  await h.context.close();
});
