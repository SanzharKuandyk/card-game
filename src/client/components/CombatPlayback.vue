<script setup lang="ts">
import { computed } from "vue";
import type { CardDefinition } from "../../shared/model.ts";
import type {
  CombatBeat,
  PlaybackStage,
  PlaybackItem,
} from "../combat-feedback.ts";
import { effectText, playbackItem, beforeImpact } from "../combat-feedback.ts";
import PlaybackQueue from "./PlaybackQueue.vue";
import CardArt from "./CardArt.vue";
import CardText from "./CardText.vue";
const props = defineProps<{
  beat: CombatBeat | null;
  stage: PlaybackStage;
  last: CombatBeat | null;
  cards: CardDefinition[];
  skipped: number;
  upcoming: PlaybackItem[];
  recent: PlaybackItem[];
}>();
defineEmits<{ history: [] }>();
const shown = computed(() => props.beat ?? props.last);
const card = computed(() =>
  props.cards.find((card) => card.id === props.beat?.card?.id),
);
const name = (id: string) =>
  shown.value?.after.actors.find((actor) => actor.memberId === id)?.name ??
  shown.value?.after.enemies.find((enemy) => enemy.id === id)?.name ??
  "Team";
const outcomes = computed(
  () => shown.value?.events.filter((event) => event.kind !== "play") ?? [],
);
const targets = computed(() =>
  [...new Set(outcomes.value.map((event) => name(event.targetId)))].join(", "),
);
</script>
<template>
  <div class="action-slot" :class="{ 'has-play-queue': !!shown }">
    <PlaybackQueue
      v-if="shown"
      compact
      :upcoming="upcoming"
      :recent="recent"
      :current="playbackItem(shown, !beat || !beforeImpact(stage))"
    />
    <div
      v-if="beat?.card"
      :key="beat.key"
      class="played-card-stage"
      :class="{
        'card-impact': stage === 'impact' || stage === 'exit',
        'card-moving': stage === 'windup',
        'card-exit': stage === 'exit',
      }"
      aria-hidden="true"
    >
      <article class="played-card" :class="card?.character">
        <span class="played-by">{{ name(beat.sourceId) }} played</span>
        <span class="played-cost">{{ beat.card.cost }} energy</span>
        <CardArt v-if="card" :card="card" />
        <strong>{{ beat.title }}{{ beat.card.upgraded ? " +" : "" }}</strong>
        <CardText :text="beat.card.text" />
        <small v-if="targets" class="played-target">→ {{ targets }}</small>
      </article>
    </div>
    <p v-if="!shown" class="scene-idle">No plays yet.</p>
    <section
      v-if="shown"
      class="combat-outcome"
      :class="{
        'outcome-pending': beat && stage !== 'impact' && stage !== 'exit',
      }"
      aria-label="Last play"
      aria-live="polite"
      aria-atomic="true"
    >
      <p class="outcome-heading">
        <strong>{{ name(shown.sourceId) }} · {{ shown.title }}</strong>
        <span v-if="beat && stage !== 'impact' && stage !== 'exit'">{{
          beat.card ? "Playing" : "Incoming"
        }}</span>
        <span v-else-if="shown.after.result">{{
          shown.after.result === "victory"
            ? "Victory"
            : shown.after.result === "defeat"
              ? "Defeat"
              : "Fight ended"
        }}</span>
      </p>
      <p
        v-if="beat && stage !== 'impact' && stage !== 'exit'"
        class="action-destination"
      >
        → {{ targets }}
      </p>
      <template v-if="!beat || stage === 'impact' || stage === 'exit'">
        <ul v-if="outcomes.length">
          <li
            v-for="event in outcomes.slice(0, 2)"
            :key="event.id"
            :class="`outcome-${event.kind}`"
          >
            <span>{{ name(event.targetId) }}</span
            ><CardText :text="effectText(event)" />
          </li>
        </ul>
        <p v-else><CardText :text="shown.card?.text ?? 'Effect applied.'" /></p>
        <button
          v-if="outcomes.length > 2"
          class="quiet more-effects"
          @click="$emit('history')"
        >
          +{{ outcomes.length - 2 }} effects · History
        </button>
        <small v-if="skipped">Recent plays grouped. More in History.</small>
      </template>
    </section>
  </div>
</template>
