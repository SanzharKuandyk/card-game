<script setup lang="ts">
import { onMounted, ref } from "vue";
defineProps<{ title: string; lines: string[] }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
function close() {
  dialog.value?.close();
  emit("close");
}
</script>
<template>
  <dialog
    ref="dialog"
    class="combat-history-dialog effect-dialog"
    :aria-label="title"
    @cancel.prevent="close"
  >
    <header>
      <h2>{{ title }}</h2>
      <button @click="close">Close</button>
    </header>
    <div class="effect-description">
      <p v-for="line in lines" :key="line">{{ line }}</p>
      <slot />
    </div>
  </dialog>
</template>
