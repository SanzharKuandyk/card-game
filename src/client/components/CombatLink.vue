<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
const props = defineProps<{
  source?: string;
  targets: string[];
  active: boolean;
  effectKey?: string;
}>();
const svg = ref<SVGSVGElement>();
const size = ref({ width: 1, height: 1 });
const paths = ref<string[]>([]);
let observer: ResizeObserver | undefined;
function measure() {
  const parent = svg.value?.parentElement;
  if (!parent) return;
  const bounds = svg.value!.getBoundingClientRect();
  size.value = { width: bounds.width, height: bounds.height };
  const actors = [...parent.querySelectorAll<HTMLElement>("[data-combat-id]")];
  const point = (id: string | undefined) => {
    const element = actors.find((a) => a.dataset.combatId === id);
    if (!element) return null;
    const rect = (
      element.querySelector(".combat-art") ?? element
    ).getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - bounds.left,
      y: rect.top + rect.height / 2 - bounds.top,
    };
  };
  const from = point(props.source);
  paths.value = from
    ? props.targets
        .filter((id) => id !== props.source)
        .flatMap((id) => {
          const to = point(id);
          return to
            ? [
                `M ${from.x} ${from.y} Q ${Math.min(from.x, to.x) - 28} ${(from.y + to.y) / 2} ${to.x} ${to.y}`,
              ]
            : [];
        })
    : [];
}
watch(
  () => [props.effectKey, props.active],
  async () => {
    await nextTick();
    measure();
  },
);
onMounted(() => {
  observer = new ResizeObserver(measure);
  if (svg.value?.parentElement) observer.observe(svg.value.parentElement);
  measure();
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <svg
    ref="svg"
    class="combat-link"
    :class="{ active }"
    :viewBox="`0 0 ${size.width} ${size.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <path v-for="path in paths" :key="`${effectKey}:${path}`" :d="path" />
  </svg>
</template>
