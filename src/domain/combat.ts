import { encounterRelics, relic, takeRelic } from "./relics.ts";
import type {
  BattleActor,
  CardDefinition,
  CardInstance,
  Combat,
  CombatEvent,
  Content,
  Effect,
  Enemy,
  Hero,
  Intent,
} from "../shared/model.ts";
import { shuffle } from "./random.ts";
export function definition(
  content: Content,
  card: CardInstance,
): CardDefinition {
  const found = content.cards.find((c) => c.id === card.cardId);
  if (!found) throw new Error("Unknown card");
  return found;
}
export function cardCost(content: Content, card: CardInstance): number {
  const d = definition(content, card);
  return Math.max(
    0,
    (card.upgraded ? d.upgrade.cost : d.cost) + (card.costDelta ?? 0),
  );
}
export function addLog(
  b: Combat,
  kind: string,
  sourceId: string,
  targetId: string,
  amount: number,
  text: string,
  feedback: Pick<CombatEvent, "blocked" | "card"> = {},
): void {
  const target = b.actors[targetId] ?? b.enemies.find((e) => e.id === targetId);
  b.log.push({
    id: ++b.eventSequence,
    turn: b.turn,
    kind,
    sourceId,
    targetId,
    amount,
    text,
    ...(target && {
      targetState: {
        hp: target.hp,
        block: target.block,
        ...("energy" in target ? { energy: target.energy } : {}),
      },
    }),
    ...(kind === "play" && b.actors[sourceId]
      ? { sourceEnergy: b.actors[sourceId]!.energy }
      : {}),
    ...feedback,
  });
  if (b.log.length > 300) b.log.splice(0, b.log.length - 300);
}
function contribute(
  b: Combat,
  source: string,
  type: "damage" | "protection",
  amount: number,
): void {
  const c = b.contributions[source];
  if (c) c[type] += amount;
}
function help(b: Combat, source: string, target: string): void {
  if (
    source !== target &&
    b.contributions[source] &&
    !b.contributions[source].helped.includes(target)
  )
    b.contributions[source].helped.push(target);
}
export function draw(b: Combat, actor: BattleActor, count: number): void {
  for (let i = 0; i < count && actor.hand.length < 10; i++) {
    if (!actor.draw.length) {
      actor.draw = shuffle(actor.discard, b);
      actor.discard = [];
    }
    const card = actor.draw.pop();
    if (!card) break;
    delete card.costDelta;
    delete card.heldAcrossTurn;
    actor.hand.push(card);
    actor.handRevision++;
  }
}
export function createCombat(
  id: string,
  kind: Combat["kind"],
  heroes: { hero: Hero; crewId: string }[],
  budget: number,
  pattern: string,
  rng: number,
  now: number,
  content: Content,
): Combat {
  const b: Combat = {
    id,
    kind,
    turn: 1,
    phase: "player",
    actors: {},
    enemies: [],
    intents: [],
    deadline: now + content.timing.turn,
    rng,
    log: [],
    eventSequence: 0,
    result: null,
    contributions: {},
    reduction: 0,
    predictionId: null,
    answers: {},
    revealedPredictionIds: [],
    queuedCardUid: 0,
  };
  for (const { hero, crewId } of heroes) {
    b.actors[hero.memberId] = {
      memberId: hero.memberId,
      crewId,
      hp: hero.hp,
      maxHp: hero.maxHp,
      energy: 3,
      block: 0,
      hand: [],
      draw: shuffle(structuredClone(hero.deck), b),
      discard: [],
      exhaust: [],
      powers: {},
      counters: {},
      ended: false,
      handRevision: 0,
      recovery: hero.hp === 0,
      relicState: encounterRelics(hero, content),
      request: "",
      blockSources: [],
      energySources: [],
    };
    b.contributions[hero.memberId] = { damage: 0, protection: 0, helped: [] };
    if (hero.hp > 0) {
      const actor = b.actors[hero.memberId]!;
      const coil = relic(actor, "opening-energy");
      actor.energy += coil?.amount ?? 0;
      if (actor.relicState) {
        for (const r of actor.relicState.definitions.filter((r) =>
          ["opening-energy", "opening-draw"].includes(r.effect),
        ))
          actor.relicState.encounterUses[r.id] = 1;
      }
      draw(
        b,
        actor,
        5 + (relic(actor, "opening-draw")?.amount ?? 0) - (coil ? 1 : 0),
      );
      const shell = relic(actor, "turn-block");
      if (shell) relicBlock(b, actor, shell.amount, shell.id);
    }
  }
  const total = Math.round(budget * heroes.length);
  const template = (id: string) => {
    const found = content.enemies.find((entry) => entry.id === id);
    if (!found) throw new Error(`Missing enemy content: ${id}`);
    return found;
  };
  const primary = template(
    kind === "boss"
      ? pattern === "final"
        ? "sentinel"
        : "colossus"
      : pattern === "elite"
        ? "guard"
        : "raider",
  );
  if (kind === "route" && ["elite", "late"].includes(pattern)) {
    const supportHp = Math.max(8, Math.floor(total * 0.25));
    const support = template("support");
    b.enemies.push(
      enemy("main", primary.name, total - supportHp, primary.pattern),
      enemy("support", support.name, supportHp, support.pattern),
    );
  } else b.enemies.push(enemy("main", primary.name, total, primary.pattern));
  b.intents = makeIntents(b);
  if (Object.values(b.actors).every((a) => a.hp === 0)) {
    b.phase = "result";
    b.result = "defeat";
  }
  return b;
}
function enemy(id: string, name: string, hp: number, pattern: string): Enemy {
  return {
    id,
    name,
    hp,
    maxHp: hp,
    block: 0,
    poison: 0,
    weak: 0,
    vulnerable: 0,
    strength: 0,
    pattern,
    repeat: null,
  };
}
export function makeIntents(b: Combat): Intent[] {
  const living = Object.values(b.actors).filter((a) => a.hp > 0);
  const out: Intent[] = [];
  for (const e of b.enemies.filter((e) => e.hp > 0)) {
    if (e.pattern === "support") {
      out.push({
        enemyId: e.id,
        label: "Strengthen allies",
        kind: "charge",
        targets: [],
        block: 0,
      });
      continue;
    }
    const boss = b.kind === "boss";
    const phase = b.turn % 3;
    if ((e.pattern === "guard" && phase === 2) || (boss && phase === 0)) {
      out.push({
        enemyId: e.id,
        label: boss ? "Wind-up" : "Guard",
        kind: boss ? "charge" : "guard",
        targets: [],
        block: (boss ? 4 : 6) * Object.keys(b.actors).length,
      });
      continue;
    }
    const heavy = phase === 1 && b.turn > 1;
    const base = heavy
      ? boss
        ? 16
        : 12
      : boss
        ? b.turn % 2 === 0
          ? 8
          : 6
        : 6;
    const pressure = boss && b.turn >= 5 ? 3 * (b.turn - 4) : 0;
    const damage = base + pressure + e.strength;
    const focus = b.turn % 2 === 0;
    const groups = Object.values(
      living.reduce<Record<string, BattleActor[]>>((r, a) => {
        (r[a.crewId] ??= []).push(a);
        return r;
      }, {}),
    );
    const targets = groups.flatMap((group) => {
      const primary = (b.turn - 1) % group.length;
      const weights = group.map((_, i) => (focus && i === primary ? 2 : 1));
      const total = damage * group.length;
      const sum = weights.reduce((a, c) => a + c, 0);
      const values = weights.map((w) => Math.floor((total * w) / sum));
      let left = total - values.reduce((a, c) => a + c, 0);
      for (let i = 0; left > 0; i++, left--)
        values[(i + b.turn) % group.length]!++;
      return group.map((a, i) => ({
        memberId: a.memberId,
        damage: Math.min(
          heavy ? 22 : 16,
          Math.floor(
            values[i]! * (e.weak > 0 ? 0.75 : 1) * (1 - b.reduction / 100),
          ),
        ),
      }));
    });
    out.push({
      enemyId: e.id,
      label: heavy ? "Heavy strike" : focus ? "Focused strike" : "Sweep",
      kind: "attack",
      targets,
      block: 0,
    });
  }
  return out;
}
function hit(
  b: Combat,
  source: string,
  target: Enemy,
  raw: number,
  poison = false,
): number {
  if (target.hp <= 0) return 0;
  const sourceActor = b.actors[source];
  let relicId: string | undefined;
  if (!poison && sourceActor?.counters["retained-play"] && raw > target.block) {
    const r = takeRelic(sourceActor, "retained-damage");
    if (r) {
      raw += r.amount;
      relicId = r.id;
    }
  }
  const damage = Math.max(
    0,
    Math.floor(raw * (poison ? 1 : target.vulnerable > 0 ? 1.5 : 1)),
  );
  const blocked = poison ? 0 : Math.min(target.block, damage);
  target.block -= blocked;
  const actual = Math.min(target.hp, damage - blocked);
  target.hp -= actual;
  contribute(b, source, "damage", actual);
  addLog(
    b,
    poison ? "poison" : "damage",
    source,
    target.id,
    actual,
    `${poison ? "Poison · " : ""}${blocked ? `${blocked} blocked · ` : ""}${actual} damage${poison ? " (ignores Block)" : ""}`,
    { blocked },
  );
  if (relicId) b.log[b.log.length - 1]!.relicId = relicId;
  return actual;
}
function block(
  b: Combat,
  actor: BattleActor,
  amount: number,
  source: string,
): void {
  if (actor.hp <= 0) return;
  let n = Math.floor(amount);
  if (actor.powers["double-first-block"] && !actor.counters["first-block"]) {
    n *= 2;
    actor.counters["first-block"] = 1;
  }
  if (n <= 0) return;
  let bonusId: string | undefined;
  if (source === actor.memberId && actor.counters["manual-play"]) {
    const r = takeRelic(actor, "first-block");
    if (r) {
      n += r.amount;
      bonusId = r.id;
    }
  }
  actor.block += n;
  actor.blockSources.push({ sourceId: source, remaining: n });
  addLog(b, "block", source, actor.memberId, n, `+${n} Block`);
  if (bonusId) b.log[b.log.length - 1]!.relicId = bonusId;
  if (actor.powers["block-damage"]) {
    const target = b.enemies.find((e) => e.hp > 0);
    if (target) hit(b, actor.memberId, target, actor.powers["block-damage"]);
  }
}
function exhaustCard(b: Combat, actor: BattleActor, card: CardInstance): void {
  actor.exhaust.push(card);
  addLog(b, "exhaust", actor.memberId, actor.memberId, 1, "Exhausted a card");
  actor.counters.exhausted = (actor.counters.exhausted ?? 0) + 1;
  block(b, actor, actor.powers["exhaust-block"] ?? 0, actor.memberId);
  draw(b, actor, actor.powers["exhaust-draw"] ?? 0);
}
function scaled(
  b: Combat,
  a: BattleActor,
  e: Effect,
  target: Enemy | undefined,
): number {
  let value = 0;
  switch (e.scale) {
    case "block":
      value = a.block;
      break;
    case "attacks":
      value = a.counters.attacks ?? 0;
      break;
    case "discarded":
      value = a.counters.discarded ?? 0;
      break;
    case "exhausted":
      value = a.exhaust.length;
      break;
    case "poison":
      value = target
        ? target.poison
        : b.enemies.reduce((s, e) => s + e.poison, 0);
      break;
    case "charge":
      value = a.powers.charge ?? 0;
      break;
    case "lost-hp":
      value = a.counters["lost-hp"] ?? 0;
      break;
    case "other-attacks":
      value = Object.values(b.actors)
        .filter((x) => x.memberId !== a.memberId && x.crewId === a.crewId)
        .reduce((s, x) => s + (x.counters[`attacks:${target?.id}`] ?? 0), 0);
      break;
  }
  return e.amount + value * (e.factor ?? 1);
}
function requireChoice(
  a: BattleActor,
  uid: string | undefined,
  pile: "hand" | "discard",
): CardInstance {
  const card = a[pile].find((c) => c.uid === uid);
  if (!card) throw new Error(`Choose a card from your ${pile}`);
  return card;
}
function effects(
  b: Combat,
  a: BattleActor,
  d: CardDefinition,
  steps: Effect[],
  targetId: string | undefined,
  choiceUid: string | undefined,
  content: Content,
): void {
  const targetEnemy = b.enemies.find((e) => e.id === targetId);
  const heroTarget = b.actors[targetId ?? a.memberId] ?? a;
  for (const effect of steps) {
    let amount = scaled(b, a, effect, targetEnemy);
    if (d.id === "fresh-pocket" && effect.op === "draw")
      amount = effect.amount + (a.counters["last-discard"] ?? 0);
    if (d.id === "last-reserve" && effect.op === "energy")
      amount = a.counters["last-exhaust"] ?? 0;
    const targets = effect.all
      ? b.enemies.filter((e) => e.hp > 0)
      : targetEnemy
        ? [targetEnemy]
        : [];
    switch (effect.op) {
      case "damage":
        for (const t of targets)
          for (let i = 0; i < (effect.hits ?? 1); i++)
            hit(
              b,
              a.memberId,
              t,
              amount +
                (a.powers.strength ?? 0) +
                (d.id === "spark" ? (a.powers["spark-bonus"] ?? 0) : 0),
            );
        break;
      case "block":
        block(b, heroTarget, amount * (effect.hits ?? 1), a.memberId);
        break;
      case "draw": {
        const n =
          d.id === "full-house"
            ? Math.max(0, amount - heroTarget.hand.length)
            : Math.floor(amount);
        const before = heroTarget.hand.length;
        draw(b, heroTarget, n);
        const actual = heroTarget.hand.length - before;
        addLog(
          b,
          "draw",
          a.memberId,
          heroTarget.memberId,
          actual,
          `Drew ${actual} card${actual === 1 ? "" : "s"}`,
        );
        break;
      }
      case "energy":
        heroTarget.energy += Math.floor(amount);
        if (heroTarget.memberId !== a.memberId)
          heroTarget.energySources.push({
            sourceId: a.memberId,
            remaining: Math.floor(amount),
          });
        addLog(
          b,
          "energy",
          a.memberId,
          heroTarget.memberId,
          Math.floor(amount),
          `+${Math.floor(amount)} energy`,
        );
        break;
      case "lose-hp": {
        if (a.hp <= amount) throw new Error("Not enough health to spend");
        a.hp -= amount;
        a.counters["lost-hp"] = (a.counters["lost-hp"] ?? 0) + amount;
        a.powers.strength =
          (a.powers.strength ?? 0) + (a.powers["hp-strength"] ?? 0);
        if (a.powers["hp-draw"] && !a.counters["hp-draw"]) {
          a.counters["hp-draw"] = 1;
          draw(b, a, a.powers["hp-draw"]);
        }
        addLog(
          b,
          "cost",
          a.memberId,
          a.memberId,
          amount,
          `Spent ${amount} health`,
        );
        break;
      }
      case "poison":
        for (const t of targets) {
          t.poison += Math.floor(effect.scale === "poison" ? t.poison : amount);
          a.counters[`poison:${t.id}`] =
            (a.counters[`poison:${t.id}`] ?? 0) +
            Math.floor(effect.scale === "poison" ? t.poison / 2 : amount);
          addLog(b, "status", a.memberId, t.id, t.poison, `${t.poison} Poison`);
        }
        break;
      case "weak":
      case "vulnerable":
        for (const t of targets) {
          t[effect.op] += amount;
          addLog(
            b,
            "status",
            a.memberId,
            t.id,
            amount,
            `+${amount} ${effect.op}`,
          );
        }
        break;
      case "strength":
        heroTarget.powers.strength = (heroTarget.powers.strength ?? 0) + amount;
        addLog(
          b,
          "status",
          a.memberId,
          heroTarget.memberId,
          amount,
          `+${amount} Strength`,
        );
        break;
      case "power": {
        const key = effect.key!;
        if (["keep-block", "double-first-block", "echo"].includes(key))
          a.powers[key] = 1;
        else a.powers[key] = (a.powers[key] ?? 0) + amount;
        addLog(b, "power", a.memberId, a.memberId, amount, d.name);
        break;
      }
      case "discard": {
        const selected = effect.all
          ? [...a.hand]
          : [requireChoice(a, choiceUid, "hand")];
        a.counters["last-discard"] = selected.length;
        for (const card of selected) {
          a.hand = a.hand.filter((c) => c.uid !== card.uid);
          a.discard.push(card);
          a.counters.discarded = (a.counters.discarded ?? 0) + 1;
          const def = definition(content, card);
          addLog(
            b,
            "discard",
            a.memberId,
            a.memberId,
            1,
            `Discarded ${def.name}`,
          );
          if (def.discardEffect) {
            const ds = card.upgraded
              ? def.discardEffect.map((e) => ({
                  ...e,
                  amount:
                    def.upgrade.effects.find((x) => x.op === e.op)?.amount ??
                    e.amount,
                }))
              : def.discardEffect;
            effects(b, a, def, ds, targetId, undefined, content);
          }
        }
        if (
          selected.length &&
          a.powers["discard-draw"] &&
          !a.counters["discard-draw"]
        ) {
          a.counters["discard-draw"] = 1;
          draw(b, a, a.powers["discard-draw"]);
        }
        break;
      }
      case "exhaust": {
        const selected = effect.all
          ? [...a.hand]
          : [requireChoice(a, choiceUid, "hand")];
        a.counters["last-exhaust"] = selected.length;
        for (const card of selected) {
          a.hand = a.hand.filter((c) => c.uid !== card.uid);
          exhaustCard(b, a, card);
          addLog(
            b,
            "exhaust",
            a.memberId,
            a.memberId,
            1,
            `Exhausted ${definition(content, card).name}`,
          );
        }
        break;
      }
      case "recover": {
        if (a.hand.length >= 10) throw new Error("Your hand is full");
        const card = requireChoice(a, choiceUid, "discard");
        a.discard = a.discard.filter((c) => c.uid !== card.uid);
        delete card.heldAcrossTurn;
        a.hand.push(card);
        addLog(
          b,
          "recover",
          a.memberId,
          a.memberId,
          1,
          `${definition(content, card).name} returned to hand`,
        );
        break;
      }
      case "generate":
        for (let i = 0; i < amount; i++) {
          const id = effect.key === "scrap-discard" ? "scrap" : effect.key!;
          const token: CardInstance = {
            uid: `${b.id}:token:${++b.queuedCardUid}`,
            cardId: id,
            upgraded: false,
            generated: true,
          };
          if (effect.key === "scrap-discard") a.discard.push(token);
          else if (a.hand.length < 10) a.hand.push(token);
          else a.discard.push(token);
          addLog(
            b,
            "generate",
            a.memberId,
            a.memberId,
            1,
            `${definition(content, token).name} created in ${a.hand.includes(token) ? "hand" : "discard"}`,
          );
          if (id === "scrap" && a.powers["scrap-damage"])
            for (const t of b.enemies)
              hit(b, a.memberId, t, a.powers["scrap-damage"]);
        }
        break;
      case "retain": {
        const card = requireChoice(a, choiceUid, "hand");
        a.powers[`retain:${card.uid}`] = 1;
        addLog(
          b,
          "status",
          a.memberId,
          a.memberId,
          1,
          `${definition(content, card).name} will stay in hand`,
        );
        break;
      }
      case "reduce-cost": {
        const card = requireChoice(a, choiceUid, "hand");
        card.costDelta = (card.costDelta ?? 0) - amount;
        addLog(
          b,
          "status",
          a.memberId,
          a.memberId,
          amount,
          `${definition(content, card).name} now costs ${cardCost(content, card)} energy`,
        );
        break;
      }
      case "copy": {
        if (a.hand.length >= 10) throw new Error("Your hand is full");
        const card = requireChoice(a, choiceUid, "hand");
        const def = definition(content, card);
        if (def.nonCopyable || def.type !== "attack" || card.generated)
          throw new Error("Choose an original Attack without a copying effect");
        const copy = {
          ...card,
          uid: `${b.id}:copy:${++b.queuedCardUid}`,
          generated: true,
        };
        delete copy.heldAcrossTurn;
        a.hand.push(copy);
        addLog(
          b,
          "generate",
          a.memberId,
          a.memberId,
          1,
          `${def.name} copy added to hand`,
        );
        choiceUid = copy.uid;
        break;
      }
      case "double-block":
        block(b, a, a.block, a.memberId);
        break;
      case "spend-block":
        a.block = 0;
        a.blockSources = [];
        break;
      case "repeat-ally":
        if (targetEnemy) {
          targetEnemy.repeat = { donorId: a.memberId, amount: 1 };
          addLog(
            b,
            "setup",
            a.memberId,
            targetEnemy.id,
            1,
            "Next teammate attack repeats",
          );
        }
        break;
      case "charge":
        a.powers.charge = (a.powers.charge ?? 0) + amount;
        addLog(
          b,
          "status",
          a.memberId,
          a.memberId,
          amount,
          `+${amount} Charge · ${a.powers.charge} total`,
        );
        break;
      case "heal": {
        const n = Math.min(heroTarget.maxHp - heroTarget.hp, amount);
        heroTarget.hp += n;
        const effective = Math.min(
          n,
          heroTarget.powers["enemy-health-lost"] ?? 0,
        );
        if (effective > 0 && heroTarget.memberId !== a.memberId)
          help(b, a.memberId, heroTarget.memberId);
        heroTarget.powers["enemy-health-lost"] = Math.max(
          0,
          (heroTarget.powers["enemy-health-lost"] ?? 0) - n,
        );
        addLog(
          b,
          "heal",
          a.memberId,
          heroTarget.memberId,
          n,
          `Restored ${n} health`,
        );
        break;
      }
      case "all-block":
        for (const ally of Object.values(b.actors).filter(
          (t) => t.crewId === a.crewId,
        ))
          block(b, ally, amount, a.memberId);
        break;
      case "all-energy":
        for (const ally of Object.values(b.actors).filter(
          (t) => t.crewId === a.crewId,
        )) {
          ally.energy += amount;
          if (ally.memberId !== a.memberId)
            ally.energySources.push({
              sourceId: a.memberId,
              remaining: amount,
            });
          addLog(
            b,
            "energy",
            a.memberId,
            ally.memberId,
            amount,
            `+${amount} energy`,
          );
        }
        break;
    }
  }
}
export function validatePlay(
  b: Combat,
  memberId: string,
  cardUid: string,
  targetId: string | undefined,
  choiceUid: string | undefined,
  content: Content,
): { actor: BattleActor; card: CardInstance; def: CardDefinition } {
  if (b.phase !== "player" || b.result) throw new Error("Wait for your turn");
  const actor = b.actors[memberId];
  if (!actor) throw new Error("You are watching this fight");
  if (actor.ended) throw new Error("Change End turn before playing");
  if (actor.recovery || actor.hp === 0) throw new Error("Use Rally or Shelter");
  const card = actor.hand.find((c) => c.uid === cardUid);
  if (!card) throw new Error("That card is no longer in your hand");
  const def = definition(content, card);
  if (actor.energy < cardCost(content, card))
    throw new Error("Not enough energy");
  if (
    ["self", "hand", "discard", "none"].includes(def.target) &&
    targetId !== undefined &&
    targetId !== memberId
  )
    throw new Error("This card affects only you");
  if (
    def.target === "enemy" &&
    !b.enemies.some((e) => e.id === targetId && e.hp > 0)
  )
    throw new Error("Choose a standing enemy");
  if (["ally", "any-hero"].includes(def.target)) {
    const t = b.actors[targetId ?? ""];
    if (!t) throw new Error("Choose a player");
    if (!def.crossTeam && t.crewId !== actor.crewId)
      throw new Error("Choose a teammate");
    if (def.target === "ally" && t.memberId === memberId)
      throw new Error("Choose another player");
    if (t.hp === 0 && !def.effects.some((e) => e.op === "heal"))
      throw new Error("That player is downed");
  }
  if (def.target === "hand" || def.choose === "hand")
    requireChoice(actor, choiceUid, "hand");
  if (def.target === "discard" || def.choose === "discard")
    requireChoice(actor, choiceUid, "discard");
  if (cardUid === choiceUid) throw new Error("Choose another card");
  return { actor, card, def };
}
export function playCard(
  b: Combat,
  memberId: string,
  cardUid: string,
  targetId: string | undefined,
  choiceUid: string | undefined,
  content: Content,
): void {
  const {
    actor: a,
    card,
    def: d,
  } = validatePlay(b, memberId, cardUid, targetId, choiceUid, content);
  const version = card.upgraded ? d.upgrade : d;
  a.hand = a.hand.filter((c) => c.uid !== cardUid);
  const spent = cardCost(content, card);
  let borrowed = Math.max(
    0,
    spent -
      (a.energy - a.energySources.reduce((sum, s) => sum + s.remaining, 0)),
  );
  while (borrowed > 0 && a.energySources.length) {
    const source = a.energySources[0]!;
    const n = Math.min(source.remaining, borrowed);
    source.remaining -= n;
    borrowed -= n;
    if (n > 0) help(b, source.sourceId, memberId);
    if (source.remaining === 0) a.energySources.shift();
  }
  a.energy -= spent;
  addLog(b, "play", memberId, targetId ?? memberId, 0, d.name, {
    card: {
      id: d.id,
      upgraded: card.upgraded,
      cost: spent,
      text: version.text,
    },
  });
  const relicStart = b.eventSequence;
  a.counters["manual-play"] = 1;
  a.counters["retained-play"] =
    d.type === "attack" && card.heldAcrossTurn ? 1 : 0;
  delete card.heldAcrossTurn;
  const selectedEnemy = b.enemies.find((e) => e.id === targetId);
  const allyRepeat =
    selectedEnemy?.repeat &&
    selectedEnemy.repeat.donorId !== memberId &&
    b.actors[selectedEnemy.repeat.donorId]?.crewId === a.crewId &&
    d.type === "attack"
      ? selectedEnemy.repeat
      : null;
  const echo = d.type === "attack" && a.powers.echo && !a.counters.echo;
  if (allyRepeat && selectedEnemy) selectedEnemy.repeat = null;
  if (echo) a.counters.echo = 1;
  effects(b, a, d, version.effects, targetId, choiceUid, content);
  a.counters["retained-play"] = 0;
  if (d.type === "attack") {
    a.counters.attacks = (a.counters.attacks ?? 0) + 1;
    a.counters[`attacks:${targetId}`] =
      (a.counters[`attacks:${targetId}`] ?? 0) + 1;
    if (allyRepeat || echo) {
      const damageOnly = version.effects.filter((e) =>
        ["damage", "poison", "weak", "vulnerable"].includes(e.op),
      );
      const before = b.contributions[memberId]?.damage ?? 0;
      effects(b, a, d, damageOnly, targetId, choiceUid, content);
      if (allyRepeat && (b.contributions[memberId]?.damage ?? 0) > before) {
        help(b, allyRepeat.donorId, memberId);
        addLog(
          b,
          "combo",
          allyRepeat.donorId,
          memberId,
          (b.contributions[memberId]?.damage ?? 0) - before,
          `${d.name} repeated`,
        );
      }
    }
    if (a.powers["attack-chain"] && (a.counters.attacks ?? 0) % 5 === 0)
      for (const enemy of b.enemies)
        hit(b, memberId, enemy, a.powers["attack-chain"]);
  }
  a.counters.cards = (a.counters.cards ?? 0) + 1;
  if (a.powers.rhythm && a.counters.cards % 3 === 0)
    block(b, a, a.powers.rhythm, memberId);
  if (d.exhaust || card.generated) exhaustCard(b, a, card);
  else if (d.type !== "power") a.discard.push(card);
  if (targetId && b.actors[targetId] && targetId !== memberId) {
    if (a.powers["help-draw"] && !a.counters["help-draw"]) {
      a.counters["help-draw"] = 1;
      draw(b, a, a.powers["help-draw"]);
    }
  }
  a.counters["manual-play"] = 0;
  const ownEvents = b.log.filter(
    (e) => e.id > relicStart && e.sourceId === memberId,
  );
  const trigger = (
    effect: Parameters<typeof takeRelic>[1],
    condition: boolean,
  ) => (condition ? takeRelic(a, effect) : undefined);
  const energyRelic = trigger(
    "health-energy",
    ownEvents.some((e) => e.kind === "cost" && e.amount > 0),
  );
  if (energyRelic && a.hp > 0) {
    a.energy += energyRelic.amount;
    addLog(
      b,
      "energy",
      memberId,
      memberId,
      energyRelic.amount,
      `+${energyRelic.amount} energy`,
    );
    b.log[b.log.length - 1]!.relicId = energyRelic.id;
  }
  const third = trigger(
    "third-attack",
    d.type === "attack" && a.counters.attacks === 3,
  );
  if (third) relicBlock(b, a, third.amount, third.id);
  const poison = trigger(
    "poison-block",
    ownEvents.some(
      (e) =>
        e.kind === "status" &&
        e.text.toLowerCase().includes("poison") &&
        e.amount > 0,
    ),
  );
  if (poison) relicBlock(b, a, poison.amount, poison.id);
  for (const [effect, condition] of [
    [
      "discard-draw",
      ownEvents.some((e) => e.kind === "discard" && e.amount > 0),
    ],
    [
      "exhaust-draw",
      d.exhaust ||
        card.generated ||
        ownEvents.some((e) => e.kind === "exhaust" && e.amount > 0),
    ],
    [
      "help-draw",
      ownEvents.some(
        (e) =>
          e.targetId !== memberId &&
          !!b.actors[e.targetId] &&
          e.amount > 0 &&
          ["block", "heal", "energy", "draw"].includes(e.kind),
      ),
    ],
  ] as const) {
    const r = trigger(effect, !!condition);
    if (r && a.hp > 0) {
      const n = a.hand.length;
      draw(b, a, r.amount);
      addLog(
        b,
        "draw",
        memberId,
        memberId,
        a.hand.length - n,
        `Drew ${a.hand.length - n}`,
      );
      b.log[b.log.length - 1]!.relicId = r.id;
    }
  }
  a.handRevision++;
  for (const actor of Object.values(b.actors))
    if (actor.hp === 0) actor.recovery = true;
  if (b.enemies.every((e) => e.hp <= 0)) {
    b.result = "victory";
    b.phase = "result";
  } else b.intents = makeIntents(b);
}
export function preview(
  b: Combat,
  memberId: string,
  cardUid: string,
  targetId: string | undefined,
  choiceUid: string | undefined,
  content: Content,
): { events: Combat["log"]; message: string } {
  const copy = structuredClone(b);
  const sequence = copy.eventSequence;
  try {
    playCard(copy, memberId, cardUid, targetId, choiceUid, content);
    const events = copy.log.filter((e) => e.id > sequence && e.kind !== "play");
    return {
      events,
      message: events.map((e) => e.text).join(" · ") || "Apply effect",
    };
  } catch (err) {
    return {
      events: [],
      message: err instanceof Error ? err.message : "Cannot play",
    };
  }
}
export function recoveryPlay(
  b: Combat,
  id: string,
  action: "rally" | "shelter",
  targetId?: string,
): void {
  const a = b.actors[id];
  if (!a || b.phase !== "player" || (!a.recovery && a.hp > 0) || a.ended)
    throw new Error("Recovery is not available");
  if (action === "rally") {
    if (a.energy < 3) throw new Error("Rally needs 3 energy");
    a.energy -= 3;
    a.hp = Math.min(a.maxHp, a.hp + 12);
    a.ended = true;
    addLog(b, "heal", id, id, 12, "Rally · normal cards next turn");
  } else {
    const target = b.actors[targetId ?? ""];
    if (
      a.energy < 1 ||
      a.counters.shelter ||
      !target ||
      target.hp <= 0 ||
      target.memberId === id ||
      target.crewId !== a.crewId
    )
      throw new Error("Choose a standing teammate");
    a.energy--;
    a.counters.shelter = 1;
    block(b, target, 4, id);
  }
}
export function enemyPhase(b: Combat, now: number, content: Content): void {
  // Enemy Block lasts through the players' response, then expires on its own turn.
  for (const enemy of b.enemies) enemy.block = 0;
  for (const a of Object.values(b.actors)) {
    for (const card of [...a.hand]) {
      if (definition(content, card).retain || a.powers[`retain:${card.uid}`]) {
        card.heldAcrossTurn = true;
        continue;
      }
      a.hand = a.hand.filter((c) => c.uid !== card.uid);
      a.discard.push(card);
    }
    a.ended = true;
  }
  b.phase = "enemy";
  const presentationActions =
    b.intents.filter((intent) =>
      b.enemies.some((enemy) => enemy.id === intent.enemyId && enemy.hp > 0),
    ).length +
    (b.enemies.some((enemy) => enemy.hp > 0 && enemy.poison > 0) ? 1 : 0);
  // A single enemy gets one readable response, not eight seconds of dead air.
  // The authored duration remains the maximum for larger encounters.
  b.deadline =
    now +
    Math.min(content.timing.enemy, Math.max(2500, presentationActions * 2500));
  for (const e of b.enemies.filter((e) => e.hp > 0)) {
    if (e.poison > 0) {
      const sources = Object.values(b.actors).filter(
        (a) => (a.counters[`poison:${e.id}`] ?? 0) > 0,
      );
      if (sources.length) {
        const actual = Math.min(e.hp, e.poison);
        const total = sources.reduce(
          (sum, a) => sum + a.counters[`poison:${e.id}`]!,
          0,
        );
        const allocations = sources.map((a) =>
          Math.floor((actual * a.counters[`poison:${e.id}`]!) / total),
        );
        let left = actual - allocations.reduce((sum, n) => sum + n, 0);
        for (let i = 0; left > 0; i++, left--)
          allocations[(i + b.turn) % sources.length]!++;
        for (let i = 0; i < sources.length; i++)
          if (allocations[i]! > 0)
            hit(b, sources[i]!.memberId, e, allocations[i]!, true);
        const decaying = sources[(b.turn - 1) % sources.length]!;
        decaying.counters[`poison:${e.id}`] = Math.max(
          0,
          decaying.counters[`poison:${e.id}`]! - 1,
        );
      } else hit(b, Object.keys(b.actors)[0]!, e, e.poison, true);
      e.poison = Math.max(0, e.poison - 1);
    }
  }
  if (b.enemies.every((e) => e.hp <= 0)) {
    b.phase = "result";
    b.result = "victory";
    return;
  }
  for (const intent of b.intents) {
    const enemy = b.enemies.find((e) => e.id === intent.enemyId);
    if (!enemy || enemy.hp <= 0) continue;
    if (intent.kind === "charge" && enemy.pattern === "support") {
      for (const e of b.enemies.filter((e) => e.id !== enemy.id))
        e.strength += 2;
      addLog(
        b,
        "enemy",
        enemy.id,
        "main",
        2,
        `${enemy.name} gives +2 Strength`,
      );
      continue;
    }
    if (intent.block) {
      enemy.block += intent.block;
      addLog(
        b,
        "enemy",
        enemy.id,
        enemy.id,
        intent.block,
        `+${intent.block} Block · ${intent.label}`,
      );
    }
    for (const target of intent.targets) {
      const a = b.actors[target.memberId];
      if (!a || a.hp <= 0) continue;
      const blocked = Math.min(a.block, target.damage);
      a.block -= blocked;
      let left = blocked;
      while (left > 0 && a.blockSources.length) {
        const src = a.blockSources[0]!;
        const n = Math.min(left, src.remaining);
        src.remaining -= n;
        left -= n;
        contribute(b, src.sourceId, "protection", n);
        if (src.sourceId !== a.memberId) help(b, src.sourceId, a.memberId);
        if (src.remaining === 0) a.blockSources.shift();
      }
      const actual = Math.min(a.hp, target.damage - blocked);
      a.hp -= actual;
      a.powers["enemy-health-lost"] =
        (a.powers["enemy-health-lost"] ?? 0) + actual;
      addLog(
        b,
        "enemy-hit",
        enemy.id,
        a.memberId,
        actual,
        `${intent.label} · ${blocked} blocked · ${actual} health lost`,
        { blocked },
      );
      if (a.powers.thorns) hit(b, a.memberId, enemy, a.powers.thorns);
      if (a.hp === 0) {
        a.recovery = true;
        addLog(
          b,
          "downed",
          enemy.id,
          a.memberId,
          0,
          "Downed · Rally next turn",
        );
      }
    }
    enemy.vulnerable = Math.max(0, enemy.vulnerable - 1);
    enemy.weak = Math.max(0, enemy.weak - 1);
  }
  b.reduction = 0;
  if (b.enemies.every((e) => e.hp <= 0)) {
    b.result = "victory";
    b.phase = "result";
  } else if (
    Object.values(b.actors).every((a) => a.hp === 0) ||
    (b.kind === "boss" && b.turn >= 7)
  ) {
    b.result = "defeat";
    b.phase = "result";
  }
}
export function beginTurn(b: Combat, now: number, content: Content): void {
  b.turn++;
  b.phase = "player";
  b.deadline = now + content.timing.turn;
  for (const a of Object.values(b.actors)) {
    a.energy = 3;
    if (a.relicState) a.relicState.turnUses = {};
    a.energySources = [];
    a.ended = false;
    a.counters = Object.fromEntries(
      Object.entries(a.counters).filter(([k]) => k.startsWith("poison:")),
    );
    a.handRevision++;
    if (!a.powers["keep-block"]) {
      a.block = 0;
      a.blockSources = [];
    }
    for (const key of Object.keys(a.powers))
      if (key.startsWith("retain:")) delete a.powers[key];
    for (const c of a.hand) delete c.costDelta;
    if (a.hp > 0) {
      a.recovery = false;
      const shell = relic(a, "turn-block");
      if (shell) relicBlock(b, a, shell.amount, shell.id);
      draw(b, a, 5);
      a.powers.charge =
        (a.powers.charge ?? 0) + (a.powers["charge-start"] ?? 0);
      for (const e of b.enemies.filter((e) => e.hp > 0)) {
        e.poison += a.powers["poison-mist"] ?? 0;
        if (a.powers["poison-mist"])
          a.counters[`poison:${e.id}`] =
            (a.counters[`poison:${e.id}`] ?? 0) + a.powers["poison-mist"];
      }
    }
  }
  b.intents = makeIntents(b);
}

function relicBlock(
  b: Combat,
  a: BattleActor,
  amount: number,
  relicId: string,
): void {
  if (a.hp <= 0) return;
  a.block += amount;
  a.blockSources.push({ sourceId: a.memberId, remaining: amount });
  addLog(b, "block", a.memberId, a.memberId, amount, `+${amount} Block`);
  b.log[b.log.length - 1]!.relicId = relicId;
}
