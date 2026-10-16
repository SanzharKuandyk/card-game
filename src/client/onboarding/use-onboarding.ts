import { computed, onUnmounted, ref, shallowRef, watch } from "vue";
import type { Ref } from "vue";
import type { CombatView, SessionView } from "../../shared/model.ts";
import { chooseLearningHint } from "./hints.ts";
import { decodeLearningProgress, emptyLearningProgress } from "./model.ts";
import type { LearningProgress } from "./model.ts";

const cache = new Map<string, Ref<LearningProgress>>();
export function useLearningProgress(getView: () => SessionView | null) {
  const key = computed(() => {
    const v = getView();
    return v?.memberId ? `learning:1:${v.id}:${v.memberId}` : "";
  });
  const progressRef = computed(() => {
    const k = key.value;
    if (!cache.has(k)) {
      let raw: string | null = null;
      try {
        if (k) raw = localStorage.getItem(k);
      } catch {
        /* Cosmetic preferences can remain in memory. */
      }
      cache.set(k, shallowRef(decodeLearningProgress(raw)));
    }
    return cache.get(k)!;
  });
  function save(value: LearningProgress) {
    if (!key.value) return;
    progressRef.value.value = value;
    try {
      localStorage.setItem(key.value, JSON.stringify(value));
    } catch {
      /* Playing never depends on storage. */
    }
  }
  function storage(e: StorageEvent) {
    if (key.value && e.key === key.value)
      progressRef.value.value = decodeLearningProgress(e.newValue);
  }
  window.addEventListener("storage", storage);
  onUnmounted(() => window.removeEventListener("storage", storage));
  return {
    progress: computed(
      () => progressRef.value.value ?? emptyLearningProgress(),
    ),
    save,
    hide: () => save({ ...progressRef.value.value, hidden: true }),
    show: () => save({ ...progressRef.value.value, hidden: false }),
  };
}

export function useOnboarding(input: {
  view: () => (SessionView & { controlling?: boolean }) | null;
  scene: () => CombatView;
  selected: () => boolean;
  blocked: () => boolean;
  connected: () => boolean;
}) {
  const preferences = useLearningProgress(input.view);
  const visible = ref(!document.hidden);
  const visibility = () => {
    visible.value = !document.hidden;
  };
  document.addEventListener("visibilitychange", visibility);
  onUnmounted(() =>
    document.removeEventListener("visibilitychange", visibility),
  );
  const hint = computed(() => {
    const v = input.view();
    const b = input.scene();
    return chooseLearningHint({
      combat: b,
      memberId: v?.memberId ?? null,
      character: v?.hero?.character ?? null,
      progress: preferences.progress.value,
      available:
        !!v &&
        input.connected() &&
        v.controlling === true &&
        v.status === "running" &&
        !v.quiz &&
        !input.blocked() &&
        visible.value &&
        v.combat?.id === b.id,
      selected: input.selected(),
      hasPlayed: b.log.some(
        (e) => e.kind === "play" && e.sourceId === v?.memberId,
      ),
    });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    () => hint.value?.id,
    (id) => {
      clearTimeout(timer);
      if (id)
        timer = setTimeout(() => {
          if (hint.value?.id !== id) return;
          const p = preferences.progress.value;
          preferences.save({ ...p, seen: [...new Set([...p.seen, id])] });
        }, 6000);
    },
    { immediate: true },
  );
  onUnmounted(() => clearTimeout(timer));
  return { ...preferences, hint };
}
