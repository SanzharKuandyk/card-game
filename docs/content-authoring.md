# Content

JSON is the runtime catalogue. Each card declares a stable ID, character, rarity, target, tags, readable text, ordered typed effects and an explicit upgrade. Tokens use token rarity and never appear in persistent reward pools. Do not evaluate content strings as code.

Supported effects include attack damage, Block, draw, energy, health costs, Poison/Weak/Vulnerable, powers, deliberate discard/exhaust, discard recovery, token generation, retention, cost changes, restricted copying, Charge and ally repeats. Numerical scaling declares its source and factor; repeated hits are distinct from multiplying one hit.

Choose-card effects require an owned card from the stated pile. Powers have a reviewed whitelist. Adding a new effect or power requires a typed rule and a focused interaction check, not an arbitrary expression evaluator.

Build cards need a useful standalone action as well as a combination. Rare cards need setup/cost/limits. Never use a low global play cap to hide an endless energy or draw cycle. Copies cannot copy copies; once-per-turn powers reset in the next actor turn.

Predictions show rules first, then short event steps and three distinct plausible outcomes. Authored explanations describe all distractors. References use physical slide numbers in MGD Week 2/4/5 decks; the examples are original applications of the principles, not claims about commercial game implementations.

Content validation checks catalogue counts, IDs, supported effects/powers, tokens, starters, map row adjacency/gates and prediction shapes. A session stores its complete validated bundle, so editing JSON never changes an active save.


V2:learning/week6-questions.json contains twelve questions with stable option IDs, source physicalSlides, setupReplay and resultReplay. Replay scenes contain bounded SVG primitives only; no code strings. quiz-rules.json controls stage durations. relics/relics.json contains12 validated typed passive effects; economy/shop.json contains wallet/grant/price defaults. Changes affect new sessions only. The live15-row map is generated once per session by domain/map.ts; old maps/routes.json is the v1 authoring record and is not used by v2. Public catalogue responses contain cards; the live map is available only through that session's projection.
