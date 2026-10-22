import type { Member, Session } from "../shared/model.ts";

export interface TeamChoice {
  crewId?: string;
  name?: string;
}

export function activeTeam(s: Session, crewId: string): boolean {
  return !!s.crews[crewId]?.members.some(
    (id) => s.members[id] && !s.members[id]!.removed,
  );
}

export function removeTeam(s: Session, crewId: string): void {
  if (s.status !== "lobby")
    throw new Error("Teams can only be removed in the lobby");
  const crew = s.crews[crewId];
  if (!crew || !activeTeam(s, crewId)) throw new Error("Team not found");
  for (const m of Object.values(s.members)) {
    if (m.crewId === crewId && !m.removed) {
      m.crewId = null;
      delete m.pendingTeam;
    }
    if (m.pendingTeam?.crewId === crewId) delete m.pendingTeam;
  }
  // Keep the record so stable team IDs and saved historical references survive.
  crew.members = [];
  crew.progress.votes = {};
  crew.progress.choices = {};
  s.notice = `${crew.name} removed`;
}

function checkDestination(s: Session, m: Member, choice: TeamChoice): void {
  if (s.status === "finished") throw new Error("Session has ended");
  if (choice.crewId) {
    const crew = s.crews[choice.crewId];
    if (!crew || !activeTeam(s, choice.crewId))
      throw new Error("Team not found");
    const reserved = Object.values(s.members).filter(
      (other) =>
        !other.removed &&
        other.id !== m.id &&
        (other.crewId === crew.id || other.pendingTeam?.crewId === crew.id),
    ).length;
    if (reserved >= 4) throw new Error("Team is full");
  }
}

function safeToMove(s: Session, m: Member): boolean {
  return (
    s.activeBossGate === null &&
    (s.status === "lobby" ||
      !m.crewId ||
      ["map", "defeat", "finished"].includes(s.crews[m.crewId]!.progress.phase))
  );
}

function move(s: Session, m: Member, choice: TeamChoice): void {
  let crew = choice.crewId ? s.crews[choice.crewId] : undefined;
  if (!crew) {
    const n = Object.keys(s.crews).length;
    const id = `team-${n + 1}`;
    crew = {
      id,
      name: choice.name ?? `Team ${n + 1}`,
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
  if (m.crewId && m.crewId !== crew.id) {
    const old = s.crews[m.crewId]!;
    old.members = old.members.filter((id) => id !== m.id);
    delete old.progress.votes[m.id];
    delete old.progress.choices[m.id];
  }
  m.crewId = crew.id;
  if (!crew.members.includes(m.id)) crew.members.push(m.id);
  delete m.pendingTeam;
}

export function changeTeam(s: Session, m: Member, choice: TeamChoice): string {
  checkDestination(s, m, choice);
  if (choice.crewId === m.crewId) {
    delete m.pendingTeam;
    return "Team change cancelled";
  }
  if (safeToMove(s, m)) {
    move(s, m, choice);
    return "Joined team";
  }
  m.pendingTeam = {
    ...(choice.crewId ? { crewId: choice.crewId } : {}),
    ...(choice.name ? { name: choice.name } : {}),
  };
  return "Team change saved · after this room";
}

export function applyTeamChanges(s: Session): void {
  if (s.status === "finished") return;
  for (const m of Object.values(s.members)) {
    if (m.removed || !m.pendingTeam) continue;
    if (m.pendingTeam.crewId && !activeTeam(s, m.pendingTeam.crewId)) {
      delete m.pendingTeam;
      continue;
    }
    if (!safeToMove(s, m)) continue;
    // Capacity is reserved when the request is saved, including late joins.
    checkDestination(s, m, m.pendingTeam);
    move(s, m, m.pendingTeam);
  }
}
