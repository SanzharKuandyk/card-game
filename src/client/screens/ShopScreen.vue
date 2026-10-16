<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { useGame } from "../stores/game.ts";
import CardTile from "../components/CardTile.vue";
import DeckDialog from "../components/DeckDialog.vue";
import EffectDetails from "../components/EffectDetails.vue";
import RelicsDialog from "../components/RelicsDialog.vue";
import QuizPanel from "../components/QuizPanel.vue";
import RewardPanel from "../components/RewardPanel.vue";
import RelicOfferPanel from "../components/RelicOfferPanel.vue";
const game = useGame(),
  route = useRoute(),
  router = useRouter();
const v = computed(() => game.view);
const shop = computed(() => v.value?.shop);
const pendingRemove = ref("");
const remove = ref(false),
  owned = ref(false),
  details = ref<{ title: string; lines: string[] } | null>(null);
const removal = computed(
  () =>
    (v.value?.economy.removal ?? 0) +
    (v.value?.hero?.removalCount ?? 0) *
      (v.value?.economy.removalIncrease ?? 0),
);
const locked = computed(
  () =>
    game.busy ||
    !game.connected ||
    !v.value?.controlling ||
    v.value.status !== "running" ||
    !!shop.value?.ready,
);
onMounted(() => game.connect(String(route.params.id), "player"));
onBeforeRouteLeave((to) => {
  if (!to.path.startsWith(`/play/${route.params.id}`)) game.close();
});
watch(
  () => [
    v.value?.shop?.id,
    v.value?.quiz?.id,
    v.value?.combat?.id,
    v.value?.revision,
  ],
  () => {
    if (v.value && !v.value.quiz && !v.value.shop)
      void router.replace(`/play/${route.params.id}`);
  },
);
function card(id: string) {
  const d = v.value!.cards.find((c) => c.id === id)!;
  return {
    uid: `shop:${id}`,
    cardId: id,
    upgraded: false,
    definition: d,
    cost: d.cost,
  };
}
async function removeCard(uid: string) {
  if (!shop.value || !v.value?.hero) return;
  await game.command({
    kind: "shop:remove",
    shopId: shop.value.id,
    shopRevision: shop.value.revision,
    deckRevision: v.value.hero.deckRevision,
    cardUid: uid,
  });
  remove.value = false;
  details.value = null;
  pendingRemove.value = "";
}
</script>
<template>
  <main class="shop-screen">
    <p v-if="game.error" class="error" role="alert">{{ game.error }}</p>
    <p v-if="!game.connected" class="pause-banner">Reconnecting…</p>
    <p v-if="v?.status === 'paused'" class="pause-banner">Paused</p>
    <p v-if="v && !v.controlling" class="pause-banner">
      Read-only
      <button @click="game.command({ kind: 'takeover' })">Take control</button>
    </p>
    <QuizPanel v-if="v?.quiz" /><RewardPanel
      v-else-if="v?.rewards.length"
    /><RelicOfferPanel v-else-if="v?.relicReward" />
    <template v-else-if="shop && v?.hero"
      ><header class="shop-heading">
        <h1>Shop</h1>
        <strong class="gold-display">● {{ v.hero.gold }} gold</strong
        ><button @click="owned = true">
          Relics · {{ v.hero.relics.length }}
        </button>
      </header>
      <p v-if="shop.ready" class="pause-banner">
        Waiting for teammates. Press Change to keep shopping.
      </p>
      <section>
        <h2>Cards</h2>
        <div class="shop-card-grid">
          <article
            v-for="item in shop.stock.filter((i) => i.kind === 'card')"
            :key="item.id"
            class="shop-card"
          >
            <CardTile
              v-if="item.kind === 'card'"
              :card="card(item.cardId).definition"
              @select="
                pendingRemove = '';
                details = {
                  title: card(item.cardId).definition.name,
                  lines: [card(item.cardId).definition.text],
                };
              "
            /><button
              class="primary"
              :disabled="locked || item.sold || v.hero.gold < item.price"
              @click="
                game.command({
                  kind: 'shop:buy',
                  shopId: shop.id,
                  shopRevision: shop.revision,
                  itemId: item.id,
                })
              "
            >
              {{ item.sold ? "Sold" : `Buy · ${item.price} gold` }}
            </button>
          </article>
        </div>
      </section>
      <section>
        <h2>Relics</h2>
        <div class="relic-offer-grid">
          <article
            v-for="item in shop.stock.filter((i) => i.kind === 'relic')"
            :key="item.id"
            class="relic-shop-item"
          >
            <button
              v-if="item.kind === 'relic'"
              class="relic-inspect"
              @click="
                pendingRemove = '';
                details = {
                  title: v!.relics.find((r) => r.id === item.relicId)!.name,
                  lines: [v!.relics.find((r) => r.id === item.relicId)!.text],
                };
              "
            >
              <span class="relic-symbol" aria-hidden="true">◇</span
              ><strong>{{
                v.relics.find((r) => r.id === item.relicId)?.name
              }}</strong
              ><span>{{
                v.relics.find((r) => r.id === item.relicId)?.text
              }}</span></button
            ><button
              class="primary"
              :disabled="locked || item.sold || v.hero.gold < item.price"
              @click="
                game.command({
                  kind: 'shop:buy',
                  shopId: shop.id,
                  shopRevision: shop.revision,
                  itemId: item.id,
                })
              "
            >
              {{ item.sold ? "Sold" : `Buy · ${item.price} gold` }}
            </button>
          </article>
        </div>
      </section>
      <section class="shop-removal">
        <div>
          <h2>Remove a card</h2>
          <p>Keep at least 6 cards, including one Strike and one Guard.</p>
        </div>
        <button
          :disabled="locked || !shop.removalAvailable || v.hero.gold < removal"
          @click="remove = true"
        >
          {{ shop.removalAvailable ? `Choose · ${removal} gold` : "Used" }}
        </button>
      </section>
      <footer class="shop-footer">
        <strong>{{ v.hero.gold }} gold</strong
        ><button
          class="primary"
          :disabled="
            game.busy ||
            !game.connected ||
            !v.controlling ||
            v.status !== 'running'
          "
          @click="
            game.command({
              kind: 'shop:ready',
              shopId: shop.id,
              ready: !shop.ready,
            })
          "
        >
          {{ shop.ready ? "Change" : "Done" }}
        </button>
      </footer>
    </template>
    <p v-else>Opening…</p>
    <DeckDialog
      v-if="remove && v?.hero"
      :deck="v.hero.deck"
      :cards="v.cards"
      selectable
      :title="`Remove · ${removal} gold`"
      @close="remove = false"
      @select="
        (uid) => {
          details = {
            title: 'Remove this card?',
            lines: [
              `${v!.cards.find((c) => c.id === v!.hero!.deck.find((c) => c.uid === uid)!.cardId)!.name} · ${removal} gold`,
            ],
          };
          pendingRemove = uid;
          remove = false;
        }
      "
    />
    <EffectDetails
      v-if="details"
      :title="details.title"
      :lines="details.lines"
      @close="
        details = null;
        pendingRemove = '';
      "
      ><button
        v-if="pendingRemove"
        class="primary"
        :disabled="locked"
        @click="removeCard(pendingRemove)"
      >
        Remove · {{ removal }} gold
      </button></EffectDetails
    >
    <RelicsDialog v-if="owned" @close="owned = false" />
  </main>
</template>
