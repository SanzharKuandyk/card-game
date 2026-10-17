<script setup lang="ts">
import { ref, watch } from "vue";
import type { Enemy } from "../../shared/model.ts";
import CombatArt from "./CombatArt.vue";
const props = defineProps<{ kind: string; portrait?: Enemy["portrait"] }>();
const failed = ref(false);
watch(
  () => props.portrait?.path,
  () => {
    failed.value = false;
  },
);
</script>
<template>
  <span v-if="portrait && !failed" class="combat-art enemy-photo">
    <img
      :src="portrait.path"
      :alt="portrait.alt"
      :style="{
        objectPosition: portrait.position,
        objectFit: portrait.fit ?? 'cover',
      }"
      width="120"
      height="128"
      decoding="async"
      @error="failed = true"
    />
  </span>
  <CombatArt v-else :kind="kind" />
</template>
<style scoped>
.enemy-photo {
  display: inline-block;
  overflow: hidden;
  border-radius: 14px;
  isolation: isolate;
  background: #d5d6cb;
  box-shadow: 0 2px 5px #1b34282b;
}
.enemy-photo img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: cover;
}
</style>
