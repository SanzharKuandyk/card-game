<script setup lang="ts">
import RelicsDialog from "./RelicsDialog.vue";
import { ref as relicRef } from "vue";
const relicOpen = relicRef(false);
import { onMounted, ref } from "vue";
import type { CardDefinition, CardInstance } from "../../shared/model.ts";
import CardTile from "./CardTile.vue";
import KeywordGuide from "./KeywordGuide.vue";
const props = defineProps<{
  deck: CardInstance[];
  cards: CardDefinition[];
  selectable?: boolean;
  title?: string;
}>();
const emit = defineEmits<{ close: []; select: [uid: string] }>();
const dialog = ref<HTMLDialogElement>();
const keywordsOpen = ref(false);
onMounted(() => dialog.value?.showModal());
function find(c: CardInstance) {
  return props.cards.find((d) => d.id === c.cardId)!;
}
</script>
<template>
  <dialog ref="dialog" class="deck-dialog" @cancel.prevent="emit('close')">
    <header>
      <h2>{{ title ?? "Cards" }}</h2>
      <button class="quiet" @click="keywordsOpen = true">Keywords</button>
      <button
        class="icon-button"
        aria-label="Close cards"
        @click="emit('close')"
      >
        ×
      </button>
      <button @click="relicOpen = true">Relics</button>
    </header>
    <div class="deck-grid">
      <CardTile
        v-for="c in deck"
        :key="c.uid"
        :card="find(c)"
        :instance="c"
        @select="selectable && emit('select', c.uid)"
      />
    </div>
    <footer>
      <button class="primary" @click="emit('close')">Done</button>
    </footer>
    <KeywordGuide v-if="keywordsOpen" @close="keywordsOpen = false" />
  </dialog>
  <RelicsDialog v-if="relicOpen" @close="relicOpen = false" />
</template>
