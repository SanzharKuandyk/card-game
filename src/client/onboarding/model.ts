import type { Character, CombatView } from "../../shared/model.ts";

export const LearningHintId = {
  Choose: "choose",
  More: "more",
  Defence: "defence",
  Combination: "combination",
  End: "end",
} as const;
export type LearningHintId =
  (typeof LearningHintId)[keyof typeof LearningHintId];
export const LearningAnchor = {
  Hand: "hand",
  Energy: "energy",
  Intent: "intent",
  EndTurn: "end-turn",
} as const;
export type LearningAnchor =
  (typeof LearningAnchor)[keyof typeof LearningAnchor];
export interface LearningProgress {
  version: 1;
  hidden: boolean;
  seen: LearningHintId[];
}
export interface LearningHint {
  id: LearningHintId;
  text: string;
  anchor: LearningAnchor;
  cardUids: string[];
}
export interface LearningContext {
  combat: CombatView | null;
  memberId: string | null;
  character: Character | null;
  progress: LearningProgress;
  available: boolean;
  selected: boolean;
  hasPlayed: boolean;
}
export function emptyLearningProgress(): LearningProgress {
  return { version: 1, hidden: false, seen: [] };
}
export function decodeLearningProgress(raw: string | null): LearningProgress {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      value?.version !== 1 ||
      typeof value.hidden !== "boolean" ||
      !Array.isArray(value.seen) ||
      value.seen.some(
        (id: unknown) =>
          !Object.values(LearningHintId).includes(id as LearningHintId),
      )
    )
      return emptyLearningProgress();
    return {
      version: 1,
      hidden: value.hidden,
      seen: [...new Set<LearningHintId>(value.seen)],
    };
  } catch {
    return emptyLearningProgress();
  }
}
