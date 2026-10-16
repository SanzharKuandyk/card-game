export const QuizStage = {
  Announce: "announce",
  Demonstrate: "demonstrate",
  Answer: "answer",
  Reveal: "reveal",
  Reward: "reward",
  Complete: "complete",
  Skipped: "skipped",
} as const;
export type QuizStage = (typeof QuizStage)[keyof typeof QuizStage];
export interface ReplayStep {
  scene: {
    nodes: {
      shape: "circle" | "box" | "text";
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      role: "actor" | "object" | "sensor" | "danger" | "hint";
    }[];
    lines: { x1: number; y1: number; x2: number; y2: number }[];
  };
  label: string;
  detail: string;
  image: "jump" | "movement" | "physics" | "collision";
}
export interface QuizQuestion {
  id: string;
  topic: "movement" | "physics" | "collision";
  kind: "predict" | "repair";
  prompt: string;
  rule: string;
  options: { id: string; text: string; explanation: string }[];
  correctOptionId: string;
  setupReplay: ReplayStep[];
  resultReplay: ReplayStep[];
  source: { week: 6; physicalSlides: number[] };
}
export interface QuizRound {
  questionId: string;
  optionOrder: string[];
  submissions: Record<
    string,
    { optionId: string; submittedAtActiveMs: number }
  >;
  result: { correctByCrew: Record<string, number>; reduction: number } | null;
}
export interface QuizEvent {
  id: string;
  gate: number;
  triggerCrewId: string | null;
  rosterByCrew: Record<string, string[]>;
  stage: QuizStage;
  phaseRevision: number;
  roundIndex: number;
  startedAt: number;
  deadline: number;
  rounds: QuizRound[];
  settlement: {
    tiers: Record<string, "basic" | "uncommon" | "rare">;
    rewardIds: string[];
  } | null;
}
export interface QuizView {
  optionLabels: Record<string, string>;
  id: string;
  gate: number;
  triggerCrewId: string | null;
  stage: QuizStage;
  phaseRevision: number;
  roundIndex: number;
  remainingMs: number;
  enrolled: boolean;
  question:
    | (Omit<QuizQuestion, "correctOptionId" | "resultReplay" | "options"> & {
        options: { id: string; text: string }[];
      })
    | null;
  ownAnswer: string | null;
  teams: {
    id: string;
    name: string;
    correct: number | null;
    possible: number;
    tier: string | null;
    members: {
      id: string;
      name: string;
      submitted: boolean;
      optionId?: string | null;
      correct?: boolean;
    }[];
  }[];
  reveal: {
    correctOptionId: string;
    explanations: Record<string, string>;
    replay: ReplayStep[];
    reduction: number;
  } | null;
}
