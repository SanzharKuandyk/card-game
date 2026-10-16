<script setup lang="ts">
defineProps<{
  impact: { label: string; tone: string; lost?: number; blocked?: number };
  effectKey?: string;
}>();
</script>
<template>
  <span
    v-if="impact.label"
    :key="effectKey"
    class="effect-burst"
    :class="`effect-${impact.tone}`"
  >
    <template v-if="impact.lost && impact.blocked">
      <b>−{{ impact.lost }} HP</b
      ><span class="impact-absorption"> · {{ impact.blocked }} blocked</span>
    </template>
    <template v-else>{{ impact.label }}</template>
  </span>
</template>
