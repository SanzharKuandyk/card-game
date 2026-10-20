<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useGame } from "../stores/game.ts";
import { useLearningProgress } from "../onboarding/use-onboarding.ts";
import { combinations } from "../onboarding/hints.ts";
const emit = defineEmits<{ close: []; team: [] }>();
const game = useGame();
const dialog = ref<HTMLDialogElement>();
const previous = document.activeElement as HTMLElement | null;
const { progress, hide, show } = useLearningProgress(() => game.view);
const combination = computed(() =>
  game.view?.hero ? combinations[game.view.hero.character].text : null,
);
const opening = computed(
  () =>
    game.view?.combat?.openingRoom &&
    game.view.combat.kind === "route" &&
    game.view.progress?.row === 1,
);
function close() {
  dialog.value?.close();
  emit("close");
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
    class="deck-dialog help-dialog"
    aria-label="Help"
    @cancel.prevent="close"
  >
    <header>
      <h2>Help</h2>
      <button @click="close">Close</button>
    </header>
    <div class="help-reference">
      <button
        v-if="game.view?.crewId && game.view.status !== 'finished'"
        @click="emit('team')"
      >
        Change team
      </button>
      <p>
        <a href="/photo-credits.html" target="_blank" rel="noopener"
          >Image sources</a
        >
      </p>
      <dl>
        <dt>Play</dt>
        <dd>
          Choose a card, choose its target, then Play. You can play several
          cards.
        </dd>
        <dt>Energy</dt>
        <dd>
          The corner number is the cost. You normally start each turn with 3
          energy.
        </dd>
        <dt>Incoming</dt>
        <dd>
          The symbol above an enemy shows its next action. Tap it to see who it
          targets.
        </dd>
        <dt>Block</dt>
        <dd>
          Block absorbs damage before health. It normally clears at the start of
          your next turn.
        </dd>
        <dt>End turn</dt>
        <dd>
          The enemy acts after everyone ends, or time runs out. Change lets you
          play again while the team is still choosing.
        </dd>
      </dl>
      <template v-if="combination"
        ><h3>Your combination</h3>
        <p>{{ combination }}</p></template
      >
      <button
        v-if="opening"
        :aria-pressed="!progress.hidden"
        @click="progress.hidden ? show() : hide()"
      >
        {{ progress.hidden ? "Show tips" : "Hide tips" }}
      </button>
    </div>
  </dialog>
</template>
