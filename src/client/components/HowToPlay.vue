<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { CardDefinition } from "../../shared/model.ts";
import CardTile from "./CardTile.vue";
import EnergyDisplay from "./EnergyDisplay.vue";
const props = defineProps<{ cards: CardDefinition[] }>();
defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const step = ref(0);
const card = computed(() => props.cards.find((c) => c.id === "strike"));
const damage = computed(
  () => card.value?.effects.find((e) => e.op === "damage")?.amount ?? 0,
);
onMounted(() => dialog.value?.showModal());
</script>
<template>
  <dialog
    ref="dialog"
    class="deck-dialog how-to"
    aria-label="Try a turn"
    @cancel.prevent="$emit('close')"
  >
    <header>
      <h2>Try a turn</h2>
      <button aria-label="Close help" @click="$emit('close')">×</button>
    </header>
    <div class="practice-turn">
      <small>Practice · your game stays unchanged</small>
      <p>
        {{
          step === 0
            ? "1. Tap a card. Its corner shows the energy cost."
            : step === 1
              ? "2. Choose who it affects. Tap the practice enemy."
              : step === 2
                ? "3. Read the effect, then Play."
                : step === 3
                  ? "4. Play more cards while you have energy, then End turn."
                  : "The enemy attacks after everyone ends. Block absorbs damage."
        }}
      </p>
      <button
        class="practice-enemy"
        :class="{ selected: step >= 2 }"
        :disabled="step !== 1"
        @click="step = 2"
      >
        Practice enemy · {{ step >= 3 ? 12 - damage : 12 }}/12 HP<small
          >Next attack: 4 damage</small
        >
      </button>
      <EnergyDisplay :amount="step >= 3 ? 3 - (card?.cost ?? 0) : 3" />
      <CardTile
        v-if="card"
        :card="card"
        :selected="step > 0"
        :disabled="step !== 0"
        @select="step = 1"
      />
      <p v-if="step >= 2">
        {{ card?.text }}{{ step >= 3 ? ` Played: ${damage} health lost.` : "" }}
      </p>
      <button v-if="step === 2" class="primary" @click="step = 3">Play</button>
      <button v-if="step === 3" class="primary" @click="step = 4">
        End turn
      </button>
      <template v-if="step === 4"
        ><p>
          In a real fight, read the incoming damage. Protect a teammate or set
          up their next attack. Your hand refills next turn.
        </p>
        <button class="primary" @click="$emit('close')">
          Got it
        </button></template
      >
    </div>
    <footer><button @click="$emit('close')">Back to game</button></footer>
  </dialog>
</template>
