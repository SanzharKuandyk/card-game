<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { keywordsIn } from "../card-keywords.ts";
import CardText from "./CardText.vue";
const props = defineProps<{
  text?: string;
  cardName?: string;
  description?: string;
}>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const terms = computed(() => keywordsIn(props.text));
onMounted(() => dialog.value?.showModal());
function close() {
  dialog.value?.close();
  emit("close");
}
</script>
<template>
  <dialog
    ref="dialog"
    class="deck-dialog keyword-guide"
    aria-label="Card keywords"
    @cancel.prevent="close"
  >
    <header>
      <h2>{{ cardName ?? "Keywords" }}</h2>
      <button class="icon-button" aria-label="Close keywords" @click="close">
        ×
      </button>
    </header>
    <p v-if="description" class="full-card-description">
      <CardText :text="description" />
    </p>
    <dl>
      <template v-for="term in terms" :key="term.id"
        ><dt :class="['card-keyword', `keyword-${term.id}`]">
          {{ term.label }}
        </dt>
        <dd>{{ term.text }}</dd></template
      >
    </dl>
    <footer>
      <button class="primary" @click="close">Done</button>
    </footer>
  </dialog>
</template>
