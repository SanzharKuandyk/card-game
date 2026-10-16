<script setup lang="ts">
defineProps<{ kind: string }>();
</script>
<template>
  <svg class="combat-art" viewBox="0 0 120 128" fill="none" aria-hidden="true">
    <ellipse cx="60" cy="119" rx="40" ry="6" fill="#20342f" opacity=".12" />
    <g
      stroke="#273c39"
      stroke-width="2.4"
      stroke-linejoin="round"
      stroke-linecap="round"
    >
      <template v-if="kind === 'guardian'">
        <path d="M31 61 26 104 43 113 81 111 93 74 77 59Z" fill="#395c72" />
        <path
          d="M46 84 43 115 55 115 62 87 69 115 83 115 77 78"
          fill="#8ca7ab"
        />
        <path d="M40 53 38 28 47 17 67 17 77 31 76 54 61 65Z" fill="#bed0cb" />
        <path d="M39 35 76 35 74 47 41 47Z" fill="#273c39" />
        <path d="M58 24v29M47 40h9m8 0h7" stroke="#e4c882" />
        <path d="M23 64 49 60 51 83 39 103 24 92Z" fill="#d2b777" />
        <path
          d="M35 70v20m-7-12h15M91 35l2 48m-8-5h16"
          stroke="#d2b777"
          stroke-width="5"
        />
        <path d="m91 17-5 21h11Z" fill="#bed0cb" />
      </template>
      <template v-else-if="kind === 'rogue'">
        <path d="M39 46 24 108 58 97 94 111 81 54Z" fill="#a9543b" />
        <path d="M44 57 39 92 55 99 74 91 72 53Z" fill="#503e45" />
        <path d="m46 94-6 23h12l10-18 10 18h12L72 90" fill="#344745" />
        <path d="M34 39Q41 7 63 14q23 8 20 32L66 59 46 51Z" fill="#79483e" />
        <path d="m43 35 29-5-5 20-19-2Z" fill="#d9b596" />
        <path d="m44 43 24-2-6 13-15-3Z" fill="#344745" />
        <path d="m31 61-12 15m61-16 12 18" stroke="#d9b596" stroke-width="9" />
        <path d="m16 49 1 26 7-3Zm83 0-10 24 7 3Z" fill="#b6ccc9" />
        <path d="m12 78 12-5m60 0 16 7" stroke="#d2b777" stroke-width="4" />
      </template>
      <template v-else-if="kind === 'alchemist'">
        <path
          d="m32 56-10 43 15 10 12-29 3 27h20l8-30 9 28 14-9-12-41Z"
          fill="#678477"
        />
        <path d="m47 103-3 14h14l4-13m10 0 4 13h14l-8-16" fill="#344745" />
        <path d="M40 48V27l13-15 20 9 7 30-19 12Z" fill="#d2b777" />
        <path d="M41 32h15l4 7 6-7h12v15H63l-4-6-5 6H42Z" fill="#354a47" />
        <circle cx="48" cy="39" r="5" fill="#a0ceba" />
        <circle cx="71" cy="39" r="5" fill="#a0ceba" />
        <path d="M51 52h19l-9 14Z" fill="#39564e" />
        <path d="m30 73-10 3-4 23 21 1-1-17-6-3Z" fill="#a1c7b4" />
        <path d="m18 91 16 1-2 7H18Z" fill="#4a8b62" />
        <path d="M81 65h9l-1 13 10 16-2 10H78l-2-10 8-16Z" fill="#d6d4a7" />
        <path d="M79 96h17v7H80Z" fill="#b78943" />
        <path d="M46 77h26m-13-8v16" stroke="#d7c698" />
      </template>
      <template v-else-if="kind === 'channeler'">
        <path d="M37 47 21 109l36-6 35 8-16-65Z" fill="#78678f" />
        <path d="m43 54 9 41 19 6 10-24-12-23" fill="#b6a4c2" />
        <path d="m47 102-6 15h16l4-15m8 0 3 15h16l-9-15" fill="#344745" />
        <path d="m37 34 17-24 26 24-6 19H44Z" fill="#594b77" />
        <path d="m46 35 25 1-4 16H50Z" fill="#ddbea3" />
        <path d="m48 44 7 1m7 0 6-1" stroke="#273c39" />
        <path d="m40 61-16 14m51-16 18-5" stroke="#ddbea3" stroke-width="7" />
        <circle cx="95" cy="40" r="12" fill="#b4d4cd" />
        <path d="m95 27 4 10 9 3-9 4-4 10-4-10-9-4 9-3Z" fill="#f0d68f" />
        <path d="M18 69v39m-4-22h8" stroke="#d2b777" stroke-width="4" />
        <path d="m18 55-6 9 6 8 6-8Z" fill="#b4d4cd" />
      </template>
      <template v-else-if="kind === 'support'">
        <path d="M30 105 40 41 60 20 80 41 91 105 60 112Z" fill="#56776e" />
        <path d="m44 39 16-14 17 15-7 30H51Z" fill="#243f3b" />
        <path d="M51 49h5m8 0h5" stroke="#e7c77c" stroke-width="4" />
        <path d="m60 73 9 13-9 14-9-14Z" fill="#e7c77c" />
        <path d="M19 35v74m-8-50h16" stroke="#ad9964" stroke-width="4" />
        <circle cx="19" cy="26" r="8" fill="#91bcad" />
        <path d="M8 11q-9 14 0 29m22-29q9 14 0 29" stroke="#829b79" />
      </template>
      <template v-else-if="kind === 'guard'">
        <path d="m30 48 17-10 37 8 13 50-20 16H43L25 92Z" fill="#677e79" />
        <path d="m45 100-2 18h16l4-17m12-2 3 19h16l-8-22" fill="#344745" />
        <path d="M42 43V22l19-12 20 13-2 27-20 11Z" fill="#a1af9d" />
        <path d="M44 31h35v10H44Z" fill="#344745" />
        <path d="M54 35h15" stroke="#d6aa69" stroke-width="4" />
        <path d="m17 65 30-6 6 35-17 20-21-16Z" fill="#9b7b51" />
        <path d="m30 72 11 21-10 9-7-17Z" fill="#d3bd87" />
        <path d="M101 34v73" stroke="#816b50" stroke-width="5" />
        <path d="m88 21 24 3-1 19-26-2Z" fill="#94a99d" />
      </template>
      <template v-else-if="kind === 'colossus'">
        <path d="m30 100-4 18h28l7-29 8 29h29l-9-25" fill="#536968" />
        <path d="m28 45 22-13 39 13 10 38-14 24-42-5-19-22Z" fill="#83988b" />
        <path
          d="m27 48-16 9-7 34 20 3 11-21m58-27 17 11 8 33-22 8-12-26"
          fill="#6c8378"
        />
        <path d="m42 30 6-19 26 2 12 20-9 17-31-2Z" fill="#a5b09b" />
        <path d="m41 19-10-8 2 19m45-13 13-9-5 24" fill="#83988b" />
        <path d="M50 31h8m9 0h8" stroke="#f3d286" stroke-width="4" />
        <path d="m55 63 9-12 11 13-10 21Z" fill="#e6c47a" />
        <path
          d="m45 54 6 10-8 12m36-20-4 10 8 11M21 68l-5 16m86-15 7 13"
          stroke="#c5d6aa"
        />
      </template>
      <template v-else-if="kind === 'sentinel'">
        <circle cx="61" cy="39" r="29" stroke="#d5b365" stroke-width="5" />
        <path
          d="m29 50-23-9 8 28 28 11m49-29 23-10-8 29-25 11"
          fill="#718584"
        />
        <path d="m42 51-14 36 15 17 20-10 17 10 15-20-14-32Z" fill="#9b8870" />
        <path d="m49 92-11 26h20l5-21 9 21h20L78 94" fill="#536968" />
        <path d="m44 24 16-12 20 13-8 28H50Z" fill="#d8c68e" />
        <path d="m49 31 10 6 13-6m-13 6v12" stroke="#324d48" stroke-width="4" />
        <path d="m61 60 10 13-10 14-9-14Z" fill="#bcd6cb" />
        <path
          d="m26 34-6-15m81 16 7-16M60 4V0"
          stroke="#d5b365"
          stroke-width="4"
        />
      </template>
      <template v-else>
        <path d="m36 54-8 51 31 4 29-4-7-53Z" fill="#8b6255" />
        <path d="m43 104-5 14h18l7-19 7 19h17l-7-16" fill="#344745" />
        <path d="m35 32 16-18 24 7 10 21-21 18-26-10Z" fill="#b7b69a" />
        <path
          d="m40 33 10 7m24-9-8 9M49 48h19"
          stroke="#344745"
          stroke-width="4"
        />
        <path d="m41 20-12-9 3 22m40-14 18-11-6 23" fill="#9b8870" />
        <path d="M98 31v81" stroke="#92734f" stroke-width="4" />
        <path d="m98 11-7 24 14-2Z" fill="#a5bbb0" />
        <path d="m27 62-12 28 16 5 10-22" fill="#a4916e" />
        <path d="m47 64 21 20 14-22" stroke="#d2b777" stroke-width="5" />
      </template>
    </g>
  </svg>
</template>
