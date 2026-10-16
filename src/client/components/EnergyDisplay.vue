<script setup lang="ts">
defineProps<{ amount: number }>();
</script>
<template>
  <span
    class="energy-display"
    :class="{ empty: amount === 0 }"
    role="status"
    :aria-label="`${amount} energy left`"
    ><svg class="energy-symbol" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 13h6l-1 9L21 9h-8Z" fill="currentColor" /></svg
    ><b>{{ amount }}</b
    ><span>Energy</span></span
  >
</template>
