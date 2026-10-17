import type { QuizEvent, QuizQuestion, QuizView } from "./quiz-types.ts";
import type { EconomyRules, PlayerShop } from "./shop-types.ts";
import type {
  OwnedRelic,
  EncounterRelics,
  RelicDefinition,
  RelicReward,
} from "./relic-types.ts";
export const Character = {
  Guardian: "guardian",
  Rogue: "rogue",
  Alchemist: "alchemist",
  Channeler: "channeler",
} as const;
export type Character = (typeof Character)[keyof typeof Character];
export const Room = {
  Battle: "battle",
  Elite: "elite",
  Rest: "rest",
  Event: "event",
  Boss: "boss",
  Shop: "shop",
} as const;
export type Room = (typeof Room)[keyof typeof Room];
export const Status = {
  Lobby: "lobby",
  Running: "running",
  Paused: "paused",
  Finished: "finished",
} as const;
export type Status = (typeof Status)[keyof typeof Status];
export type Rarity = "common" | "uncommon" | "rare" | "token";
export type Target =
  | "enemy"
  | "self"
  | "ally"
  | "any-hero"
  | "hand"
  | "discard"
  | "none";
export type EffectOp =
  | "damage"
  | "block"
  | "draw"
  | "energy"
  | "lose-hp"
  | "poison"
  | "weak"
  | "vulnerable"
  | "strength"
  | "power"
  | "discard"
  | "exhaust"
  | "recover"
  | "generate"
  | "retain"
  | "reduce-cost"
  | "copy"
  | "double-block"
  | "spend-block"
  | "repeat-ally"
  | "charge"
  | "heal"
  | "all-block"
  | "all-energy"
  | "self-block"
  | "strip-block"
  | "consume-poison"
  | "spend-charge";
export interface Effect {
  op: EffectOp;
  amount: number;
  key?: string;
  scale?:
    | "block"
    | "attacks"
    | "discarded"
    | "exhausted"
    | "poison"
    | "charge"
    | "lost-hp"
    | "other-attacks";
  all?: boolean;
  limit?: number;
  pool?: number;
  hits?: number;
  factor?: number;
}
export interface CardVersion {
  cost: number;
  text: string;
  effects: Effect[];
}
export interface CardDefinition extends CardVersion {
  id: string;
  name: string;
  character: Character | "shared";
  rarity: Rarity;
  type: "attack" | "skill" | "power";
  target: Target;
  tags: string[];
  upgrade: CardVersion;
  exhaust?: boolean;
  retain?: boolean;
  choose?: "hand" | "discard";
  crossTeam?: boolean;
  discardEffect?: Effect[];
  exhaustOnDiscard?: boolean;
  nonCopyable?: boolean;
  requiresTeam?: boolean;
}
export interface CardInstance {
  uid: string;
  cardId: string;
  upgraded: boolean;
  generated?: boolean;
  costDelta?: number;
  heldAcrossTurn?: boolean;
}
export interface Hero {
  gold: number;
  relics: OwnedRelic[];
  deckRevision: number;
  removalCount: number;
  memberId: string;
  character: Character;
  hp: number;
  maxHp: number;
  deck: CardInstance[];
}
export interface BattleActor {
  relicState?: EncounterRelics;
  memberId: string;
  crewId: string;
  hp: number;
  maxHp: number;
  energy: number;
  block: number;
  hand: CardInstance[];
  draw: CardInstance[];
  discard: CardInstance[];
  exhaust: CardInstance[];
  powers: Record<string, number>;
  counters: Record<string, number>;
  ended: boolean;
  handRevision: number;
  recovery: boolean;
  request: string;
  blockSources: { sourceId: string; remaining: number }[];
  energySources: { sourceId: string; remaining: number }[];
}
export interface EnemyPortrait {
  id: string;
  enemyName?: string;
  path: string;
  alt: string;
  position: string;
  fit?: "cover" | "contain";
  download?: string;
  rightsStatus?: "verified" | "unverified";
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  checkedAt: string;
  changes: string;
}
export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  poison: number;
  weak: number;
  vulnerable: number;
  strength: number;
  pattern: string;
  repeat: { donorId: string; amount: number; allowSelf?: boolean } | null;
  portrait?: Pick<EnemyPortrait, "id" | "path" | "alt" | "position" | "fit">;
  tactics?: {
    version: 1;
    damageThisTurn: number;
    interruptedTurn?: number;
    brokenTurn?: number;
  };
}
export interface Intent {
  enemyId: string;
  label: string;
  kind: "attack" | "guard" | "summon" | "charge";
  targets: { memberId: string; damage: number }[];
  block: number;
  detail?: string;
}
export interface CombatEvent {
  id: number;
  turn: number;
  kind: string;
  sourceId: string;
  targetId: string;
  amount: number;
  text: string;
  blocked?: number;
  // Public visual checkpoint, captured at this effect rather than the next snapshot.
  targetState?: { hp: number; block: number; energy?: number };
  sourceEnergy?: number;
  relicId?: string;
  card?: { id: string; upgraded: boolean; cost: number; text: string };
}
export interface Contribution {
  damage: number;
  protection: number;
  helped: string[];
}
export interface Combat {
  depthVersion?: 1;
  openingRoom?: boolean;
  id: string;
  kind: "route" | "boss";
  turn: number;
  phase: "player" | "enemy" | "prediction" | "prediction-result" | "result";
  actors: Record<string, BattleActor>;
  enemies: Enemy[];
  intents: Intent[];
  deadline: number;
  rng: number;
  log: CombatEvent[];
  eventSequence: number;
  result: "victory" | "defeat" | "skipped" | null;
  contributions: Record<string, Contribution>;
  reduction: number;
  predictionId: string | null;
  answers: Record<string, number>;
  revealedPredictionIds: string[];
  queuedCardUid: number;
}
export interface MapNode {
  id: string;
  row: number;
  lane: number;
  kind: Room;
  next: string[];
  encounterId?: string;
  risk?: "standard" | "dangerous" | "severe";
  pressure?: number;
}
export interface Prediction {
  id: string;
  title: string;
  rule: string;
  steps: string[];
  choices: string[];
  correct: number;
  explanations: string[];
  source: { week: number; slides: number[] };
}
export interface EnemyTemplate {
  portrait?: string;
  portraitPool?: string[];
  id: string;
  name: string;
  pattern: string;
  weight: number;
}
export interface EventDefinition {
  id: string;
  title: string;
  text: string;
  choices: {
    label: string;
    effect: "heal" | "upgrade" | "remove" | "card";
    amount: number;
    text: string;
  }[];
}
export interface Content {
  portraits?: EnemyPortrait[];
  depth?: {
    version: 1;
    cards: number;
    relics: number;
    fixedEncounters?: Record<string, string>;
  };
  version: string;
  hash: string;
  cards: CardDefinition[];
  starters: Record<Character, string[]>;
  map: MapNode[];
  predictions: Prediction[];
  enemies: EnemyTemplate[];
  sources: {
    week: number;
    file: string;
    reference: string;
    slideCount: number;
  }[];
  events: EventDefinition[];
  quizzes: QuizQuestion[];
  relics: RelicDefinition[];
  economy: EconomyRules;
  quizTiming: {
    announce: number;
    demonstrate: number;
    answer: number;
    minimumAnswer: number;
    reveal: number;
    reward: number;
  };
  timing: {
    openingTurn?: number;
    turn: number;
    enemy: number;
    intro: number;
    prediction: number;
    feedback: number;
    vote: number;
  };
}
export interface Member {
  id: string;
  name: string;
  crewId: string | null;
  hero: Hero;
  removed: boolean;
  joinedAt: number;
}
export interface Reward {
  id: string;
  memberId: string;
  source: string;
  offers: CardInstance[];
  claimed: boolean;
  selected: string | null;
}
export interface CrewProgress {
  shops?: Record<string, PlayerShop>;
  routeNote?: string;
  nodeId: string | null;
  row: number;
  phase:
    | "map"
    | "battle"
    | "reward"
    | "rest"
    | "event"
    | "defeat"
    | "finished"
    | "shop";
  roster: string[];
  votes: Record<string, string>;
  voteDeadline: number | null;
  visited: string[];
  choices: Record<string, string>;
  combat: Combat | null;
  defeats: number;
  eventId: string | null;
}
export interface Crew {
  id: string;
  name: string;
  colour: string;
  symbol: string;
  members: string[];
  progress: CrewProgress;
}
export interface BossRecord {
  quiz: QuizEvent;
  mitigation: Record<number, number>;
  gate: number;
  startedAt: number;
  firstCrewId: string | null;
  enrolled: string[];
  suspended: Record<string, CrewProgress>;
  combat: Combat | null;
  countdown: number;
  settled: boolean;
  result: "victory" | "defeat" | "skipped" | null;
  awards: { name: string; crewIds: string[]; value: number }[];
}
export interface Session {
  map: MapNode[];
  economyGrants: Record<string, number>;
  relicRewards: RelicReward[];
  id: string;
  code: string;
  rulesVersion: string;
  status: Status;
  revision: number;
  activeMs: number;
  seed: number;
  rng: number;
  content: Content;
  members: Record<string, Member>;
  crews: Record<string, Crew>;
  rewards: Reward[];
  bosses: BossRecord[];
  activeBossGate: number | null;
  predictionOrder: string[];
  notice: string;
  finishedReason: string | null;
}
export interface Presence {
  online: string[];
  hostOnline: boolean;
  absentFor: Record<string, number>;
}
export interface DomainContext {
  presence: Presence;
}
export type Command =
  | {
      kind: "quiz:answer";
      quizId: string;
      questionId: string;
      phaseRevision: number;
      optionId: string;
    }
  | { kind: "shop:buy"; shopId: string; shopRevision: number; itemId: string }
  | {
      kind: "shop:remove";
      shopId: string;
      shopRevision: number;
      deckRevision: number;
      cardUid: string;
    }
  | { kind: "shop:ready"; shopId: string; ready: boolean }
  | { kind: "relic:claim"; rewardId: string; relicId: string | null }
  | { kind: "team"; name?: string; crewId?: string; character: Character }
  | { kind: "travel"; nodeId: string }
  | {
      kind: "play";
      cardUid: string;
      handRevision: number;
      targetId?: string;
      choiceUid?: string;
    }
  | { kind: "preview"; cardUid: string; targetId?: string; choiceUid?: string }
  | { kind: "end-turn"; ended: boolean }
  | { kind: "request"; text: "Protect me" | "Wait" | "Ready" | "" }
  | { kind: "prediction"; choice: number }
  | { kind: "reward"; rewardId: string; cardUid: string | null }
  | { kind: "rest"; action: "heal" | "upgrade" | "remove"; cardUid?: string }
  | { kind: "event"; choice: number; cardUid?: string }
  | { kind: "retry" }
  | { kind: "takeover" }
  | {
      kind: "host";
      action:
        | "start"
        | "pause"
        | "resume"
        | "extend"
        | "boss"
        | "skip"
        | "end"
        | "remove";
      gate?: number;
      quizId?: string;
      phaseRevision?: number;
      scope?: "quiz" | "boss";
      memberId?: string;
    };
export interface Envelope {
  requestId: string;
  sessionId: string;
  encounterId: string | null;
  command: Command;
}
export interface Receipt {
  requestId: string;
  accepted: boolean;
  message: string;
  revision: number;
}
export interface ActorIdentity {
  role: "host" | "player" | "projector";
  memberId?: string;
}
export interface PlayerCard extends CardInstance {
  definition: CardDefinition;
  cost: number;
}
export interface ActorView {
  relicState?: EncounterRelics;
  memberId: string;
  crewId: string;
  name: string;
  character: Character;
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  ended: boolean;
  recovery: boolean;
  request: string;
  powers: Record<string, number>;
}
export interface CombatView {
  openingRoom?: boolean;
  id: string;
  kind: "route" | "boss";
  turn: number;
  phase: Combat["phase"];
  enemies: Enemy[];
  intents: Intent[];
  actors: ActorView[];
  hand: PlayerCard[];
  handRevision: number;
  choices: PlayerCard[];
  piles: { draw: number; discard: number; exhaust: number };
  log: CombatEvent[];
  remainingMs: number;
  result: Combat["result"];
  prediction: Omit<Prediction, "correct" | "explanations"> | Prediction | null;
  ownAnswer: number | null;
  answered: number;
  required: number;
  reduction: number;
}
export interface CrewView {
  nodeId: string | null;
  visited: string[];
  boardEnding?: CrewView["board"];
  board?: {
    id: string;
    kind: Combat["kind"];
    result: Combat["result"];
    turn: number;
    phase: Combat["phase"];
    remainingMs: number;
    enemies: Enemy[];
    intents: Intent[];
    actors: (ActorView & { hand: { name: string; cost: number }[] })[];
    log: CombatEvent[];
  } | null;
  id: string;
  name: string;
  colour: string;
  symbol: string;
  row: number;
  phase: string;
  members: {
    id: string;
    name: string;
    online: boolean;
    hp: number;
    maxHp: number;
    character: Character;
  }[];
  votes: Record<string, string>;
}
export interface SessionView {
  quiz: QuizView | null;
  shop: PlayerShop | null;
  relics: RelicDefinition[];
  relicReward: RelicReward | null;
  economy: EconomyRules;
  id: string;
  code: string;
  status: Status;
  revision: number;
  activeMs: number;
  role: ActorIdentity["role"];
  memberId: string | null;
  crewId: string | null;
  crews: CrewView[];
  unassigned: { id: string; name: string }[];
  map: MapNode[];
  progress: CrewProgress | null;
  combat: CombatView | null;
  combatEndings?: Pick<
    CombatView,
    "id" | "log" | "actors" | "enemies" | "result"
  >[];
  hero: Hero | null;
  cards: CardDefinition[];
  rewards: (Reward & { cards: PlayerCard[] })[];
  boss: {
    gate: number;
    firstCrewId: string | null;
    remainingMs: number;
    settled: boolean;
    result: BossRecord["result"];
    awards: BossRecord["awards"];
  } | null;
  bossHistory: {
    gate: number;
    firstCrewId: string | null;
    result: BossRecord["result"];
    awards: BossRecord["awards"];
  }[];
  event: EventDefinition | null;
  notice: string;
  finishedReason: string | null;
}
