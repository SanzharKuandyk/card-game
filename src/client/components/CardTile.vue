<script setup lang="ts">
import CardArt from "./CardArt.vue";
import CardText from "./CardText.vue";
import type { CardDefinition, CardInstance } from "../../shared/model.ts";
defineProps<{
  card: CardDefinition;
  instance?: CardInstance;
  selected?: boolean;
  compact?: boolean;
  cost?: number;
  disabled?: boolean;
  unaffordable?: boolean;
}>();
defineEmits<{ select: [] }>();
</script>
<template>
  <button
    type="button"
    class="card"
    :class="[
      card.character,
      card.rarity,
      `card-${card.type}`,
      { selected, compact, unaffordable },
    ]"
    :disabled="disabled"
    :aria-pressed="selected"
    :aria-label="`${card.name}${instance?.upgraded ? ' upgraded' : ''}, ${cost ?? (instance?.upgraded ? card.upgrade.cost : card.cost)} energy`"
    :data-card-uid="instance?.uid"
    @click="$emit('select')"
  >
    <span
      class="card-cost"
      :aria-label="`Costs ${cost ?? (instance?.upgraded ? card.upgrade.cost : card.cost)} energy`"
      >{{ cost ?? (instance?.upgraded ? card.upgrade.cost : card.cost) }}</span
    ><span class="card-rarity">{{
      card.rarity === "token" ? "Created" : card.rarity
    }}</span>
    <span class="card-picture"><CardArt :card="card" /></span
    ><span
      v-if="compact && instance?.upgraded"
      class="card-upgrade"
      aria-label="Upgraded"
      >+</span
    ><strong class="card-name"
      >{{ card.name }}{{ instance?.upgraded && !compact ? " +" : "" }}</strong
    >
    <CardText
      v-if="!compact"
      class="card-text"
      :text="instance?.upgraded ? card.upgrade.text : card.text"
    />
    <span class="card-type">{{ card.type }}</span>
  </button>
</template>
