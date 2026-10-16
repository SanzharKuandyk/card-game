<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { CombatView } from "../../shared/model.ts";
import { effectText } from "../combat-feedback.ts";
const props = defineProps<{ combat: CombatView }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
function close() {
  // Close before unmounting so the browser restores focus to the opener.
  dialog.value?.close();
  emit("close");
}
const name = (id: string) =>
  props.combat.actors.find((actor) => actor.memberId === id)?.name ??
  props.combat.enemies.find((enemy) => enemy.id === id)?.name;
</script>
<template>
  <dialog
    ref="dialog"
    class="combat-history-dialog"
    aria-label="History"
    @cancel.prevent="close"
  >
    <header>
      <h2>History</h2>
      <button aria-label="Close history" @click="close">Close</button>
    </header>
    <div class="history-entries" tabindex="0" aria-label="Combat events">
      <p v-if="!combat.log.length">No plays yet.</p>
      <ol v-else>
        <li v-for="event in combat.log.slice().reverse()" :key="event.id">
          <small>Turn {{ event.turn }}</small>
          <strong
            >{{ name(event.sourceId)
            }}<template
              v-if="name(event.targetId) && event.targetId !== event.sourceId"
            >
              → {{ name(event.targetId) }}</template
            ></strong
          >
          <span>{{ effectText(event) }}</span>
        </li>
      </ol>
    </div>
  </dialog>
</template>
