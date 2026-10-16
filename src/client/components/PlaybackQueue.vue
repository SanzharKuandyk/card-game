<script setup lang="ts">
import { ref } from "vue";
import type { PlaybackItem } from "../combat-feedback.ts";
import EffectDetails from "./EffectDetails.vue";
const props = defineProps<{
  upcoming: PlaybackItem[];
  recent: PlaybackItem[];
  current?: PlaybackItem | null;
  compact?: boolean;
}>();
const inspection = ref<{ title: string; lines: string[] } | null>(null);
function inspect() {
  inspection.value = {
    title: "Plays",
    lines: [
      ...(props.current
        ? [
            `Now · ${props.current.source} · ${props.current.title}`,
            ...props.current.details,
          ]
        : []),
      ...props.upcoming.flatMap((item, i) => [
        `Next ${i + 1} · ${item.source} · ${item.title}`,
        ...item.details,
      ]),
      ...props.recent.flatMap((item) => [
        `Recent · ${item.source} · ${item.title}`,
        ...item.details,
      ]),
    ],
  };
}
</script>
<template>
  <div
    class="playback-queue"
    :class="{ 'queue-compact': compact }"
    aria-label="Playback queue"
  >
    <button
      v-if="compact"
      class="queue-summary"
      aria-label="Inspect play queue"
      @click="inspect"
    >
      <strong>{{
        upcoming.length ? `Next · ${upcoming.length}` : "Plays"
      }}</strong>
      <span>{{
        upcoming[0]
          ? `${upcoming[0].source} · ${upcoming[0].title}`
          : recent[0]
            ? `Last · ${recent[0].title}`
            : "View details"
      }}</span>
    </button>
    <template v-else>
      <span class="queue-label">{{ upcoming.length ? "Next" : "Recent" }}</span>
      <TransitionGroup name="queue-card" tag="div" class="queue-cards">
        <button
          v-for="item in upcoming.length
            ? upcoming.slice(0, 3)
            : recent.slice(0, 3)"
          :key="item.key"
          class="queue-card"
          :aria-label="`${upcoming.length ? 'Queued' : 'Recent'}: ${item.source} · ${item.title}`"
          @click="
            inspection = {
              title: `${item.source} · ${item.title}`,
              lines: item.details,
            }
          "
        >
          <small>{{ item.source }}</small
          ><strong>{{ item.title }}</strong>
        </button>
      </TransitionGroup>
      <button
        class="queue-count"
        aria-label="Inspect play queue"
        @click="inspect"
      >
        {{ upcoming.length > 3 ? `+${upcoming.length - 3}` : "⋯" }}
      </button>
    </template>
    <EffectDetails
      v-if="inspection"
      :title="inspection.title"
      :lines="inspection.lines"
      @close="inspection = null"
    />
  </div>
</template>
