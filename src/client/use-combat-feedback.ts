import { computed, onUnmounted, ref, watch } from "vue";
import type { CombatView, SessionView } from "../shared/model.ts";
import { beforeImpact, combatBeats } from "./combat-feedback.ts";
import { usePlaybackQueue } from "./use-playback-queue.ts";

export function useCombatFeedback(
  getView: () => SessionView | null,
  isConnected: () => boolean,
) {
  const {
    active,
    last,
    stage,
    append,
    clear: clearQueue,
    upcoming,
    recent,
  } = usePlaybackQueue<CombatView>();
  const seen = new Map<string, number>();
  let previous: CombatView | null = null;
  let resetOnSnapshot = false;
  const skipped = ref(0);

  function clear() {
    clearQueue();
    skipped.value = 0;
  }
  function enqueue(before: CombatView, after: CombatView) {
    const cursor =
      seen.get(after.id) ?? Math.max(0, ...before.log.map((e) => e.id));
    const beats = combatBeats(before, after, cursor);
    seen.set(after.id, Math.max(cursor, ...after.log.map((e) => e.id)));
    append(beats);
  }
  watch(isConnected, (connected) => {
    if (!connected) {
      clear();
      resetOnSnapshot = true;
    }
  });
  watch(
    getView,
    (view) => {
      if (!view) {
        clear();
        previous = null;
        seen.clear();
        return;
      }
      if (view.quiz) {
        clear();
        previous = null;
        return;
      }
      const current = view.combat;
      if (resetOnSnapshot || document.hidden) {
        clear();
        previous = current;
        resetOnSnapshot = false;
        if (current)
          seen.set(current.id, Math.max(0, ...current.log.map((e) => e.id)));
        return;
      }
      if (previous && current?.id !== previous.id) {
        const ending = view.combatEndings?.find(
          (entry) => entry.id === previous!.id,
        );
        if (ending)
          enqueue(previous, {
            ...previous,
            ...ending,
            phase: "result",
            hand: [],
            choices: [],
          });
      }
      if (current) {
        if (previous?.id === current.id) enqueue(previous, current);
        else seen.set(current.id, Math.max(0, ...current.log.map((e) => e.id)));
      }
      previous = current;
    },
    { immediate: true },
  );

  function visibility() {
    if (document.hidden) {
      clear();
      resetOnSnapshot = true;
    }
  }
  document.addEventListener("visibilitychange", visibility);
  onUnmounted(() => {
    clear();
    document.removeEventListener("visibilitychange", visibility);
  });
  const scene = computed(() =>
    active.value
      ? beforeImpact(stage.value)
        ? active.value.before
        : active.value.after
      : (getView()?.combat ?? null),
  );
  const held = computed(() =>
    active.value &&
    (active.value.after.result ||
      active.value.after.id !== getView()?.combat?.id)
      ? active.value.after
      : null,
  );
  return { active, last, stage, scene, held, skipped, upcoming, recent };
}
