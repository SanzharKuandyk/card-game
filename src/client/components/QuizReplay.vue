<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ReplayStep } from "../../shared/quiz-types.ts";
const props = defineProps<{ steps: ReplayStep[]; revealed?: boolean }>();
const index = ref(0);
watch(
  () => props.steps,
  () => (index.value = 0),
);
const step = computed(() => props.steps[index.value]);
</script>
<template>
  <div class="quiz-replay">
    <svg viewBox="0 0 420 110" role="img" :aria-label="step?.detail">
      <path
        v-for="(line, i) in step?.scene.lines"
        :key="`l${i}`"
        :d="`M${line.x1} ${line.y1} L${line.x2} ${line.y2}`"
        stroke="#597c87"
        stroke-width="3"
      />
      <g
        v-for="(n, i) in step?.scene.nodes"
        :key="i"
        :class="`replay-${n.role}`"
      >
        <rect
          v-if="n.shape === 'box'"
          :x="n.x"
          :y="n.y"
          :width="n.w"
          :height="n.h"
          rx="4"
        />
        <circle v-if="n.shape === 'circle'" :cx="n.x" :cy="n.y" :r="n.w" />
        <text
          :x="n.shape === 'box' ? n.x + n.w / 2 : n.x"
          :y="
            n.shape === 'text'
              ? n.y
              : n.shape === 'box'
                ? n.y + n.h + 13
                : n.y + n.w + 13
          "
        >
          {{ n.label }}
        </text>
      </g>
    </svg>
    <p class="replay-step">{{ step?.detail }}</p>
    <div class="replay-controls">
      <button
        v-for="(s, i) in steps"
        :key="s.label"
        :aria-pressed="i === index"
        @click="index = i"
      >
        {{ i + 1 }}</button
      ><button @click="index = (index + 1) % steps.length">Next step</button>
    </div>
    <details>
      <summary>All steps</summary>
      <ol>
        <li v-for="s in steps" :key="s.label">{{ s.detail }}</li>
      </ol>
    </details>
  </div>
</template>
