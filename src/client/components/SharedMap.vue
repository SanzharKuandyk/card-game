<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from "vue";
import { useGame } from "../stores/game.ts";
import type { MapNode } from "../../shared/model.ts";
import EffectDetails from "./EffectDetails.vue";
const props = defineProps<{ projector?: boolean; search?: string }>();
const game = useGame();
const details = ref<MapNode | null>(null);
const mapScroll = ref<HTMLElement>();
onMounted(async () => {
  await nextTick();
  if (!props.projector) {
    const target = mapScroll.value?.querySelector(
      `[data-node-id="${game.view?.progress?.nodeId ?? "r1-0"}"]`,
    );
    target?.scrollIntoView({ block: "center" });
  }
});
const v = computed(() => game.view);
const rows = computed(() =>
  Math.max(1, ...(v.value?.map.map((n) => n.row) ?? [])),
);
const allowed = computed(() =>
  v.value?.progress?.nodeId
    ? (v.value.map.find((n) => n.id === v.value?.progress?.nodeId)?.next ?? [])
    : (v.value?.map.filter((n) => n.row === 1).map((n) => n.id) ?? []),
);
const matches = (c: NonNullable<typeof game.view>["crews"][number]) =>
  !props.search?.trim() ||
  [c.name, ...c.members.map((m) => m.name)].some((s) =>
    s.toLowerCase().includes(props.search!.trim().toLowerCase()),
  );
const teams = (id: string) =>
  v.value?.crews.filter((c) => c.nodeId === id) ?? [];
function pos(n: MapNode) {
  return props.projector
    ? { x: (n.row - 0.5) * 112, y: 50 + n.lane * 105 }
    : { x: 40 + n.lane * 80, y: (rows.value - n.row + 0.5) * 115 };
}
const edges = computed(
  () =>
    v.value?.map.flatMap((n) =>
      n.next.map((id) => ({
        id: `${n.id}:${id}`,
        from: pos(n),
        to: pos(v.value!.map.find((n) => n.id === id)!),
      })),
    ) ?? [],
);
const icons: Record<string, string> = {
  battle: "⚔",
  elite: "☠",
  rest: "♨",
  event: "?",
  boss: "♛",
  shop: "◆",
};
const title = (n: MapNode) =>
  n.encounterId === "milk-cat"
    ? "Milk Cat"
    : n.kind === "boss"
      ? n.row === rows.value
        ? "Final boss"
        : "Boss"
      : n.kind === "battle"
        ? "Battle"
        : n.kind[0]!.toUpperCase() + n.kind.slice(1);
</script>
<template>
  <section class="shared-map" :class="{ 'map-projector': projector }">
    <header class="section-heading">
      <h1>Map · {{ rows }} rooms</h1>
      <span>One map · all teams</span>
    </header>
    <div ref="mapScroll" class="shared-map-scroll">
      <svg
        class="shared-map-graph"
        :viewBox="projector ? `0 0 ${rows * 112} 575` : `0 0 400 ${rows * 115}`"
        :style="{
          aspectRatio: projector ? `${rows * 112}/575` : `400/${rows * 115}`,
        }"
        role="group"
        aria-label="Shared routes"
      >
        <path
          v-for="edge in edges"
          :key="edge.id"
          :d="`M${edge.from.x} ${edge.from.y} L${edge.to.x} ${edge.to.y}`"
          class="route-edge"
        />
        <g
          v-for="n in v?.map"
          :key="n.id"
          :transform="`translate(${pos(n).x},${pos(n).y})`"
          class="route-node"
          :class="[
            n.kind,
            n.risk,
            {
              available: !projector && allowed.includes(n.id),
              visited: v?.progress?.visited.includes(n.id),
              'map-highlight': !!search?.trim() && teams(n.id).some(matches),
              'map-dimmed': !!search?.trim() && !teams(n.id).some(matches),
            },
          ]"
          role="button"
          tabindex="0"
          :aria-label="`Room ${n.row}: ${title(n)}, ${n.risk}. ${teams(n.id)
            .map((t) => t.name)
            .join(', ')}`"
          :data-node-id="n.id"
          @click="
            !projector &&
            allowed.includes(n.id) &&
            v?.progress?.phase === 'map' &&
            !v?.boss
              ? game.command({ kind: 'travel', nodeId: n.id })
              : (details = n)
          "
          @keydown.enter.prevent="
            !projector &&
            allowed.includes(n.id) &&
            v?.progress?.phase === 'map' &&
            !v?.boss
              ? game.command({ kind: 'travel', nodeId: n.id })
              : (details = n)
          "
          @keydown.space.prevent="
            !projector &&
            allowed.includes(n.id) &&
            v?.progress?.phase === 'map' &&
            !v?.boss
              ? game.command({ kind: 'travel', nodeId: n.id })
              : (details = n)
          "
        >
          <rect x="-34" y="-25" width="68" height="50" rx="12" />
          <text y="-4" class="map-symbol">{{ icons[n.kind] }}</text>
          <text y="15">{{ title(n) }}</text>
          <text y="-33" class="map-room-number">
            {{ n.row
            }}{{
              n.risk === "severe"
                ? " · !!"
                : n.risk === "dangerous"
                  ? " · !"
                  : ""
            }}
          </text>
          <g v-if="teams(n.id).length" transform="translate(0,37)">
            <rect
              x="-35"
              y="-6"
              width="70"
              height="21"
              rx="5"
              class="map-team-marker"
            />
            <text y="9">
              {{
                teams(n.id).length === 1
                  ? teams(n.id)[0]!.name.length > 10
                    ? teams(n.id)[0]!.name.slice(0, 9) + "…"
                    : teams(n.id)[0]!.name
                  : `${teams(n.id).length} teams`
              }}
            </text>
          </g>
          <circle
            v-if="!projector && v?.progress?.votes[v.memberId!] === n.id"
            cx="27"
            cy="-20"
            r="5"
            fill="#c48d2a"
          />
        </g>
      </svg>
    </div>
    <p v-if="!projector" class="map-votes">
      {{
        Object.entries(v?.progress?.votes ?? {})
          .map(
            ([id, node]) =>
              `${v?.crews.flatMap((c) => c.members).find((m) => m.id === id)?.name} → ${title(v!.map.find((n) => n.id === node)!)}`,
          )
          .join(" · ")
      }}
    </p>
    <p class="map-legend">
      ⚔ Fight · ☠ Elite · ♨ Rest · ◆ Shop · ? Event · ! Hard · !! Elite
    </p>
    <div v-if="projector" class="map-team-index">
      <span v-for="team in v?.crews.filter(matches)" :key="team.id"
        ><b :style="{ color: team.colour }"
          >{{ team.symbol }} {{ team.name }}</b
        >
        · {{ team.row || "Start" }}/{{ rows }} · {{ team.phase }}</span
      >
    </div>
    <EffectDetails
      v-if="details"
      :title="`Room ${details.row} · ${title(details)}`"
      :lines="[
        details.risk === 'severe'
          ? 'Elite: more enemy health, rare card, relic and 35 gold.'
          : details.risk === 'dangerous'
            ? 'Hard fight: 20% more enemy health.'
            : details.kind === 'shop'
              ? 'Personal stock: buy cards, relics or remove a card.'
              : details.kind === 'rest'
                ? 'Heal, upgrade or remove a card.'
                : details.kind === 'boss'
                  ? 'The first team calls everyone. Two questions, then a shared boss.'
                  : 'Choose your route before travelling.',
        `Next: ${details.next.map((id) => title(v!.map.find((n) => n.id === id)!)).join(' / ') || 'Finish'}`,
        ...teams(details.id).map(
          (t) => `${t.name} · ${t.members.map((m) => m.name).join(', ')}`,
        ),
        ...Object.entries(v?.progress?.votes ?? {})
          .filter(([, id]) => id === details!.id)
          .map(
            ([id]) =>
              `${v!.crews.flatMap((c) => c.members).find((m) => m.id === id)?.name} voted here`,
          ),
      ]"
      @close="details = null"
      ><button
        v-if="
          !projector &&
          allowed.includes(details.id) &&
          v?.progress?.phase === 'map'
        "
        class="primary"
        :disabled="
          game.busy ||
          !game.connected ||
          !v?.controlling ||
          v.status !== 'running' ||
          !!v.boss
        "
        @click="
          game.command({ kind: 'travel', nodeId: details!.id });
          details = null;
        "
      >
        Vote · {{ title(details) }}
      </button></EffectDetails
    >
  </section>
</template>
