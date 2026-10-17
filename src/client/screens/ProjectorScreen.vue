<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import type { CombatView } from "../../shared/model.ts";
import { useRoute } from "vue-router";
import ProjectorQuiz from "../components/ProjectorQuiz.vue";
import SharedMap from "../components/SharedMap.vue";
import QRCode from "qrcode";
import { useGame } from "../stores/game.ts";
import TurnClock from "../components/TurnClock.vue";
import TeamBoard from "../components/TeamBoard.vue";
import EnemyArt from "../components/EnemyArt.vue";
import { beatTiming } from "../combat-feedback.ts";
const game = useGame(),
  route = useRoute();
const qr = ref("");
const search = ref("");
const mode = ref<"boards" | "map">(
  route.query.mode === "map" ? "map" : "boards",
);
const v = computed(() => game.view);
const bossImpact = ref(0);
const impactKey = ref(0);
let impactTimer: ReturnType<typeof setTimeout> | undefined;
let contactTimer: ReturnType<typeof setTimeout> | undefined;
const bossScene = shallowRef<CombatView | null>(null);
const bossPreparing = ref(false);
let pendingScene: CombatView | null = null;
let pendingDamage = 0;
let resetImpact = false;
watch(
  () => game.connected,
  (online) => {
    if (!online) {
      resetImpact = true;
      bossImpact.value = 0;
      clearTimeout(impactTimer);
      clearTimeout(contactTimer);
      contactTimer = undefined;
      bossPreparing.value = false;
      pendingDamage = 0;
    }
  },
);
watch(
  () => v.value?.combat,
  (fight, before) => {
    if (
      resetImpact ||
      document.hidden ||
      !v.value?.boss ||
      !fight ||
      fight.id !== before?.id
    ) {
      bossImpact.value = 0;
      bossScene.value = fight ?? null;
      pendingScene = null;
      pendingDamage = 0;
      bossPreparing.value = false;
      clearTimeout(contactTimer);
      contactTimer = undefined;
      resetImpact = false;
      return;
    }
    const lost = before.enemies.reduce(
      (sum, enemy) =>
        sum +
        Math.max(
          0,
          enemy.hp -
            (fight.enemies.find((entry) => entry.id === enemy.id)?.hp ??
              enemy.hp),
        ),
      0,
    );
    const cursor = Math.max(0, ...before.log.map((event) => event.id));
    const events = fight.log.filter((event) => event.id > cursor);
    if (!lost && !events.length && !contactTimer) {
      bossScene.value = fight;
      return;
    }
    pendingScene = fight;
    pendingDamage += lost;
    if (contactTimer) return;
    bossPreparing.value = true;
    // One bounded class-wide batch; individual teams retain ordered actions.
    // Do not restart this timer on every play or a busy class could delay forever.
    contactTimer = setTimeout(
      () => {
        bossScene.value = pendingScene;
        bossImpact.value += pendingDamage;
        pendingDamage = 0;
        bossPreparing.value = false;
        contactTimer = undefined;
        impactKey.value++;
        clearTimeout(impactTimer);
        impactTimer = setTimeout(() => {
          bossImpact.value = 0;
        }, 1300);
      },
      (() => {
        const timing = beatTiming(
          0,
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          !events.some((event) => event.kind === "play"),
        );
        return (
          (events.some((event) => event.kind === "play") ? timing.card : 0) +
          timing.windup
        );
      })(),
    );
  },
);
onUnmounted(() => {
  clearTimeout(impactTimer);
  clearTimeout(contactTimer);
});
const memberNames = computed(() =>
  Object.fromEntries(
    v.value?.crews.flatMap((c) =>
      c.members.map((m) => [m.id, `${c.name} · ${m.name}`]),
    ) ?? [],
  ),
);
const credential = computed(() => String(route.query.view ?? ""));
watch(
  () => v.value?.code,
  async (code) => {
    if (code)
      qr.value = await QRCode.toDataURL(`${location.origin}/join/${code}`, {
        width: 140,
        margin: 1,
      });
  },
);
onMounted(() =>
  game.connect(String(route.params.id), "projector", credential.value),
);
onUnmounted(() => game.close());
</script>
<template>
  <main class="live-projector">
    <header class="live-heading">
      <h1>{{ v?.status === "finished" ? "Results" : "Live" }}</h1>
      <strong>{{ v?.code }}</strong>
      <span>{{
        v?.status === "paused" ? "Paused" : game.connected ? "" : "Reconnecting"
      }}</span>
      <span v-if="v">{{ v.crews.length }} teams</span>
      <button @click="mode = mode === 'boards' ? 'map' : 'boards'">
        {{ mode === "boards" ? "Map" : "Battles" }}
      </button>
      <label class="projector-search"
        ><span>Find team</span
        ><input v-model="search" type="search" placeholder="Team or player"
      /></label>
      <button v-if="search" class="projector-reset" @click="search = ''">
        Show all
      </button>
      <img v-if="qr" :src="qr" alt="Join QR" />
    </header>
    <p v-if="game.error" class="error" role="alert">{{ game.error }}</p>
    <ProjectorQuiz v-if="v?.quiz" />
    <SharedMap v-show="!v?.quiz && mode === 'map'" projector :search="search" />
    <div
      v-show="!v?.quiz && mode === 'boards'"
      v-if="v?.boss"
      class="live-boss"
      aria-label="Shared boss"
    >
      <EnemyArt
        v-if="bossScene"
        :kind="bossScene.enemies[0]?.pattern ?? 'boss'"
        :portrait="bossScene.enemies[0]?.portrait"
      />
      <div class="shared-boss-health">
        <strong>{{ bossScene?.enemies[0]?.name ?? "Boss" }}</strong
        ><span v-if="bossScene" class="meter health"
          ><span
            :style="{
              width: `${(bossScene.enemies[0]!.hp / bossScene.enemies[0]!.maxHp) * 100}%`,
            }" /></span
        ><small v-if="bossScene">{{
          bossScene.intents.map((i) => i.label).join(" · ")
        }}</small>
      </div>
      <span v-if="bossScene"
        >{{ bossScene.enemies[0]?.hp }}/{{ bossScene.enemies[0]?.maxHp }} · Turn
        {{ bossScene.turn }}</span
      >
      <TurnClock
        :remaining-ms="bossScene?.remainingMs ?? v.boss.remainingMs"
        :paused="v.status === 'paused'"
        :offline="!game.connected"
      />
      <span v-if="v.boss.firstCrewId"
        >First:
        {{ v.crews.find((c) => c.id === v?.boss?.firstCrewId)?.name }}</span
      >
      <span class="boss-impact-slot"
        ><span v-if="bossPreparing" class="boss-preparing">{{
          v.combat?.phase === "enemy" ? "Enemy attack" : "Cards in play"
        }}</span>
        <span v-else-if="bossImpact" :key="impactKey" class="boss-impact"
          >−{{ bossImpact }} HP · Teams combined</span
        ></span
      >
    </div>
    <div v-if="v?.unassigned.length" class="live-unassigned">
      Choosing teams: {{ v.unassigned.map((m) => m.name).join(", ") }}
    </div>
    <section
      v-show="!v?.quiz && mode === 'boards'"
      class="live-team-grid"
      aria-label="Team boards"
    >
      <TeamBoard
        v-for="crew in v?.crews"
        v-show="
          !search.trim() ||
          [crew.name, ...crew.members.map((m) => m.name)].some((name) =>
            name.toLowerCase().includes(search.trim().toLowerCase()),
          )
        "
        :key="crew.id"
        :crew="crew"
        :cards="v?.cards ?? []"
        :connected="game.connected"
        :names="memberNames"
        :boss="!!v?.boss"
        :shared-combat="v?.boss ? bossScene : null"
        :lobby="v?.status === 'lobby'"
        :paused="v?.status === 'paused'"
      />
      <div v-if="v && !v.crews.length" class="live-waiting">
        <img :src="qr" alt="Join QR" /><strong>{{ v.code }}</strong>
        <p>Waiting for teams</p>
      </div>
    </section>
    <footer v-if="v?.bossHistory.length" class="live-results">
      <span v-for="boss in v.bossHistory" :key="boss.gate"
        ><strong
          >{{ boss.gate === 8 ? "Middle boss" : "Final boss" }} ·
          {{ boss.result }}</strong
        ><span v-for="award in boss.awards" :key="award.name">
          · {{ award.name }}:
          {{
            award.crewIds
              .map((id) => v?.crews.find((c) => c.id === id)?.name)
              .join(", ")
          }}</span
        ></span
      >
    </footer>
  </main>
</template>
