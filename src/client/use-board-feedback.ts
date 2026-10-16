import { computed, onUnmounted, watch } from "vue";
import type { CrewView } from "../shared/model.ts";
import { beforeImpact, combatBeats } from "./combat-feedback.ts";
import { usePlaybackQueue } from "./use-playback-queue.ts";
export type Board = NonNullable<CrewView["board"]>;

export function useBoardFeedback(
  getCrew: () => CrewView,
  connected: () => boolean,
) {
  const { active, last, stage, append, clear, upcoming, recent } =
    usePlaybackQueue<Board>();
  const seen = new Map<string, number>();
  let previous: Board | null = null;
  let reset = false;
  function enqueue(before: Board, after: Board) {
    const cursor =
      seen.get(after.id) ?? Math.max(0, ...before.log.map((event) => event.id));
    append(combatBeats(before, after, cursor));
    seen.set(after.id, Math.max(cursor, ...after.log.map((event) => event.id)));
  }
  watch(connected, (online) => {
    if (!online) {
      clear();
      reset = true;
    }
  });
  watch(
    getCrew,
    (crew) => {
      const current = crew.board ?? null;
      if (reset || document.hidden) {
        clear();
        previous = current;
        reset = false;
        if (current)
          seen.set(
            current.id,
            Math.max(0, ...current.log.map((event) => event.id)),
          );
        return;
      }
      if (
        previous &&
        current?.id !== previous.id &&
        crew.boardEnding?.id === previous.id
      )
        enqueue(previous, crew.boardEnding);
      if (current) {
        if (previous?.id === current.id) enqueue(previous, current);
        else {
          seen.set(
            current.id,
            Math.max(0, ...current.log.map((event) => event.id)),
          );
          last.value = null;
        }
      }
      previous = current;
    },
    { immediate: true },
  );
  function visibility() {
    if (document.hidden) {
      clear();
      reset = true;
    }
  }
  document.addEventListener("visibilitychange", visibility);
  onUnmounted(() => {
    clear();
    document.removeEventListener("visibilitychange", visibility);
  });
  const board = computed(() =>
    active.value
      ? beforeImpact(stage.value)
        ? active.value.before
        : active.value.after
      : getCrew().board,
  );
  const shown = computed(
    () =>
      active.value ??
      (last.value?.after.id === getCrew().board?.id ? last.value : null),
  );
  return { active, stage, board, shown, upcoming, recent };
}
