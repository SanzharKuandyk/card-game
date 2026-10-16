<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  remainingMs: number;
  paused?: boolean;
  offline?: boolean;
}>();
const seconds = computed(() =>
  Math.max(0, Math.ceil(props.remainingMs / 1000)),
);
const label = computed(() =>
  props.offline ? "Connecting" : props.paused ? "Paused" : `${seconds.value}s`,
);
</script>
<template>
  <div
    class="turn-clock"
    :class="{
      urgent: !paused && !offline && seconds <= 10,
      warning: !paused && !offline && seconds <= 20,
      stopped: paused || offline,
    }"
    :aria-label="paused || offline ? label : `${seconds} seconds remaining`"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </svg>
    <strong>{{ label }}</strong>
  </div>
</template>
