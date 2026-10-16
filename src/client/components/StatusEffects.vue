<script setup lang="ts">
import { ref } from "vue";
import type { StatusBadge } from "../combat-status.ts";
import EffectDetails from "./EffectDetails.vue";
defineProps<{ effects: StatusBadge[]; owner: string }>();
const selected = ref<StatusBadge | null>(null);
</script>
<template>
  <div
    v-if="effects.length"
    class="actor-effects"
    :aria-label="`${owner} effects`"
  >
    <button
      v-if="effects.length > 1"
      class="effects-summary"
      @click="selected = { id: 'all', label: 'Effects', text: '' }"
    >
      {{ effects[0]!.label }} · +{{ effects.length - 1 }}
    </button>
    <button
      v-for="effect in effects.slice(0, 2)"
      :key="effect.id"
      :class="`effect-${effect.id}`"
      @click="selected = effect"
    >
      {{ effect.label }}
    </button>
    <button
      v-if="effects.length > 2"
      @click="selected = { id: 'all', label: 'Effects', text: '' }"
    >
      +{{ effects.length - 2 }}
    </button>
  </div>
  <EffectDetails
    v-if="selected"
    :title="`${owner} · ${selected.label}`"
    :lines="
      selected.id === 'all'
        ? effects.map((e) => `${e.label}: ${e.text}`)
        : [selected.text]
    "
    @close="selected = null"
  />
</template>
