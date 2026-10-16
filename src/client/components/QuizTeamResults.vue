<script setup lang="ts">
import type { QuizView } from "../../shared/quiz-types.ts";
import { ref } from "vue";
import EffectDetails from "./EffectDetails.vue";
const props = defineProps<{ quiz: QuizView; crewId?: string }>();
const inspection = ref<{ title: string; lines: string[] } | null>(null);
function inspect(team: QuizView["teams"][number]) {
  inspection.value = {
    title: team.name,
    lines: team.members.map(
      (m) =>
        `${m.name}: ${m.optionId === undefined ? (m.submitted ? "Answer saved" : "Waiting") : m.optionId === null ? "No answer" : `${props.quiz.optionLabels[m.optionId]} · ${m.correct ? "Correct" : "Incorrect"}`}`,
    ),
  };
}
</script>
<template>
  <section
    class="quiz-team-grid"
    :class="{ 'many-teams': quiz.teams.length > 32 }"
    aria-label="Team answers"
  >
    <article
      v-for="team in quiz.teams.filter((t) => !crewId || t.id === crewId)"
      :key="team.id"
      class="quiz-team"
    >
      <button
        v-if="!crewId"
        class="quiz-team-inspect"
        :aria-label="`Inspect ${team.name} answers`"
        @click="inspect(team)"
      ></button>
      <header>
        <strong>{{ team.name }}</strong
        ><span
          >{{ team.members.filter((m) => m.submitted).length }}/{{
            team.members.length
          }}
          answered</span
        >
      </header>
      <div class="quiz-member-chips">
        <span
          v-for="m in team.members"
          :key="m.id"
          :class="{ correct: m.correct, incorrect: m.correct === false }"
          ><strong>{{ m.name }}</strong
          ><em class="quiz-member-answer">
            ·
            {{
              m.optionId === undefined
                ? m.submitted
                  ? "Ready"
                  : "…"
                : m.optionId === null
                  ? "No answer"
                  : quiz.optionLabels[m.optionId]
            }}{{ m.correct ? " ✓" : "" }}</em
          ></span
        >
      </div>
      <p v-if="team.correct !== null">
        {{ team.correct }}/{{ team.possible }} correct<span v-if="team.tier">
          ·
          {{
            team.tier === "rare"
              ? "Rare offer"
              : team.tier === "uncommon"
                ? "Uncommon offer"
                : "Standard offer"
          }}</span
        >
      </p>
    </article>
  </section>
  <EffectDetails
    v-if="inspection"
    :title="inspection.title"
    :lines="inspection.lines"
    @close="inspection = null"
  />
</template>
