# Gameplay

Teams of 1–4 share one generated 15-row map. Each team chooses its own route and sees other teams' locations. All teams receive the same graph and node encounter seed; events are also seeded per node. Maps differ between sessions. Rows 8 and 15 are shared boss gates. No path skips a row or bypasses either gate. Five-lane junctions restrict movement to neighbouring lanes. Mandatory combat rows 1/2/4/6/9/12 prevent a route made only of recovery rooms. Elites, rests and shops do not immediately repeat along an edge. Hard fights have 20% extra health; elites have 10–25% extra health above their existing elite budget. Danger is visible before voting. Majority selects travel; unresolved votes use the existing visible seeded tiebreak after 20 seconds.

Heroes start with 40 health, 3 energy and a 10-card deck. Draw 5 per turn, up to 10 in hand. Persistent decks contain 80 authored cards across four characters and shared cards. Rewards and upgrades persist; generated cards, powers and temporary cost changes belong to the encounter. Existing card effects, recovery, teammate support and the ordered card-play queue continue to apply.

Battles grant 20 personal gold and a two-common/one-uncommon card offer. Elites grant 35 gold, a rare-card offer and a relic offer. Start with 50 gold. Shared boss victories grant 30 gold and the existing rare-card offer. Gold and rewards are keyed by source node/boss and owner, preventing replay/retry farming. Skip adds no card or relic.

## Opening room

The lobby shows three basics and the character's expandable combination. The old separate practice fight is removed. In new sessions, row 1 allows 90 seconds per player turn, including retries; everyone ending early advances immediately. Later rooms and bosses retain 60-second turns. Existing saved sessions retain their frozen timings. Pause, extensions and interrupted-room restoration preserve the remaining clock.

Optional opening-room guidance uses the existing helper space and static highlights. It explains costs, playing several cards, incoming attacks, Block, an available starter combination and End turn. Selected-card text, numerical previews, targeting and error messages take priority. A combination is suggested only when its pieces and energy are available; Rogue also needs room for generated attacks. No play is compulsory and no hand is arranged for teaching.

After a hint has been eligible for six seconds it is remembered as seen. Hide tips is personal and lasts for the current session, including reconnects, reloads and retries. Help can show tips again while still in row 1; previously seen hints stay seen. Preferences are stored in the player's browser, with an in-memory fallback if storage is unavailable. Tips stop after row 1 and are suppressed during playback, pause, disconnection, read-only control, recovery, Help and shared encounters. Short screens prioritise controls and use highlights with the full explanation in Help.

The ? button opens a short reference over the current game without clearing selection, changing the combat layout or pausing time. Closing it restores keyboard focus. These changes do not alter cards, relics, encounter health, rewards or deck shuffling.

## Questions

The first team reaching a boss gate atomically records first arrival, suspends all route decisions and starts the gate's once-only quiz. A host-called boss identifies the host and grants no first-arrival bonus. The same frozen roster participates in its two questions and boss. Late arrivals spectate until the next encounter; disconnected players within the existing 15-second grace period are enrolled. Missing submissions remain incorrect in the frozen denominator.

Each session selects four different Week 6 questions covering movement, physics and collisions, referenced by physical slide number. The authored source is MGD_6_week.pptx (77 slides). Original SVG scenes demonstrate setup and revealed outcomes without executing authored code. During answering, projectors show only submission status. After lock they show named choices, answer distribution, correct outcome and explanation.

| Stage                |                                                    Active time |
| -------------------- | -------------------------------------------------------------: |
| Arrival announcement |                                                      8 seconds |
| Setup demonstration  |                                         6 seconds per question |
| Answer               |       25 seconds; may end after 12 seconds if everyone submits |
| Reveal               |                                        12 seconds per question |
| Card choices         | 35 seconds; may end after 8 seconds if required players finish |

Players select an option then Confirm. Confirmed answers cannot change. Pause freezes active time; host extension adds 30 seconds to the current stage. Replays do not consume attempts or extend time. Team accuracy is correct answers divided by twice its enrolled members. Below 50% gives two common/one uncommon; 50% to below 75% gives three uncommon; 75%+ gives two uncommon/one rare. Every enrolled member receives one independent offer from their eligible pool. First-arrival rares are separate. Unclaimed offers remain saved and open automatically at the next safe decision.

Question 1's average of team accuracies prepares floor(30×accuracy)% damage reduction for boss turn 2; question 2 prepares turn 4. Questions no longer interrupt those turns. Bosses killed early still had their complete pre-boss quiz.

## Shop and relics

A shop is a separate page. Every visiting player has independent frozen stock: five eligible cards, up to three unowned relics and one removal. Cards cost 20/35/65 gold for common/uncommon/rare; relics 70/100. Removal starts at 30 and increases 15 per successful removal during the run. Keep at least six cards and one Strike/Guard. A purchase or removal commits before its receipt; sold entries never restock. Done readies that player; Change permits further shopping while the team remains there. Offline members stop blocking after the existing grace period. No automatic purchases occur.

Relics have no equipment slots or swapping. 24 passive effects support Block, health spending, cheap attacks, deliberate discard, Poison, exhaust, retained attacks and useful ally support. Other relics alter opening draws/energy, grant turn Block or heal after a once-only route victory. Cards → Relics opens full descriptions and use status. Elite offers and shops cannot grant duplicate owned relics. Relic effects do not recursively trigger other relics; automatic copied attacks do not count as extra manual plays. First/once-per-turn limits reset only at the stated boundary.

An encounter freezes its active relic definitions and counters. New relics do not enter a suspended fight. Restoring that fight does not reapply opening effects. Preview uses a cloned encounter and cannot spend any relic use. Repair Kit cannot revive or farm repeated victories at a node.

## Boss entry and return

The gate owns the quiz, rewards, combat and settlement. There is no nested shared event. Existing first-arrival and victory rare-card rewards remain permanent. The boss opening shuffle includes cards claimed before entry. Downed players retain Rally/Shelter; real health carries back. After the middle boss, restore exact route piles, energy, readiness, effects and clocks, plus each saved shop's stock/readiness. Pending permanent changes apply to new encounters, not restored piles. Final settlement ends the session while retaining unfinished route records.

A skip retains completed submissions and prior committed rewards. Skipping an unfinished quiz creates no invented answers or reward. Skipping the boss preserves earlier quiz and first-arrival rewards. Lost ACKs return saved receipts. Restart restores paused state with the frozen content, questions, stocks and map. V2 uses data/cards-v2.sqlite; the prior v1 database is left untouched.

## Presentation

Enemy responses now anticipate for 950 ms before damage, then hold the impact for 1300 ms. Reduced motion retains readable timing without movement. Enemy phases reserve 2500 ms per presented enemy/effect, up to the existing eight-second ceiling. Block absorbed and health lost remain separate. Card timing/layout is preserved.

The projector opens Map or Battles without following players or resetting its board scroll. During questions it displays a dedicated full question and named team progress/results. Phones show their own team; the projector shows the class. Shops, relic inspection and quiz choices use native controls and dialogs with safe-area padding. Responsive checks are emulated; actual hardware and classroom pacing need the human pilot.

## Builds and enemy decisions

New sessions freeze depth version 1: 120 collectible cards (24 per character, 24 shared) plus two encounter-only tokens, and 24 relics. Starter decks, opening-room health and teaching stay unchanged. Each character keeps two build directions, with four new common, two uncommon and two rare cards. Shared cards add four common and four uncommon options.

| Build                 | Added choices                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian / Block      | Ram breaks enemy Block; Stored Blow retains a Block-based attack; Bastion keeps a limited amount of Block. Shield Pass protects another player while defending you.                                        |
| Guardian / health     | Blood Price spends health for draw; Red Tide rewards health spent this turn; Blood Oath turns the first health cost into Block.                                                                            |
| Rogue / attack chains | Pocket Blades and Knife Dance create free Sparks. Needle Rain handles multiple targets; Crossfire rewards attacks by other teammates.                                                                      |
| Rogue / discard       | Clean Cut and Escape Plan discard a chosen card. Second Pocket and Pocket Flint reward the first deliberate discard. Energy-bearing discard cards Exhaust when triggered, preventing free recycling loops. |
| Alchemist / Poison    | Corrosive Wash removes Block; Toxic Shelter converts Poison into ally defence. Distil spends accumulated Poison for immediate damage, giving up future ticks.                                              |
| Alchemist / Exhaust   | Test Batch and Second Wind remove a chosen card from the fight. Burner and Scrap Furnace supply energy; Salvage Cycle recovers a discarded card once.                                                      |
| Channeler / Charge    | Stored Current prepares Charge; Charge Screen converts it into defence without spending it. Overdrive spends it for a larger attack.                                                                       |
| Channeler / support   | Passing Note supports another player, including another team at a boss. Encore repeats the next teammate Attack twice; Rehearsal prepares a retained card.                                                 |

Echo and Relay now stack independently. Repeats use the original card's damage and enemy-status values, including its Strength and scaling at the relevant effect; they use current target mitigation. Resource costs, Block spending, card generation, relic bonuses and further repeats do not replay. Wall Crash therefore repeats its original damage after spending Block, rather than silently repeating zero. Solo Relay triggers your next Attack. Together shares a pool of two energy (up to one per standing player), Final Chorus four (up to two each), starting with the caster then frozen roster order. Both Exhaust.

Venom Coat and Toxic Shelter each give at most 12 Block (16 upgraded), so one shared Poison pool does not multiply every player's defence indefinitely. Relic bonuses remain separate.

Loot weighs added cards and upgrades rather than assuming starter tags mean a committed build. The first slot favours investment without guaranteeing a particular card; the second favours an alternative direction. Offers remain distinct within a screen. Solo offers exclude teammate-only cards and relics. Already-owned nonstacking Powers are excluded. Six class rares widen the three-card elite/boss choice; cards with useful stacking or multiple copies remain eligible.

| Enemy            | Decision                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raider           | During Wind-up, deal 8 health damage per enrolled player to cancel the next heavy attack. Poison counts; damage absorbed by Block does not.                            |
| Guard / Milk Cat | After its guard turn, break all its Block to reduce Body slam from 14 to 5 damage per player before other modifiers. Block-removal cards count; Poison bypasses Block. |
| Support          | Adds 3 Strength to other standing enemies each turn. Choose whether to remove this support first.                                                                      |
| Healer           | Restores up to 4 health per enrolled player to other standing enemies. Cannot heal itself or revive enemies.                                                           |
| Middle boss      | Wind-up every third turn; deal 12 health damage per enrolled player to cancel the next heavy attack.                                                                   |
| Final boss       | Guards, then threatens a heavy attack: break its Block to reduce that attack from 20 to 8. Every fourth turn adds 3 Strength.                                          |

Enemy intentions publish actual targets/damage and a tappable explanation. Later route fights add 2 attack pressure every three turns; boss escalation still begins on turn five. There is no dynamic health adjustment or universal card-play cap. Large finite turns are allowed. Fixed row 4 uses the supplied Milk Cat image on every lane, retaining the lane's encounter difficulty. Other encounters choose from authored meme pools: 14 local images include 12 cats and two dogs. Bosses use a smaller cat pool. The chosen name and image are frozen when the encounter starts, match on phones and projector, and remain unchanged through retries, reconnects and restarts. Enemies in one fight use different images when the pool permits. New runs vary; art selection never consumes the combat/card random stream. Enemy roles and intentions determine mechanics regardless of the chosen cat. Images are local; gameplay needs no image API connection. Source records, download URLs and unverified rights status are in content/enemies/portraits.json; Help opens Image sources. Public template availability does not establish a reuse license.

Portrait encounters give the images the main stage. Phones use side-by-side enemies, compact team tiles and tappable health/Block/status readouts. The projector retains stable row heights while using wider portraits and one line for name/health. Readable damage playback, intentions and the card footer remain in their existing tracks. Old frozen sessions retain their original content and behaviour; a new session is required for the depth changes.
