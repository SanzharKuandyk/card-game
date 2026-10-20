<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useGame } from "../stores/game.ts";
const emit = defineEmits<{ close: [] }>();
const game = useGame();
const dialog = ref<HTMLDialogElement>();
const previous = document.activeElement as HTMLElement | null;
const crewId = ref(game.view?.pendingTeam?.crewId ?? game.view?.crewId ?? "");
const name = ref("");
const message = ref("");
const pending = computed(() => game.view?.pendingTeam);
const pendingName = computed(() =>
  pending.value?.crewId
    ? game.view?.crews.find((c) => c.id === pending.value?.crewId)?.name
    : pending.value?.name || "New team",
);
function close() {
  dialog.value?.close();
  emit("close");
}
async function save() {
  const result = await game.command({
    kind: "team:change",
    ...(crewId.value
      ? { crewId: crewId.value }
      : { name: name.value.trim() || undefined }),
  });
  message.value = result.message;
}
onMounted(() => dialog.value?.showModal());
onUnmounted(() => {
  dialog.value?.close();
  previous?.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="deck-dialog team-dialog"
    aria-label="Change team"
    @cancel.prevent="close"
  >
    <header>
      <h2>Team</h2>
      <button @click="close">Close</button>
    </header>
    <div class="team-dialog-content">
      <p>
        Keep your character, cards and health. Changes during a room wait until
        it finishes.
      </p>
      <p v-if="pending" role="status">
        After this room: {{ pendingName }}
        <button
          :disabled="game.busy"
          @click="game.command({ kind: 'team:cancel' })"
        >
          Cancel change
        </button>
      </p>
      <label
        >Choose team<select v-model="crewId">
          <option value="">New team</option>
          <option
            v-for="crew in game.view?.crews"
            :key="crew.id"
            :value="crew.id"
            :disabled="
              crew.members.length >= 4 && crew.id !== game.view?.crewId
            "
          >
            {{ crew.name }} · {{ crew.members.length }}/4
          </option>
        </select></label
      >
      <label v-if="!crewId"
        >Team name<input v-model="name" maxlength="24" placeholder="Team name"
      /></label>
      <p v-if="message" role="status">{{ message }}</p>
      <button
        class="primary"
        :disabled="game.busy || !game.connected || !game.view?.controlling"
        @click="save"
      >
        Change team
      </button>
    </div>
  </dialog>
</template>
<style scoped>
.team-dialog-content {
  display: grid;
  gap: 16px;
  padding: 16px;
  overflow: auto;
}
.team-dialog-content label {
  display: grid;
  gap: 6px;
}
.team-dialog-content p {
  margin: 0;
}
.team-dialog {
  max-width: min(480px, calc(100vw - 24px));
}
</style>
