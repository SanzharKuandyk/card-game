import { computed, onUnmounted, ref, shallowRef } from "vue";
import { beatTiming, playbackItem } from "./combat-feedback.ts";
import type {
  CombatBeat,
  CombatScene,
  PlaybackStage,
} from "./combat-feedback.ts";

// Presentation only: accepted plays retain server order and cannot be edited.
export function usePlaybackQueue<T extends CombatScene>() {
  const active = shallowRef<CombatBeat<T> | null>(null);
  const last = shallowRef<CombatBeat<T> | null>(null);
  const stage = ref<PlaybackStage>("card");
  const pending = shallowRef<CombatBeat<T>[]>([]);
  const completed = shallowRef<CombatBeat<T>[]>([]);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: ReturnType<typeof setTimeout> | undefined;
  function next() {
    clearTimeout(timer);
    const [beat, ...rest] = pending.value;
    pending.value = rest;
    active.value = beat ?? null;
    if (!beat) return;
    const timing = beatTiming(rest.length, reduced.matches, !beat.card);
    const finish = () => {
      last.value = beat;
      completed.value = [beat, ...completed.value].slice(0, 3);
      next();
    };
    const impact = () => {
      stage.value = "impact";
      timer = setTimeout(() => {
        stage.value = "exit";
        timer = setTimeout(finish, beat.card ? timing.exit : 0);
      }, timing.impact);
    };
    const windup = () => {
      stage.value = "windup";
      timer = setTimeout(impact, timing.windup);
    };
    stage.value = beat.card ? "card" : "windup";
    if (beat.card) timer = setTimeout(windup, timing.card);
    else windup();
  }
  function append(beats: CombatBeat<T>[]) {
    pending.value = [...pending.value, ...beats];
    if (!active.value) next();
  }
  function clear() {
    clearTimeout(timer);
    pending.value = [];
    completed.value = [];
    active.value = last.value = null;
  }
  onUnmounted(clear);
  return {
    active,
    last,
    stage,
    append,
    clear,
    upcoming: computed(() => pending.value.map((beat) => playbackItem(beat))),
    recent: computed(() =>
      completed.value.map((beat) => playbackItem(beat, true)),
    ),
  };
}
