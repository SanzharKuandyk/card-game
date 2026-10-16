<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useGame } from "../stores/game.ts";
const game = useGame();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const previous = document.activeElement as HTMLElement | null;
const owned = computed(
  () =>
    game.view?.relics?.filter((r) =>
      game.view?.hero?.relics?.some((o) => o.relicId === r.id),
    ) ?? [],
);
const actor = computed(() =>
  game.view?.combat?.actors.find((a) => a.memberId === game.view?.memberId),
);
onMounted(() => dialog.value?.showModal());
onUnmounted(() => previous?.focus());
</script>
<template>
  <dialog
    ref="dialog"
    class="relic-dialog"
    aria-label="Relics"
    @cancel.prevent="emit('close')"
  >
    <header>
      <h2>Relics · {{ owned.length }}</h2>
      <button @click="emit('close')">Close</button>
    </header>
    <div class="relic-list">
      <p v-if="!owned.length">Find relics at elites and shops.</p>
      <article v-for="r in owned" :key="r.id" :class="r.rarity">
        <span class="relic-symbol" aria-hidden="true">◇</span>
        <div>
          <h3>{{ r.name }}</h3>
          <p>{{ r.text }}</p>
          <small v-if="actor?.relicState">{{
            actor.relicState.activeRelicIds.includes(r.id)
              ? actor.relicState.encounterUses[r.id]
                ? "Used at encounter start"
                : actor.relicState.turnUses[r.id]
                  ? "Used this turn"
                  : "Active in this fight"
              : "Active from your next new encounter"
          }}</small
          ><small v-else>Active from your next encounter</small>
        </div>
      </article>
    </div>
  </dialog>
</template>
