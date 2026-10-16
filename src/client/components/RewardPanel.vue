<script setup lang="ts">
import { ref } from "vue";
import { useGame } from "../stores/game.ts";
import CardTile from "./CardTile.vue";
import KeywordGuide from "./KeywordGuide.vue";
const game = useGame();
const selected = ref<string | null>(null);
const keywordsOpen = ref(false);
</script>
<template>
  <section v-if="game.view?.rewards[0]" class="reward-panel">
    <header class="section-heading">
      <h1>
        {{
          game.view.rewards[0].source.startsWith("first:")
            ? "First arrival"
            : "Choose a card"
        }}
      </h1>
      <span>Keep it in your deck</span>
      <button class="quiet" @click="keywordsOpen = true">Keywords</button>
    </header>
    <div class="reward-grid">
      <CardTile
        v-for="card in game.view.rewards[0].cards"
        :key="card.uid"
        :card="card.definition"
        :instance="card"
        :selected="selected === card.uid"
        @select="selected = card.uid"
      />
    </div>
    <KeywordGuide v-if="keywordsOpen" @close="keywordsOpen = false" />
    <footer class="decision-footer">
      <button
        class="primary"
        :disabled="!selected || game.busy || !game.view.controlling"
        @click="
          game.command({
            kind: 'reward',
            rewardId: game.view!.rewards[0]!.id,
            cardUid: selected,
          });
          selected = null;
        "
      >
        Choose</button
      ><button
        :disabled="game.busy || !game.view.controlling"
        @click="
          game.command({
            kind: 'reward',
            rewardId: game.view!.rewards[0]!.id,
            cardUid: null,
          });
          selected = null;
        "
      >
        Skip
      </button>
    </footer>
  </section>
</template>
