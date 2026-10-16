import type { Session } from "../shared/model.ts";
export function grantGold(
  s: Session,
  memberId: string,
  source: string,
  amount: number,
): void {
  const key = `${source}:${memberId}`;
  if (s.economyGrants[key] !== undefined) return;
  s.economyGrants[key] = amount;
  s.members[memberId]!.hero.gold += amount;
}
