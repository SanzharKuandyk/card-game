# Architecture

One Node 24 process serves Vue and Socket.IO. A worker owns synchronous SQLite calls. `npm start` validates authored content and rebuilds the frontend before starting; `npm run dev` uses Node watch and Vite middleware.

`shared` defines command/view contracts and boundary schemas. `domain` changes working state deterministically without I/O. `server` authenticates, serializes, persists and publishes. `client` displays projections and owns only local selection. ESLint rejects UI, transport and Node imports in shared/domain files.

Each durable command clones the current session, applies rules, and commits the snapshot and receipt in one transaction before acknowledging. Rejections persist an unchanged snapshot plus the receipt. The fingerprint includes the authenticated identity. Preview uses a working clone without spending resources or writing a receipt.

Actors have individual hand revisions. A teammate playing elsewhere does not invalidate another hand. Server-time order decides accepted card plays and first arrival. No client-reported damage or scores are trusted.

SQLite uses WAL and FULL synchronous mode. Sessions contain the frozen content bundle/hash and rules version. Receipts and boss settlement have unique keys. Every acknowledged decision includes its canonical state. Clock checkpoints save at least once per second; restart restores paused. Unsupported rules versions are rejected.

Combat events append to `combat_events` in the same transaction as the decision. Canonical snapshots keep a bounded recent log; SQLite retains the encounter history without duplicate event IDs. Phone projections filter for the player's team and cross-team help involving it, so the last teams in a large boss cannot displace another team's attack feedback.

Credentials are random and hashed in SQLite. Host/player cookies are independent, HttpOnly and SameSite Lax; HTTPS origins receive Secure cookies. New game creates a fresh lobby and issues its host cookie without requiring a code. Codes admit players to existing games. The projector has a distinct read-only credential. Socket and HTTP origin checks compare the actual request origin/host; forwarded headers do not select invite addresses.

Any browser can create its own new game. Controlling or resuming an existing game requires that game's host cookie. New game keeps the previous save. Host cookies last 30 days; player cookies last 12 hours. The printed address opens the Host screen directly; there is no separate hosting code.

Each player has one controlling connection. Further connections are read-only until Take control. A host can keep host and player pages open together. Missing host pauses after ten seconds; disconnected teams suspend their room clocks. Shared bosses suspend when no enrolled player is online.

Shared boss entry stores each team's room state and start time. Settlement offsets suspended deadlines by the boss duration. Restored piles/energy are exact, while current hero health carries back. New permanent cards do not enter suspended piles. Only new encounters construct a shuffled deck from current persistent cards.

Snapshots publish at most five times per second; projector updates at most twice. Card catalogue metadata is sent on connection/resynchronization. Ordinary players cannot inspect other hands, future predictions or unrevealed answer keys.

The projector receives one read-only team-board projection. Each fixed team tile shows every member, health, Block, energy, readiness, incoming attacks and recent effects; hands expand in place. It has no player-following views, frames, scroll replication or per-player connections. Only host/projector projections include team hands; player projections remain private. Predictions never include unrevealed answers.

Phones start with polling and may upgrade to WebSocket. Transport fallback and short reconnect backoff handle restricted connections. A per-document random control ID lets the same page replace its stale socket; another tab still needs explicit Take control, including after that tab takes ownership. Foreground/online/pageshow events reconnect or resynchronize immediately; pagehide closes the old transport. Durable pending actions keep their original request IDs until the saved receipt arrives. Request IDs use getRandomValues, so local HTTP does not require randomUUID.

The browser retains an unacknowledged durable envelope and retries its original request ID. It blocks another commitment until that receipt is checked. Preview selections are disposable; stale preview replies cannot overwrite a newer selection. An optional server-construction seed is used by browser fixtures; normal sessions receive random persisted seeds.

The supported runtime is pinned in `.node-version`; Windows can use `CARD_GAME_NODE` or the project-local official runtime through `scripts/run.mjs`. TypeScript is stripped natively for server execution. Vue/type checking uses the official TypeScript development dependency; no `tsx`, `ts-node` or `tsc` npm package.

The shared boss is shown in each fixed team row using one common health presentation.

## V2 boundaries

Session.map is the sole live graph, generated once from the session seed and persisted. Content.map is a validation sample; it is never a crew-specific runtime map. Domain map.ts owns graph generation/invariants; quizzes.ts owns pre-boss stages and results; shops.ts owns personal inventory/transactions; economy.ts owns keyed grants; relics.ts owns eligibility,claims and encounter snapshots. rewards.ts retains the extracted card-offer helper. Session/combat remain the existing authoritative coordinators.

BossRecord owns one QuizEvent and prepared turn2/4 mitigation. All stage changes, answer locks, settlement and room/encounter transitions force a database save before publishing. Card/stock grants remain in the existing session+receipt transaction. Projector and player quiz views exclude correct options, explanations and named choices until reveal. No future question is projected. Stable option IDs are independent of shuffled presentation labels A/B/C.

Relic definitions are frozen inside BattleActor.relicState. Turn/encounter counters are distinct from ordinary card counters. Combat hooks use existing damage,Block,draw and source-attributed logs; preview clones these counters. Newly acquired relics cannot mutate a suspended encounter. Returning from a boss restores it without running encounter start.

ShopScreen shares the existing player store/controlling identity across player routes. Leaving Player for Shop does not close the socket. RelicsDialog is a native description dialog. ProjectorQuiz temporarily replaces the visible boards; SharedMap has no automatic camera/scroll following. No new dependencies or separate game engine were introduced.

Frozen content and Session.map are stored once in session_metadata in the initial session transaction. Subsequent saves carry mutable state and receipts; load joins immutable metadata back into the canonical Session. Existing inline v2 snapshots can still be read and normalised on their next save. Immutable metadata is shared across in-memory working copies; domain transitions never mutate it. WAL/FULL durability is retained.

Opening-room timing is additive within cards-v2: optional Content.timing.openingTurn and Combat.openingRoom select one shared turn-duration helper. New row-1 route encounters opt in only when frozen content includes that duration. Older snapshots keep existing timing, and restore never creates a fresh deadline.

Client onboarding has pure hint selection and a local presentation composable under client/onboarding. It consumes existing projections and accepted combat events after playback; it has no network commands, gameplay phase or persistence table. Preferences use a versioned session/member browser key and shared reactive state, synchronised between tabs. Errors/storage failure cannot block combat. HelpDialog replaces the isolated practice UI and leaves BattlePanel mounted and styled normally behind its native modal.

## Combat depth extension

Frozen `Content.depth` opts new sessions into revised enemy tactics, repeat snapshots and loot selection without migrating old saves. `content/depth.json` declares catalogue counts and fixed encounter rows. `MapNode.encounterId` persists the row-4 override; route creation passes it into the existing combat constructor. `Enemy.tactics` stores health damage during the turn, interruption and guard-break turns. `domain/enemy-tactics.ts` produces plans consumed by the existing intent allocator; deadlines, receipts, queue and settlements remain unchanged.

`domain/loot.ts` shares frozen-roster eligibility and weighted build investment across rewards, quizzes and shops. Relic eligibility also excludes teammate-only offers for solo crews. New typed effect operations remove Block, spend Poison/Charge and give self Block. `exhaustOnDiscard` makes resource-bearing discard cards finite. Repeats record concrete offensive effect values during the original play, then resolve them without replaying resource operations or recursively copying.

Portrait provenance remains in frozen content; encounters project only ID, local path, alternative text, fit and focal position. `EnemyArt.vue` preserves the combat-art animation hooks and falls back to the existing SVG on load failure. `enemy-stage.css` applies only to portrait encounters and projector rows containing images. Asset credit records distinguish source checks from verified reuse rights. No external image service is called during play.

Enemy templates optionally author `portraitPool`; portraits optionally author a short `enemyName`. The combat constructor selects without duplicate portraits using an independent stream derived from the stable encounter seed, then stores name and compact art metadata on each enemy. Attempt IDs do not enter this seed. Older frozen templates without pools retain their authored portrait/name. Content validation rejects unknown/duplicate pool entries and randomization of fixed-encounter images.
