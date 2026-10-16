# Gameplay

Teams of 1–4 share one generated 15-row map. Each team chooses its own route and sees other teams' locations. All teams receive the same graph and node encounter seed; events are also seeded per node. Maps differ between sessions. Rows 8 and 15 are shared boss gates. No path skips a row or bypasses either gate. Five-lane junctions restrict movement to neighbouring lanes. Mandatory combat rows 1/2/4/6/9/12 prevent a route made only of recovery rooms. Elites, rests and shops do not immediately repeat along an edge. Hard fights have 20% extra health; elites have 10–25% extra health above their existing elite budget. Danger is visible before voting. Majority selects travel; unresolved votes use the existing visible seeded tiebreak after 20 seconds.

Heroes start with 40 health, 3 energy and a 10-card deck. Draw 5 per turn, up to 10 in hand. Persistent decks contain 80 authored cards across four characters and shared cards. Rewards and upgrades persist; generated cards, powers and temporary cost changes belong to the encounter. Existing card effects, recovery, teammate support and the ordered card-play queue continue to apply.

Battles grant 20 personal gold and a two-common/one-uncommon card offer. Elites grant 35 gold, a rare-card offer and a relic offer. Start with 50 gold. Shared boss victories grant 30 gold and the existing rare-card offer. Gold and rewards are keyed by source node/boss and owner, preventing replay/retry farming. Skip adds no card or relic.

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

Relics have no equipment slots or swapping. Twelve passive effects support Block, health spending, cheap attacks, deliberate discard, Poison, exhaust, retained attacks and useful ally support. Other relics alter opening draws/energy, grant turn Block or heal after a once-only route victory. Cards → Relics opens full descriptions and use status. Elite offers and shops cannot grant duplicate owned relics. Relic effects do not recursively trigger other relics; automatic copied attacks do not count as extra manual plays. First/once-per-turn limits reset only at the stated boundary.

An encounter freezes its active relic definitions and counters. New relics do not enter a suspended fight. Restoring that fight does not reapply opening effects. Preview uses a cloned encounter and cannot spend any relic use. Repair Kit cannot revive or farm repeated victories at a node.

## Boss entry and return

The gate owns the quiz, rewards, combat and settlement. There is no nested shared event. Existing first-arrival and victory rare-card rewards remain permanent. The boss opening shuffle includes cards claimed before entry. Downed players retain Rally/Shelter; real health carries back. After the middle boss, restore exact route piles, energy, readiness, effects and clocks, plus each saved shop's stock/readiness. Pending permanent changes apply to new encounters, not restored piles. Final settlement ends the session while retaining unfinished route records.

A skip retains completed submissions and prior committed rewards. Skipping an unfinished quiz creates no invented answers or reward. Skipping the boss preserves earlier quiz and first-arrival rewards. Lost ACKs return saved receipts. Restart restores paused state with the frozen content, questions, stocks and map. V2 uses data/cards-v2.sqlite; the prior v1 database is left untouched.

## Presentation

Enemy responses now anticipate for 950 ms before damage, then hold the impact for 1300 ms. Reduced motion retains readable timing without movement. Enemy phases reserve 2500 ms per presented enemy/effect, up to the existing eight-second ceiling. Block absorbed and health lost remain separate. Card timing/layout is preserved.

The projector opens Map or Battles without following players or resetting its board scroll. During questions it displays a dedicated full question and named team progress/results. Phones show their own team; the projector shows the class. Shops, relic inspection and quiz choices use native controls and dialogs with safe-area padding. Responsive checks are emulated; actual hardware and classroom pacing need the human pilot.
