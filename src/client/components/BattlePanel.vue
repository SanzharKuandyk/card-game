<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useGame } from "../stores/game.ts";
import CardTile from "./CardTile.vue";
import HeroBadge from "./HeroBadge.vue";
import CombatArt from "./CombatArt.vue";
import EnergyDisplay from "./EnergyDisplay.vue";
import CardText from "./CardText.vue";
import KeywordGuide from "./KeywordGuide.vue";
import CombatPlayback from "./CombatPlayback.vue";
import CombatHistory from "./CombatHistory.vue";
import EffectDetails from "./EffectDetails.vue";
import StatusEffects from "./StatusEffects.vue";
import TurnClock from "./TurnClock.vue";
import { enemyStatuses } from "../combat-status.ts";
import type { CombatView } from "../../shared/model.ts";
import type {
  CombatBeat,
  PlaybackStage,
  PlaybackItem,
} from "../combat-feedback.ts";
import CombatLink from "./CombatLink.vue";
import ImpactBurst from "./ImpactBurst.vue";
import { impactFor } from "../combat-feedback.ts";
const props = defineProps<{
  combat: CombatView;
  scene: CombatView | null;
  beat: CombatBeat | null;
  last: CombatBeat | null;
  stage: PlaybackStage;
  skipped: number;
  upcoming: PlaybackItem[];
  recent: PlaybackItem[];
  locked?: boolean;
}>();
const game = useGame();
defineEmits<{ help: []; cards: [] }>();
const crewName = computed(
  () =>
    game.view?.crews.find((crew) => crew.id === game.view?.crewId)?.name ??
    "Team",
);
const selected = ref<string | null>(null),
  target = ref<string>(""),
  choice = ref<string>(""),
  targetCrew = ref<string>(""),
  previewText = ref("");
const logOpen = ref(false);
const keywordsOpen = ref(false);
const inspectedIntent = ref<string | null>(null);
const intention = computed(() =>
  b.value.intents.find((i) => i.enemyId === inspectedIntent.value),
);
const intentLines = computed(() => {
  const i = intention.value;
  if (!i) return [];
  return [
    intentHint(i.enemyId),
    ...i.targets.map(
      (t) =>
        `${b.value.actors.find((a) => a.memberId === t.memberId)?.name ?? "Player"}: ${t.damage} damage before Block.`,
    ),
  ];
});
function intentLabel(id: string) {
  const i = b.value.intents.find((i) => i.enemyId === id);
  if (!i) return "No attack";
  if (i.targets.length) {
    const values = [...new Set(i.targets.map((t) => t.damage))];
    return `↘ ${values.length === 1 ? values[0] : `${Math.min(...values)}–${Math.max(...values)}`} · ${i.label}`;
  }
  return `${i.kind === "guard" ? "◇" : "↑"} ${i.label}${i.block ? ` · ${i.block}` : ""}`;
}
const b = computed(() =>
  props.scene?.id === props.combat.id ? props.scene : props.combat,
);
const targets = computed(() => [
  ...new Set(
    props.beat?.events
      .filter((event) => event.kind !== "play")
      .map((event) => event.targetId) ?? [],
  ),
]);
const enemyActing = computed(
  () =>
    !!props.beat && b.value.enemies.some((e) => e.id === props.beat?.sourceId),
);
const impact = (id: string) =>
  impactFor(
    props.stage === "impact" || props.stage === "exit" ? props.beat : null,
    id,
  );
const own = computed(() =>
  b.value.actors.find((a) => a.memberId === game.view?.memberId),
);
const current = computed(() =>
  b.value.hand.find((c) => c.uid === selected.value),
);
const teammates = computed(() =>
  b.value.actors.filter((a) => a.crewId === game.view?.crewId),
);
const choices = computed(() => {
  const card = current.value;
  if (!card) return [];
  const pile =
    card.definition.target === "discard" || card.definition.choose === "discard"
      ? "discard"
      : "hand";
  return b.value.choices.filter(
    (c) =>
      c.uid !== selected.value &&
      (pile === "hand"
        ? b.value.hand.some((h) => h.uid === c.uid)
        : !b.value.hand.some((h) => h.uid === c.uid)),
  );
});
const cardText = computed(() =>
  current.value
    ? current.value.upgraded
      ? current.value.definition.upgrade.text
      : current.value.definition.text
    : "Choose a card",
);
const previewAddsInfo = computed(() => {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/^(deal|gain)\s+/, "")
      .replace(/^\+/, "")
      .replace(/\.$/, "");
  return (
    !current.value || normalize(previewText.value) !== normalize(cardText.value)
  );
});
const needsHero = computed(
  () =>
    ["ally", "any-hero"].includes(current.value?.definition.target ?? "") ||
    selected.value === "shelter",
);
const needsChoice = computed(
  () =>
    !!current.value &&
    (!!current.value.definition.choose ||
      ["hand", "discard"].includes(current.value.definition.target)),
);
const selectedPlayers = computed(() =>
  b.value.actors.filter(
    (a) =>
      a.crewId === (targetCrew.value || game.view?.crewId) &&
      (a.hp > 0 ||
        current.value?.definition.effects.some((e) => e.op === "heal")) &&
      (!(current.value?.definition.target === "ally") ||
        a.memberId !== game.view?.memberId),
  ),
);
const turnHint = computed(() => {
  if (b.value.phase === "enemy")
    return "Enemy turn. Block absorbs damage before health.";
  if (own.value?.ended)
    return "Your turn is ended. Change lets you play again while teammates finish.";
  if (own.value?.recovery)
    return "You are downed. Rally to recover, or Shelter a teammate.";
  if (!selected.value) return "Choose a card, then Play.";
  if (needsHero.value && !target.value)
    return "Choose who receives this card's effect.";
  if (needsChoice.value && !choice.value)
    return "Choose the card this effect will use.";
  if (current.value && current.value.cost > (own.value?.energy ?? 0))
    return `Needs ${current.value.cost} energy. You have ${own.value?.energy ?? 0}.`;
  return "Play applies this card now. End turn lets the enemies act after everyone ends.";
});
function intentHint(enemyId: string) {
  if (
    (props.beat?.sourceId === enemyId &&
      (props.stage === "impact" || props.stage === "exit")) ||
    (!props.beat && b.value.phase === "enemy")
  )
    return "Attack resolved.";
  const intent = b.value.intents.find((i) => i.enemyId === enemyId);
  const hit = intent?.targets.find((t) => t.memberId === own.value?.memberId);
  if (hit)
    return b.value.phase === "enemy"
      ? `Attacking you for ${hit.damage} before Block.`
      : `After the team ends: ${hit.damage} damage to you.`;
  if (intent?.kind === "guard")
    return `Gains ${intent.block} Block instead of attacking.`;
  if (intent?.kind === "charge") return "Preparing its next move.";
  return intent?.targets.length
    ? "Targets your teammates this turn."
    : "No attack on you this turn.";
}
function damage(id: string) {
  if (
    b.value.phase === "enemy" &&
    (!props.beat || props.stage === "impact" || props.stage === "exit")
  )
    return 0;
  return b.value.intents
    .flatMap((i) => i.targets)
    .filter((t) => t.memberId === id)
    .reduce((s, t) => s + t.damage, 0);
}
function chooseCard(uid: string) {
  selected.value = uid;
  choice.value = "";
  const card = b.value.hand.find((c) => c.uid === uid);
  target.value =
    card?.definition.target === "enemy"
      ? (b.value.enemies.find((e) => e.hp > 0)?.id ?? "")
      : card?.definition.target === "self"
        ? game.view!.memberId!
        : "";
  targetCrew.value = game.view!.crewId!;
}
async function updatePreview() {
  if (!selected.value) {
    previewText.value = "";
    return;
  }
  const selectionKey = [selected.value, target.value, choice.value].join("|");
  const result = await game.command({
    kind: "preview",
    cardUid: selected.value,
    targetId: target.value || undefined,
    choiceUid: choice.value || undefined,
  });
  if (selectionKey !== [selected.value, target.value, choice.value].join("|"))
    return;
  if ("preview" in result)
    previewText.value = result.preview?.message ?? result.message;
  else previewText.value = result.message;
}
watch(
  [selected, target, choice],
  () => {
    void updatePreview();
  },
  { immediate: true },
);
watch(
  () => b.value?.id,
  () => {
    selected.value = null;
    target.value = "";
    choice.value = "";
  },
);
watch(
  () => b.value?.handRevision,
  () => {
    if (
      selected.value &&
      !["rally", "shelter"].includes(selected.value) &&
      !b.value.hand.some((c) => c.uid === selected.value)
    )
      selected.value = null;
    else if (selected.value) void updatePreview();
  },
);
async function play() {
  if (!selected.value) return;
  const result = await game.command({
    kind: "play",
    cardUid: selected.value,
    handRevision: b.value.handRevision,
    targetId: target.value || undefined,
    choiceUid: choice.value || undefined,
  });
  if (result.accepted) {
    selected.value = null;
    target.value = "";
    choice.value = "";
    previewText.value = "";
  }
}
watch(
  () => own.value?.energy,
  () => {
    if (selected.value) void updatePreview();
  },
);
</script>
<template>
  <section
    class="battle battle-fit"
    :class="{
      revealing: b.phase === 'enemy',
      'prediction-active': b.phase.startsWith('prediction'),
    }"
  >
    <EffectDetails
      v-if="intention"
      :title="`${b.enemies.find((e) => e.id === intention?.enemyId)?.name} · ${intention.label}`"
      :lines="intentLines"
      @close="inspectedIntent = null"
    />
    <header class="battle-heading">
      <div class="turn-identity">
        <small :title="game.connected ? 'Connected' : 'Reconnecting'">{{
          crewName
        }}</small>
        <h1>
          {{
            enemyActing
              ? "Enemy turn"
              : b.kind === "boss"
                ? "Boss"
                : `Turn ${b.turn}`
          }}
        </h1>
      </div>
      <span v-if="own" class="personal-danger"
        >{{ own.hp }} HP · {{ own.block }} Block<span
          v-if="damage(own.memberId)"
        >
          · Incoming {{ damage(own.memberId) }}</span
        ></span
      >
      <TurnClock
        :remaining-ms="combat.remainingMs"
        :paused="game.view?.status === 'paused'"
        :offline="!game.connected"
      />
      <button class="quiet scene-history" @click="logOpen = true">
        History
      </button>
      <button
        class="quiet battle-deck"
        :aria-label="`Cards · ${game.view?.hero?.deck.length ?? 0}`"
        @click="$emit('cards')"
      >
        Cards
      </button>
      <button
        class="quiet battle-help"
        aria-label="Help"
        @click="$emit('help')"
      >
        ?
      </button>
    </header>
    <section
      v-if="b.phase === 'prediction' || b.phase === 'prediction-result'"
      class="prediction"
    >
      <h2>{{ b.prediction?.title }}</h2>
      <p class="intended-rule">{{ b.prediction?.rule }}</p>
      <ol>
        <li v-for="step in b.prediction?.steps" :key="step">{{ step }}</li>
      </ol>
      <div class="prediction-choices">
        <button
          v-for="(answer, i) in b.prediction?.choices"
          :key="answer"
          :class="{
            selected: b.ownAnswer === i,
            correct:
              b.phase === 'prediction-result' &&
              b.prediction &&
              'correct' in b.prediction &&
              b.prediction.correct === i,
          }"
          :disabled="
            b.phase !== 'prediction' ||
            b.ownAnswer !== null ||
            game.busy ||
            !game.connected ||
            !game.view?.controlling
          "
          @click="game.command({ kind: 'prediction', choice: i })"
        >
          {{ answer }}
        </button>
      </div>
      <p v-if="b.phase === 'prediction'">
        {{ b.answered }}/{{ b.required }} answered{{
          b.ownAnswer !== null ? " · Answer saved" : ""
        }}
      </p>
      <template v-else
        ><p v-if="b.prediction && 'explanations' in b.prediction">
          {{ b.prediction.explanations[b.prediction.correct] }}
        </p>
        <strong>Next attack reduced by {{ b.reduction }}%</strong></template
      >
    </section>
    <template v-else
      ><div
        class="combat-scene"
        :class="{ 'large-crew': teammates.length > 2 }"
      >
        <div class="combat-arena">
          <CombatLink
            :source="beat?.sourceId"
            :targets="targets"
            :active="!!beat && stage === 'windup'"
            :effect-key="beat?.key"
          />
          <div class="enemies">
            <div v-for="enemy in b.enemies" :key="enemy.id" class="enemy-unit">
              <button
                v-if="enemy.hp > 0"
                class="enemy-intention"
                :aria-label="`${enemy.name} intention: ${intentLabel(enemy.id)}`"
                @click="inspectedIntent = enemy.id"
              >
                {{ intentLabel(enemy.id) }}
              </button>
              <button
                class="enemy"
                :data-combat-id="enemy.id"
                :class="{
                  selected: target === enemy.id,
                  fallen: enemy.hp === 0,
                  'action-source':
                    beat?.sourceId === enemy.id &&
                    stage !== 'impact' &&
                    stage !== 'exit',
                  'action-target':
                    targets.includes(enemy.id) && stage === 'windup',
                }"
                :disabled="
                  enemy.hp === 0 || current?.definition.target !== 'enemy'
                "
                :aria-label="`Target ${enemy.name}`"
                @click="target = enemy.id"
              >
                <ImpactBurst
                  :impact="impact(enemy.id)"
                  :effect-key="beat?.key"
                />
                <CombatArt
                  :key="beat?.key"
                  :kind="enemy.pattern"
                  :class="{
                    'source-strike':
                      beat?.sourceId === enemy.id && stage === 'windup',
                  }"
                />
                <div class="scene-enemy-info">
                  <strong>{{ enemy.name }}</strong
                  ><span class="enemy-hp">{{ enemy.hp }}/{{ enemy.maxHp }}</span
                  ><span class="meter health"
                    ><span
                      v-if="(stage === 'impact' || stage === 'exit') && beat"
                      :key="beat.key"
                      class="health-trail"
                      :style="{
                        width: `${((beat.before.enemies.find((e) => e.id === enemy.id)?.hp ?? enemy.hp) / enemy.maxHp) * 100}%`,
                      }" />
                    <span
                      :style="{
                        width: `${(enemy.hp / enemy.maxHp) * 100}%`,
                      }" /></span
                  ><span v-if="enemy.block">{{ enemy.block }} Block</span>
                </div>
              </button>
              <StatusEffects
                :effects="enemyStatuses(enemy)"
                :owner="enemy.name"
              />
            </div>
          </div>
          <div
            class="crew-actors"
            :style="{ '--crew-size': Math.max(1, teammates.length) }"
          >
            <HeroBadge
              v-for="actor in teammates"
              :key="actor.memberId"
              :actor="actor"
              :own="actor.memberId === game.view?.memberId"
              :selected="target === actor.memberId"
              :damage="damage(actor.memberId)"
              :impact="impact(actor.memberId)"
              :effect-key="
                stage === 'impact' || stage === 'exit' ? beat?.key : undefined
              "
              :previous-hp="
                stage === 'impact' || stage === 'exit'
                  ? beat?.before.actors.find(
                      (a) => a.memberId === actor.memberId,
                    )?.hp
                  : undefined
              "
              :acting="
                beat?.sourceId === actor.memberId &&
                stage !== 'impact' &&
                stage !== 'exit'
              "
              :targeted="targets.includes(actor.memberId) && stage === 'windup'"
              :selectable="
                needsHero &&
                selectedPlayers.some(
                  (player) => player.memberId === actor.memberId,
                )
              "
              @select="needsHero && (target = actor.memberId)"
            />
          </div>
        </div>
        <CombatPlayback
          :beat="beat"
          :last="last"
          :stage="stage"
          :cards="game.view?.cards ?? []"
          :skipped="skipped"
          :upcoming="upcoming"
          :recent="recent"
          @history="logOpen = true"
        />
      </div>
      <div
        v-if="own"
        class="play-area"
        :inert="locked || !!beat || undefined"
        :class="{ 'card-selected': !!selected, 'is-resolving': !!beat }"
        :aria-busy="!!beat"
      >
        <div class="hand-heading">
          <EnergyDisplay :amount="own.energy" />
          <span>{{
            own.recovery
              ? "Recovery"
              : `${b.piles.draw} draw · ${b.piles.discard} discard`
          }}</span
          ><label class="request-control"
            >Signal<select
              :value="own.request"
              :disabled="game.busy || !game.view?.controlling"
              aria-label="Team signal"
              @change="
                game.command({
                  kind: 'request',
                  text: ($event.target as HTMLSelectElement).value as
                    | ''
                    | 'Protect me'
                    | 'Wait'
                    | 'Ready',
                })
              "
            >
              <option value="">—</option>
              <option>Protect me</option>
              <option>Wait</option>
              <option>Ready</option>
            </select></label
          >
        </div>
        <div v-if="own.recovery" class="recovery-hand">
          <button
            :class="{ selected: selected === 'rally' }"
            @click="
              selected = 'rally';
              target = game.view!.memberId!;
            "
          >
            Rally <small>3 energy · restore 12 health</small></button
          ><button
            :class="{ selected: selected === 'shelter' }"
            @click="
              selected = 'shelter';
              target = '';
            "
          >
            Shelter <small>1 energy · give 4 Block</small>
          </button>
        </div>
        <div v-else class="hand">
          <CardTile
            v-for="card in b.hand"
            :key="card.uid"
            :card="card.definition"
            :instance="card"
            :cost="card.cost"
            :unaffordable="card.cost > own.energy"
            compact
            :selected="selected === card.uid"
            :disabled="
              b.phase !== 'player' ||
              own.ended ||
              game.busy ||
              !game.connected ||
              !game.view?.controlling
            "
            @select="chooseCard(card.uid)"
          />
        </div>
        <div class="action-details">
          <button
            v-if="selected"
            class="selected-description"
            aria-label="Explain card keywords"
            @click="keywordsOpen = true"
          >
            <strong>{{
              current?.definition.name ??
              (selected === "rally" ? "Rally" : "Shelter")
            }}</strong>
            <CardText
              :text="
                selected === 'rally'
                  ? 'Restore 12 health. Normal cards return next turn.'
                  : selected === 'shelter'
                    ? 'Give a standing teammate 4 Block. Once this turn.'
                    : cardText
              "
            /><span class="keyword-link">Details</span>
          </button>
          <p v-if="!selected" class="turn-hint">{{ turnHint }}</p>
          <label
            v-if="current?.definition.target === 'enemy'"
            class="enemy-target"
            >Enemy<select v-model="target" aria-label="Enemy">
              <option
                v-for="enemy in b.enemies.filter((e) => e.hp > 0)"
                :key="enemy.id"
                :value="enemy.id"
              >
                {{ enemy.name }} · {{ enemy.hp }} health{{
                  enemy.block ? ` · ${enemy.block} Block` : ""
                }}
              </option>
            </select></label
          >
          <div v-if="needsHero" class="target-controls">
            <label v-if="current?.definition.crossTeam"
              >Team<select
                v-model="targetCrew"
                aria-label="Team"
                @change="target = ''"
              >
                <option
                  v-for="crew in game.view?.crews.filter((c) =>
                    b.actors.some((a) => a.crewId === c.id),
                  )"
                  :key="crew.id"
                  :value="crew.id"
                >
                  {{ crew.name }}
                </option>
              </select></label
            ><label
              >Player<select v-model="target" aria-label="Player">
                <option value="" disabled>Choose player</option>
                <option
                  v-for="actor in selectedPlayers"
                  :key="actor.memberId"
                  :value="actor.memberId"
                >
                  {{ actor.name }} · {{ actor.hp }}/{{ actor.maxHp }}
                </option>
              </select></label
            >
          </div>
          <label v-if="needsChoice"
            >Choose card<select v-model="choice" aria-label="Choose card">
              <option value="" disabled>Choose card</option>
              <option v-for="card in choices" :key="card.uid" :value="card.uid">
                {{ card.definition.name }}{{ card.upgraded ? " +" : "" }}
              </option>
            </select></label
          >
          <p v-if="selected && previewText && previewAddsInfo" class="preview">
            <CardText :text="previewText" />
          </p>
          <p
            v-if="
              selected &&
              ((needsHero && !target) ||
                (needsChoice && !choice) ||
                (current && current.cost > own.energy))
            "
            class="turn-hint"
          >
            {{ turnHint }}
          </p>
        </div>
        <footer class="play-footer">
          <button
            class="primary"
            :disabled="
              !selected ||
              b.phase !== 'player' ||
              own.ended ||
              (current && current.cost > own.energy) ||
              (selected === 'rally' && own.energy < 3) ||
              (selected === 'shelter' &&
                (own.energy < 1 || !!own.powers['shelter-used'])) ||
              game.busy ||
              !game.connected ||
              !game.view?.controlling ||
              (needsHero && !target) ||
              (needsChoice && !choice)
            "
            @click="play"
          >
            Play{{ current ? ` · ${current.cost} energy` : "" }}</button
          ><button
            :class="{ selected: own.ended }"
            :disabled="
              b.phase !== 'player' || game.busy || !game.view?.controlling
            "
            @click="game.command({ kind: 'end-turn', ended: !own.ended })"
          >
            {{ own.ended ? "Change" : "End turn" }}
          </button>
        </footer>
        <p v-if="b.phase === 'enemy'" class="phase-label">Enemy turn</p>
        <p v-else-if="own.ended" class="phase-label">Waiting for the team</p>
      </div>
      <p v-else class="spectator-note">
        You join the next encounter.
      </p></template
    >
    <CombatHistory v-if="logOpen" :combat="b" @close="logOpen = false" />
    <KeywordGuide
      v-if="keywordsOpen"
      :card-name="
        current?.definition.name ?? (selected === 'rally' ? 'Rally' : 'Shelter')
      "
      :description="
        selected === 'rally'
          ? 'Restore 12 health. Normal cards return next turn.'
          : selected === 'shelter'
            ? 'Give a standing teammate 4 Block. Once this turn.'
            : cardText
      "
      :text="current ? `${cardText} energy` : undefined"
      @close="keywordsOpen = false"
    />
  </section>
</template>
