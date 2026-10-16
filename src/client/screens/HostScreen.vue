<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import QRCode from "qrcode";
import { useGame } from "../stores/game.ts";
const game = useGame(),
  route = useRoute();
const qr = ref(""),
  projectorUrl = ref(""),
  testName = ref("Teacher"),
  filter = ref("");
const creating = ref(false);
const v = computed(() => game.view);
const invite = computed(() =>
  v.value ? `${location.origin}/join/${v.value.code}` : "",
);
watch(invite, async (url) => {
  if (url)
    qr.value = await QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: "#152b29", light: "#ffffff" },
    });
});
const crews = computed(
  () =>
    v.value?.crews.filter((c) =>
      c.name.toLowerCase().includes(filter.value.toLowerCase()),
    ) ?? [],
);
onMounted(async () => {
  game.connect(String(route.params.id), "host");
  const r = await fetch(`/api/session/${route.params.id}/projector`, {
    method: "POST",
  });
  if (r.ok)
    projectorUrl.value = `${location.origin}/projector/${route.params.id}?view=${(await r.json()).token}`;
});
onUnmounted(() => game.close());
async function testPlayer() {
  const playerWindow = window.open("about:blank", "_blank");
  if (playerWindow) playerWindow.opener = null;
  const r = await fetch("/api/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: v.value!.code, name: testName.value }),
  });
  if (r.ok) {
    const url = `/play/${v.value!.id}`;
    if (playerWindow) playerWindow.location.href = url;
    else location.assign(url);
  } else playerWindow?.close();
}
async function copyInvite() {
  await navigator.clipboard.writeText(invite.value);
}
async function newGame() {
  if (creating.value) return;
  creating.value = true;
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    location.assign(`/host/${result.id}`);
  } catch (e) {
    game.error = e instanceof Error ? e.message : "Cannot start";
    creating.value = false;
  }
}
</script>
<template>
  <main class="host-shell">
    <header class="host-heading">
      <h1>Host</h1>
      <span>{{ v?.code }}</span
      ><span>{{ v?.status }}</span
      ><span>{{ game.connected ? "Connected" : "Reconnecting" }}</span>
    </header>
    <p v-if="game.error" class="error" role="alert">{{ game.error }}</p>
    <div v-if="v" class="host-layout">
      <aside class="invite-panel">
        <img
          v-if="qr"
          :src="qr"
          alt="Join QR code"
          width="220"
          height="220"
        /><strong>{{ v.code }}</strong
        ><a :href="invite" target="_blank">Join</a
        ><button @click="copyInvite">Copy invite</button
        ><a
          v-if="projectorUrl"
          :href="projectorUrl"
          target="_blank"
          class="button-link"
          >Projector</a
        ><a
          v-if="projectorUrl"
          :href="`${projectorUrl}&mode=map`"
          target="_blank"
          class="button-link"
          >Map</a
        ><label>Player name<input v-model="testName" maxlength="24" /></label
        ><button @click="testPlayer">Join as player</button>
      </aside>
      <section>
        <div class="host-controls">
          <button :disabled="creating || game.busy" @click="newGame">
            New game
          </button>
          <button
            v-if="v.status === 'lobby'"
            class="primary"
            :disabled="!v.crews.length || game.busy"
            @click="game.command({ kind: 'host', action: 'start' })"
          >
            Start</button
          ><button
            v-else-if="v.status !== 'finished'"
            class="primary"
            @click="
              game.command({
                kind: 'host',
                action: v.status === 'paused' ? 'resume' : 'pause',
              })
            "
          >
            {{ v.status === "paused" ? "Resume" : "Pause" }}</button
          ><button
            :disabled="v.status === 'finished'"
            @click="
              game.command({
                kind: 'host',
                action: 'extend',
                quizId: v.quiz?.id,
                phaseRevision: v.quiz?.phaseRevision,
              })
            "
          >
            +30 seconds</button
          ><button
            :disabled="v.status !== 'running' || !!v.boss"
            @click="game.command({ kind: 'host', action: 'boss' })"
          >
            Call boss</button
          ><button
            :disabled="v.status === 'finished'"
            @click="
              game.command({
                kind: 'host',
                action: 'skip',
                scope: 'boss',
                quizId: v.quiz?.id,
                phaseRevision: v.quiz?.phaseRevision,
              })
            "
          >
            Skip</button
          ><button
            :disabled="v.status === 'finished'"
            @click="game.command({ kind: 'host', action: 'end' })"
          >
            End
          </button>
        </div>
        <button
          v-if="v.quiz"
          @click="
            game.command({
              kind: 'host',
              action: 'skip',
              scope: 'quiz',
              quizId: v.quiz.id,
              phaseRevision: v.quiz.phaseRevision,
            })
          "
        >
          Skip questions
        </button>
        <p class="host-notice" aria-live="polite">{{ v.notice }}</p>
        <div class="host-stats">
          <strong
            >{{
              v?.crews.flatMap((c) => c.members).filter((m) => m.online).length
            }}
            connected</strong
          ><span>{{ v.crews.length }} teams</span
          ><span>{{ v.unassigned.length }} unassigned</span
          ><span>{{ Math.floor(v.activeMs / 60000) }} minutes</span>
        </div>
        <p v-if="v.unassigned.length">
          Unassigned: {{ v.unassigned.map((m) => m.name).join(", ") }}
        </p>
        <label class="team-search"
          >Teams<input v-model="filter" type="search" placeholder="Find team"
        /></label>
        <div class="host-crew-grid">
          <article
            v-for="crew in crews"
            :key="crew.id"
            class="crew-card"
            :style="{ '--team-colour': crew.colour }"
          >
            <header>
              <strong>{{ crew.symbol }} {{ crew.name }}</strong
              ><span>{{ crew.row }}/15 · {{ crew.phase }}</span>
            </header>
            <div v-for="m in crew.members" :key="m.id" class="host-member">
              <span :class="{ muted: !m.online }"
                >{{ m.name }}{{ m.online ? "" : " · offline" }}</span
              ><span>{{ m.hp }}/40</span
              ><button
                class="quiet"
                :aria-label="`Remove ${m.name}`"
                @click="
                  game.command({
                    kind: 'host',
                    action: 'remove',
                    memberId: m.id,
                  })
                "
              >
                ×
              </button>
            </div>
          </article>
        </div>
        <section
          v-for="boss in v.bossHistory"
          :key="boss.gate"
          class="result-block"
        >
          <h2>Boss {{ boss.gate === 8 ? "1" : "2" }} · {{ boss.result }}</h2>
          <p v-for="award in boss.awards" :key="award.name">
            {{ award.name }}:
            {{
              award.crewIds
                .map((id) => v?.crews.find((c) => c.id === id)?.name)
                .join(", ")
            }}
          </p>
        </section>
      </section>
    </div>
    <a v-else href="/#host">Host</a>
  </main>
</template>
