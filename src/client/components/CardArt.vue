<script setup lang="ts">
import { computed } from "vue";
import type { CardDefinition } from "../../shared/model.ts";
const props = defineProps<{ card: CardDefinition }>();
const family = computed(() => props.card.tags[0]);
const variant = computed(
  () => [...props.card.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4,
);
</script>
<template>
  <svg class="card-art" viewBox="0 0 160 100" fill="none" aria-hidden="true">
    <rect width="160" height="100" rx="9" fill="currentColor" opacity=".09" />
    <path
      d="M0 83 36 55 66 74 109 43l51 28v29H0Z"
      fill="currentColor"
      opacity=".08"
    />
    <circle
      :cx="35 + variant * 27"
      cy="33"
      :r="23 + variant * 3"
      fill="currentColor"
      opacity=".1"
    />
    <g
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    >
      <template v-if="family === 'fortress'">
        <path d="M42 79V39l11-9 10 7V22h34v15l11-7 10 9v40Z" fill="#fbf5df" />
        <path
          d="M63 22v-9h9v9m16 0v-9h9v9M42 51h21m34 0h21M71 79V59q9-16 18 0v20M49 63h6m49 0h7"
        />
        <path
          v-if="card.type === 'attack'"
          d="m27 86 48-52 13 1-1 13-51 48m9-26 18 18"
          fill="#bdcfca"
        />
        <path v-else d="m67 42 13-6 15 6-2 17-13 12-12-10Z" fill="#c5d9d0" />
      </template>
      <template v-else-if="family === 'blood'">
        <path
          d="M81 14Q57 40 57 56a24 24 0 0 0 48 0Q105 40 81 14Z"
          fill="#e4b0a1"
        />
        <path d="m68 48 9 8 12-15M69 68q8 7 18 0" stroke="#a85645" />
        <path d="m32 72 14-6 14 6m46 1 17-7 13 6M43 43l-8-4m89 4 7-5" />
        <path
          v-if="card.type === 'attack'"
          d="m39 83 71-64 8 4-2 9-69 64m-4-22 14 13"
          fill="#bccfc8"
        />
      </template>
      <template v-else-if="family === 'flurry'">
        <g
          v-for="n in 2 + (variant % 2)"
          :key="n"
          :transform="`translate(${(n - 2) * 22} ${(n - 2) * 3})`"
        >
          <path d="m61 71 24-49 13-2-2 13-26 43Z" fill="#d4dfd3" />
          <path d="m60 69 16 9m-11-5-8 17" stroke-width="5" />
        </g>
        <path d="M29 38h25M24 48h22m57 28h28m-25 10h18" opacity=".5" />
      </template>
      <template v-else-if="family === 'discard'">
        <path d="m40 25 42-8 13 56-42 9Z" fill="#efe2c7" />
        <path d="m63 22 43 8-12 57-43-8Z" fill="#dcc4ad" />
        <path d="m87 42 6 13-12 10-10-10Z" fill="#fbf5df" />
        <path d="m113 40 17 15-17 15m17-15H99M37 55 21 68l16 13m-16-13h23" />
      </template>
      <template v-else-if="family === 'poison'">
        <path d="M68 18h25l-2 20 20 34-6 14H55l-5-14 20-34Z" fill="#c6d8ac" />
        <path d="M55 68q14-9 27 0t24 0l-4 13H58Z" fill="#81a279" />
        <path d="M65 17h31v9H65Z" fill="#d9c399" />
        <circle cx="72" cy="55" r="4" />
        <circle cx="91" cy="61" r="3" />
        <path d="M113 29q9-9 4-18M44 49q-10-9-3-20" opacity=".5" />
      </template>
      <template v-else-if="family === 'recycle'">
        <path d="m65 33 31 7-7 38-31-7Z" fill="#d8d8be" />
        <path d="m75 44 8 9-5 11-8-9Z" fill="#c6d8ac" />
        <path
          d="M50 62a33 33 0 0 1 36-44m-8-8 8 8-11 7M111 39a33 33 0 0 1-33 47m9 8-9-8 10-6"
          stroke-width="4"
        />
      </template>
      <template v-else-if="family === 'charge'">
        <circle cx="80" cy="49" r="28" fill="#c9c0dc" />
        <path d="m86 15-22 38h17l-6 31 24-42H80Z" fill="#f1d395" />
        <path
          d="M40 37 28 29m10 34-12 6m98-35 10-5m-12 36 12 7M64 11l-4-5m37 81 3 7"
          opacity=".5"
        />
      </template>
      <template v-else-if="family === 'team'">
        <path d="m34 64 15-18 32 18-16 17Z" fill="#c9b8cc" />
        <path d="m124 62-17-17-36 24 17 13Z" fill="#b7d1c5" />
        <path d="m68 60 11-9 15 7-13 19-10-3m-20-9 15 14" fill="#edcfaf" />
        <path d="m80 13 4 11 11 4-11 4-4 10-4-10-11-4 11-4Z" fill="#f1d395" />
      </template>
      <template v-else-if="card.type === 'attack'">
        <path d="m48 72 49-51 17-2-3 17-54 45Z" fill="#c2d2c8" />
        <path d="m41 61 28 28m-14-12-16 16" stroke-width="5" />
        <path d="M28 34h23m-14 9h12m61 29h24" opacity=".5" />
      </template>
      <template v-else>
        <path d="m80 17 29 13-3 31-26 24-28-24-2-31Z" fill="#c6d5c6" />
        <path d="m80 30 6 14 15 5-15 6-6 15-6-15-15-6 15-5Z" fill="#f1d395" />
      </template>
    </g>
    <g v-if="card.rarity === 'rare'" stroke="#b78a35" stroke-width="2">
      <path d="M9 28V9h20m102 0h20v19M9 73v18h20m102 0h20V73" />
      <path d="m80 4 3 4-3 4-3-4Z" fill="#b78a35" />
    </g>
  </svg>
</template>
