<script setup lang="ts">
import { computed } from "vue";
import { cardTextParts } from "../card-keywords.ts";
const props = defineProps<{ text: string }>();
const parts = computed(() => cardTextParts(props.text));
</script>
<template>
  <span class="rich-card-text"
    ><template v-for="(part, index) in parts" :key="index"
      ><strong
        v-if="part.kind"
        :class="['card-keyword', `keyword-${part.kind}`]"
        >{{ part.text }}</strong
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>
