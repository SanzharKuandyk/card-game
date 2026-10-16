<script setup lang="ts">
import { useGame } from "../stores/game.ts";
const game = useGame();
</script>
<template>
  <section v-if="game.view?.relicReward" class="relic-offer">
    <h1>Choose a relic</h1>
    <div class="relic-offer-grid">
      <article
        v-for="id in game.view.relicReward.offers"
        :key="id"
        class="relic-shop-item"
      >
        <span class="relic-symbol" aria-hidden="true">◇</span>
        <h2>{{ game.view.relics.find((r) => r.id === id)?.name }}</h2>
        <p>{{ game.view.relics.find((r) => r.id === id)?.text }}</p>
        <button
          class="primary"
          :disabled="
            game.busy ||
            !game.connected ||
            !game.view.controlling ||
            game.view.hero?.relics.some((r) => r.relicId === id)
          "
          @click="
            game.command({
              kind: 'relic:claim',
              rewardId: game.view!.relicReward!.id,
              relicId: id,
            })
          "
        >
          Choose
        </button>
      </article>
    </div>
    <button
      :disabled="game.busy || !game.view.controlling"
      @click="
        game.command({
          kind: 'relic:claim',
          rewardId: game.view!.relicReward!.id,
          relicId: null,
        })
      "
    >
      Skip
    </button>
  </section>
</template>
