<script setup lang="ts">
defineProps<{ kind?: string }>();
</script>
<template>
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <template v-if="kind === 'attack'">
      <path d="M12 36 34 8l6 1-1 6-25 22M10 28l12 10M8 40l7-7" />
      <path d="m19 26 12-13" />
    </template>
    <template v-else-if="kind === 'power'">
      <path d="m24 5 5 13 14 6-14 6-5 13-5-13-14-6 14-6Z" />
      <path d="M24 15v18M15 24h18" />
    </template>
    <template v-else-if="kind === 'boss'">
      <path d="m10 33 4-22 10 7 10-7 4 22-14 9Z" />
      <path d="M17 27h4M27 27h4M20 34h8" />
    </template>
    <template v-else-if="kind === 'rest'">
      <path d="M7 37h34L24 8ZM24 8v29M16 37l8-14 8 14" />
    </template>
    <template v-else-if="kind === 'event'">
      <path d="M10 9h28v31H10ZM16 16h16M16 23h12M16 30h8" />
    </template>
    <template v-else-if="kind === 'elite'">
      <path d="m24 5 7 10 11 2-6 10 1 13-13-5-13 5 1-13-6-10 11-2Z" />
    </template>
    <template v-else>
      <path d="m24 5 16 7v13c0 9-8 15-16 19C16 40 8 34 8 25V12Z" />
      <path d="M24 14v20M16 24h16" />
    </template>
  </svg>
</template>
