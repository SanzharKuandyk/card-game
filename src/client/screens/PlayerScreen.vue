<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { useGame } from "../stores/game.ts";
import type { Character } from "../../shared/model.ts";
import QuizPanel from "../components/QuizPanel.vue";
import RelicsDialog from "../components/RelicsDialog.vue";
import RelicOfferPanel from "../components/RelicOfferPanel.vue";
import BattlePanel from "../components/BattlePanel.vue";
import MapPanel from "../components/MapPanel.vue";
import RewardPanel from "../components/RewardPanel.vue";
import DeckDialog from "../components/DeckDialog.vue";
import CombatArt from "../components/CombatArt.vue";
import HelpDialog from "../components/HelpDialog.vue";
import { combinations } from "../onboarding/hints.ts";
import { useCombatFeedback } from "../use-combat-feedback.ts";
const game = useGame(),
  route = useRoute();
const router = useRouter();
const showRelics = ref(false);
watch(
  () => game.view?.shop?.id,
  (id) => {
    if (
      id &&
      !game.view?.quiz &&
      !game.view?.rewards.length &&
      !game.view?.relicReward
    )
      void router.replace(
        `/play/${route.params.id}/shop/${encodeURIComponent(id)}`,
      );
  },
);
watch(
  () => [
    game.view?.rewards.length,
    game.view?.relicReward?.id,
    game.view?.quiz?.id,
  ],
  () => {
    const id = game.view?.shop?.id;
    if (
      id &&
      !game.view?.quiz &&
      !game.view?.rewards.length &&
      !game.view?.relicReward
    )
      void router.replace(
        `/play/${route.params.id}/shop/${encodeURIComponent(id)}`,
      );
  },
);
const character = ref<Character>("guardian");
const crewId = ref("");
const teamName = ref("");
const showDeck = ref(false);
const deckAction = ref<"upgrade" | "remove" | null>(null);
const eventChoice = ref<number | null>(null);
const showHelp = ref(false);
const v = computed(() => game.view);
const {
  active: beat,
  last,
  stage,
  scene,
  held,
  skipped,
  upcoming,
  recent,
} = useCombatFeedback(
  () => v.value,
  () => game.connected,
);
const combatActive = computed(
  () =>
    (!!held.value || (!!v.value?.combat && !v.value.rewards.length)) &&
    !v.value?.quiz,
);
const crew = computed(() =>
  v.value?.crews.find((c) => c.id === v.value?.crewId),
);
onMounted(() => game.connect(String(route.params.id), "player"));
onBeforeRouteLeave((to) => {
  if (!to.path.startsWith(`/play/${route.params.id}`)) game.close();
});
async function joinTeam() {
  await game.command({
    kind: "team",
    character: character.value,
    ...(crewId.value
      ? { crewId: crewId.value }
      : { name: teamName.value || undefined }),
  });
}
async function selectCard(uid: string) {
  if (eventChoice.value !== null) {
    await game.command({
      kind: "event",
      choice: eventChoice.value,
      cardUid: uid,
    });
    eventChoice.value = null;
  } else if (deckAction.value)
    await game.command({
      kind: "rest",
      action: deckAction.value,
      cardUid: uid,
    });
  showDeck.value = false;
  deckAction.value = null;
}
function eventSelect(index: number) {
  const effect = v.value!.event!.choices[index]!.effect;
  if (effect === "upgrade" || effect === "remove") {
    eventChoice.value = index;
    deckAction.value = effect;
    showDeck.value = true;
  } else void game.command({ kind: "event", choice: index });
}
</script>
<template>
  <main
    class="player-shell"
    :class="{
      'combat-shell':
        (!!held || (!!v?.combat && !v.rewards.length)) && !v?.quiz,
    }"
  >
    <fieldset class="player-controls" aria-label="Player screen">
      <header v-show="!combatActive && !v?.quiz" class="app-header">
        <strong :style="{ color: crew?.colour }">{{
          crew?.name ?? "Player"
        }}</strong
        ><span class="connection" :class="{ offline: !game.connected }">{{
          game.connected ? "Connected" : "Reconnecting"
        }}</span
        ><button class="quiet" @click="showHelp = true">Help</button
        ><button
          v-if="v?.hero"
          class="quiet"
          @click="
            showDeck = true;
            deckAction = null;
            eventChoice = null;
          "
        >
          Cards · {{ v.hero.deck.length }}
        </button>
      </header>
      <p v-if="!game.connected && v" class="connection-banner" role="status">
        {{
          game.needsJoin
            ? "Sign in again to return to this game."
            : "Reconnecting… Your hand and saved plays are kept."
        }}<a v-if="game.needsJoin" :href="`/join/${v.code}`">Join</a
        ><button v-else @click="game.recover()">Reconnect</button>
      </p>
      <p v-if="game.error" class="error" role="alert">{{ game.error }}</p>
      <p v-if="v?.status === 'paused'" class="pause-banner">Paused</p>
      <p v-if="v?.progress?.routeNote" class="pause-banner">
        {{ v.progress.routeNote }}
      </p>
      <p v-if="v && !v.controlling" class="pause-banner">
        This tab is read-only.
        <button @click="game.command({ kind: 'takeover' })">
          Take control
        </button>
      </p>
      <section v-if="!v" class="loading">
        {{ game.error || "Connecting…" }}<a href="/">Join</a>
      </section>
      <section v-else-if="!v.crewId" class="team-selection">
        <h1>Team</h1>
        <label
          >Choose team<select v-model="crewId">
            <option value="">New team</option>
            <option
              v-for="c in v.crews"
              :key="c.id"
              :value="c.id"
              :disabled="c.members.length >= 4"
            >
              {{ c.name }} · {{ c.members.length }}/4
            </option>
          </select></label
        ><label v-if="!crewId"
          >Team name<input
            v-model="teamName"
            maxlength="24"
            placeholder="Team name"
        /></label>
        <h2>Character</h2>
        <div class="character-options">
          <button
            v-for="(text, id) in {
              guardian: 'Block · health for energy',
              rogue: 'Quick attacks · discard',
              alchemist: 'Poison · recycle',
              channeler: 'Charge · help allies',
            }"
            :key="id"
            :class="[id, { selected: character === id }]"
            @click="character = id as Character"
          >
            <CombatArt :kind="id" />
            <strong>{{ id[0]!.toUpperCase() + id.slice(1) }}</strong
            ><small>{{ text }}</small>
          </button>
        </div>
        <button
          class="primary"
          :disabled="game.busy || !v.controlling"
          @click="joinTeam"
        >
          Join team
        </button>
      </section>
      <QuizPanel v-else-if="v.quiz" />
      <BattlePanel
        v-else-if="held"
        :combat="held"
        :scene="scene"
        :beat="beat"
        :last="last"
        :stage="stage"
        :skipped="skipped"
        :upcoming="upcoming"
        :recent="recent"
        locked
        :help-open="showHelp"
        @help="showHelp = true"
        @cards="
          showDeck = true;
          deckAction = null;
          eventChoice = null;
        "
      />
      <section v-else-if="v.status === 'finished'" class="results">
        <h1>{{ v.finishedReason ?? "Finished" }}</h1>
        <RewardPanel v-if="v.rewards.length" />
        <div
          v-for="boss in v.bossHistory"
          :key="boss.gate"
          class="result-block"
        >
          <h2>
            {{ boss.gate === 8 ? "Middle boss" : "Final boss" }} ·
            {{ boss.result }}
          </h2>
          <p v-if="boss.firstCrewId">
            First: {{ v?.crews.find((c) => c.id === boss.firstCrewId)?.name }}
          </p>
          <p v-for="award in boss.awards" :key="award.name">
            <strong>{{ award.name }}</strong>
            {{
              award.crewIds
                .map((id) => v?.crews.find((c) => c.id === id)?.name)
                .join(", ")
            }}
          </p>
        </div>
      </section>
      <section v-else-if="v.status === 'lobby'" class="lobby">
        <h1>{{ crew?.name }}</h1>
        <p>{{ crew?.members.map((m) => m.name).join(" · ") }}</p>
        <p>Waiting to start</p>
        <div class="lobby-basics">
          <p>Cards spend energy.</p>
          <p>Block protects your health until your next turn.</p>
          <p>The enemy acts after everyone ends their turn.</p>
        </div>
        <details>
          <summary>Your first combination</summary>
          <p>
            {{ combinations[v.hero!.character].text }}
          </p>
        </details>
      </section>
      <RewardPanel v-else-if="v.rewards.length" />
      <RelicOfferPanel v-else-if="v.relicReward" />
      <section v-else-if="v.boss && !v.combat" class="boss-countdown">
        <h1>Boss</h1>
        <p v-if="v.boss.firstCrewId">
          {{ v?.crews.find((c) => c.id === v?.boss?.firstCrewId)?.name }}
          arrived first
        </p>
        <strong class="countdown">{{
          Math.ceil(v.boss.remainingMs / 1000)
        }}</strong>
        <p>Your deck · your team · everyone together</p>
      </section>
      <BattlePanel
        v-else-if="v.combat"
        :help-open="showHelp"
        :combat="v.combat"
        :scene="scene"
        :beat="beat"
        :last="last?.after.id === v.combat.id ? last : null"
        :stage="stage"
        :skipped="skipped"
        :upcoming="upcoming"
        :recent="recent"
        @help="showHelp = true"
        @cards="
          showDeck = true;
          deckAction = null;
          eventChoice = null;
        "
      />
      <section
        v-else-if="v.progress?.phase === 'defeat'"
        class="decision-panel"
      >
        <h1>Defeat</h1>
        <p>Retry with full health. Keep your deck.</p>
        <button
          class="primary"
          :disabled="game.busy"
          @click="game.command({ kind: 'retry' })"
        >
          Retry
        </button>
      </section>
      <section v-else-if="v.progress?.phase === 'rest'" class="decision-panel">
        <h1>Rest</h1>
        <p>{{ v.hero?.hp }}/40 health</p>
        <div v-if="!v.progress.choices[v.memberId!]" class="room-choices">
          <button @click="game.command({ kind: 'rest', action: 'heal' })">
            <strong>Heal</strong><small>Restore 12 health</small></button
          ><button
            @click="
              deckAction = 'upgrade';
              showDeck = true;
            "
          >
            <strong>Upgrade</strong><small>Improve one card</small></button
          ><button
            @click="
              deckAction = 'remove';
              showDeck = true;
            "
          >
            <strong>Remove</strong><small>Keep at least 6 cards</small>
          </button>
        </div>
        <p v-else>Waiting for teammates</p>
      </section>
      <section v-else-if="v.progress?.phase === 'event'" class="decision-panel">
        <h1>{{ v.event?.title }}</h1>
        <p>{{ v.event?.text }}</p>
        <div v-if="!v.progress.choices[v.memberId!]" class="room-choices">
          <button
            v-for="(choice, i) in v.event?.choices"
            :key="choice.label"
            @click="eventSelect(i)"
          >
            <strong>{{ choice.label }}</strong
            ><small>{{ choice.text }}</small>
          </button>
        </div>
        <p v-else>Waiting for teammates</p>
      </section>
      <section
        v-else-if="v.progress?.phase === 'reward'"
        class="decision-panel"
      >
        <h1>Waiting</h1>
        <p>
          {{
            crew?.members
              .filter((m) => !v?.progress?.choices[m.id])
              .map((m) => m.name)
              .join(", ")
          }}
          choosing cards
        </p>
      </section>
      <MapPanel v-else />
      <button
        v-if="v?.hero && !combatActive && v.relics?.length"
        class="quiet"
        @click="showRelics = true"
      >
        Relics · {{ v.hero.relics?.length ?? 0 }} · {{ v.hero.gold }} gold
      </button>
      <DeckDialog
        v-if="showDeck && v?.hero"
        :deck="v.hero.deck"
        :cards="v.cards"
        :selectable="!!deckAction"
        :title="
          deckAction
            ? deckAction === 'upgrade'
              ? 'Choose an upgrade'
              : 'Choose a card to remove'
            : 'Cards'
        "
        @close="
          showDeck = false;
          deckAction = null;
          eventChoice = null;
        "
        @select="selectCard"
      />
      <RelicsDialog v-if="showRelics" @close="showRelics = false" />
      <HelpDialog v-if="showHelp && v" @close="showHelp = false" />
    </fieldset>
  </main>
</template>
