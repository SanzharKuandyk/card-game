import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../../src/server/content/load.ts";
import {
  addMember,
  applyCommand,
  createSession,
  settleImmediate,
  tick,
} from "../../src/domain/session.ts";
import { project } from "../../src/server/projections/view.ts";
import type { Command } from "../../src/shared/model.ts";
const content = await loadContent();

test("team changes preserve builds, reserve capacity, wait for rooms and respect ownership", () => {
  const s = createSession("teams", "JOIN", 42, content);
  const context = {
    presence: {
      online: ["a", "b", "c", "d", "e", "f"],
      absentFor: {},
      hostOnline: true,
    },
  };
  const send = (id: string, command: Command) => {
    const result = applyCommand(
      s,
      id === "host" ? { role: "host" } : { role: "player", memberId: id },
      {
        requestId: crypto.randomUUID(),
        sessionId: s.id,
        encounterId: null,
        command,
      },
      context,
    );
    settleImmediate(s);
    return result;
  };
  for (const id of context.presence.online) addMember(s, id, id);
  send("a", { kind: "team", character: "guardian", name: "Red" });
  send("b", { kind: "team", character: "rogue", name: "Blue" });
  s.members.a!.hero.hp = 17;
  s.members.a!.hero.deck[0]!.upgraded = true;
  const hero = structuredClone(s.members.a!.hero);
  send("a", { kind: "team:change", crewId: "team-2" });
  assert.deepEqual(s.members.a!.hero, hero);
  assert(!s.crews["team-1"]!.members.includes("a"));
  send("host", {
    kind: "host",
    action: "move",
    memberId: "a",
    crewId: "team-1",
  });
  send("host", { kind: "host", action: "start" });
  send("a", { kind: "travel", nodeId: "r1-0" });
  const before = structuredClone(s.crews["team-1"]!.progress.combat);
  send("a", { kind: "team:change", crewId: "team-2" });
  assert.equal(s.members.a!.crewId, "team-1");
  assert.deepEqual(s.crews["team-1"]!.progress.combat, before);
  for (const id of ["c", "d"])
    send(id, { kind: "team", character: "alchemist", crewId: "team-2" });
  assert.throws(
    () => send("e", { kind: "team", character: "guardian", crewId: "team-2" }),
    /full/,
  );
  assert.throws(
    () =>
      send("b", {
        kind: "host",
        action: "move",
        memberId: "a",
        crewId: "team-2",
      }),
    /Host only/,
  );
  send("a", { kind: "team:cancel" });
  assert.equal(s.members.a!.pendingTeam, undefined);
  send("a", { kind: "team:change", crewId: "team-2" });
  const saved = structuredClone(s.members.a!.pendingTeam);
  assert.deepEqual(saved, { crewId: "team-2" });
  send("host", { kind: "host", action: "skip" });
  assert.equal(s.members.a!.crewId, "team-2");
  assert.equal(s.members.a!.pendingTeam, undefined);
  assert.deepEqual(s.members.a!.hero, hero);
  assert.equal(s.crews["team-2"]!.members.length, 4);
  send("host", { kind: "host", action: "boss", gate: 8 });
  send("a", { kind: "team:change", crewId: "team-1" });
  assert.equal(s.members.a!.crewId, "team-2");
  assert(s.members.a!.pendingTeam);
  send("host", { kind: "host", action: "skip" });
  assert.equal(s.members.a!.crewId, "team-1");
  assert.deepEqual(s.members.a!.hero, hero);
  send("host", { kind: "host", action: "boss", gate: 15 });
  send("a", { kind: "team:change", crewId: "team-2" });
  send("host", { kind: "host", action: "end" });
  assert.equal(s.status, "finished");
  assert.equal(s.members.a!.crewId, "team-1");
});

test("removed players disappear from live actors, free seats and never block the surviving team", () => {
  const s = createSession("remove", "JOIN", 42, content);
  const context = {
    presence: { online: ["a", "b"], absentFor: {}, hostOnline: true },
  };
  const send = (id: string, command: Command) => {
    applyCommand(
      s,
      id === "host" ? { role: "host" } : { role: "player", memberId: id },
      {
        requestId: crypto.randomUUID(),
        sessionId: s.id,
        encounterId: s.crews["team-1"]?.progress.combat?.id ?? null,
        command,
      },
      context,
    );
    settleImmediate(s);
  };
  for (const id of ["a", "b"]) {
    addMember(s, id, id);
    send(id, {
      kind: "team",
      character: "guardian",
      ...(id === "a" ? { name: "Red" } : { crewId: "team-1" }),
    });
  }
  send("host", { kind: "host", action: "start" });
  send("a", { kind: "travel", nodeId: "r1-0" });
  send("b", { kind: "travel", nodeId: "r1-0" });
  const fight = s.crews["team-1"]!.progress.combat!;
  const hp = fight.enemies[0]!.hp;
  send("host", { kind: "host", action: "remove", memberId: "b" });
  const view = project(s, { role: "projector" }, context);
  assert.deepEqual(
    view.crews[0]!.members.map((m) => m.id),
    ["a"],
  );
  assert.deepEqual(
    view.crews[0]!.board!.actors.map((m) => m.memberId),
    ["a"],
  );
  assert.equal(fight.enemies[0]!.hp, hp);
  assert.throws(() => send("b", { kind: "takeover" }), /not active/);
  send("a", { kind: "end-turn", ended: true });
  tick(s, 1, context);
  assert.equal(fight.phase, "enemy");
  send("host", { kind: "host", action: "remove", memberId: "a" });
  assert.equal(s.crews["team-1"]!.progress.phase, "defeat");
  assert.equal(
    project(s, { role: "projector" }, context).crews[0]!.board!.actors.length,
    0,
  );
});
