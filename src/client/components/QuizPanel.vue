<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useGame } from "../stores/game.ts";
import QuizReplay from "./QuizReplay.vue";
import QuizTeamResults from "./QuizTeamResults.vue";
import TurnClock from "./TurnClock.vue";
import RewardPanel from "./RewardPanel.vue";
const game = useGame();
const selected = ref("");
const q = computed(() => game.view?.quiz);
watch(
  () => `${q.value?.id}:${q.value?.phaseRevision}`,
  () => (selected.value = ""),
);
const trigger = computed(
  () => game.view?.crews.find((c) => c.id === q.value?.triggerCrewId)?.name,
);
async function confirm() {
  const quiz = q.value;
  if (!quiz?.question || !selected.value) return;
  await game.command({
    kind: "quiz:answer",
    quizId: quiz.id,
    questionId: quiz.question.id,
    phaseRevision: quiz.phaseRevision,
    optionId: selected.value,
  });
}
</script>
<template>
  <section v-if="q" class="quiz-panel">
    <header class="quiz-heading">
      <div>
        <strong>{{
          trigger ? `${trigger} reached the boss` : "Called by host"
        }}</strong
        ><span>Question {{ q.roundIndex + 1 }} / 2</span>
      </div>
      <TurnClock
        :remaining-ms="q.remainingMs"
        :paused="game.view?.status === 'paused'"
        :offline="!game.connected"
      />
    </header>
    <template v-if="q.stage === 'announce'"
      ><h1>Boss</h1>
      <p>
        Two questions. Your team's answers improve everyone's card choices.
      </p></template
    >
    <template v-else-if="q.question"
      ><h1>{{ q.question.prompt }}</h1>
      <p class="quiz-rule">{{ q.question.rule }}</p>
      <QuizReplay
        :steps="q.reveal?.replay ?? q.question.setupReplay"
        :revealed="!!q.reveal"
      />
      <div class="quiz-options">
        <button
          v-for="o in q.question.options"
          :key="o.id"
          :aria-pressed="selected === o.id || q.ownAnswer === o.id"
          :class="{
            correct: q.reveal?.correctOptionId === o.id,
            selected: selected === o.id || q.ownAnswer === o.id,
          }"
          :disabled="
            q.stage !== 'answer' ||
            !!q.ownAnswer ||
            !q.enrolled ||
            !game.view?.controlling ||
            !game.connected
          "
          @click="selected = o.id"
        >
          <b>{{ q.optionLabels[o.id] }}</b
          ><span>{{ o.text }}</span>
        </button>
      </div>
      <p v-if="q.reveal" class="quiz-explanation">
        {{ q.reveal.explanations[q.ownAnswer ?? q.reveal.correctOptionId] }}
        <strong
          >Boss turn {{ q.roundIndex === 0 ? 2 : 4 }}: {{ q.reveal.reduction }}%
          less incoming damage.</strong
        >
      </p>
    </template>
    <template v-else-if="q.stage === 'reward'"
      ><h1>Cards</h1>
      <RewardPanel v-if="game.view?.rewards.length" />
      <p v-else>Choices saved. Boss starts shortly.</p></template
    >
    <QuizTeamResults :quiz="q" :crew-id="game.view?.crewId ?? undefined" />
    <footer
      v-if="q.stage === 'answer' || q.stage === 'demonstrate'"
      class="quiz-footer"
    >
      <span>{{
        !q.enrolled
          ? "Watching"
          : q.ownAnswer
            ? "Answer saved"
            : q.stage === "demonstrate"
              ? "Watch the setup"
              : "Choose, then confirm"
      }}</span
      ><button
        class="primary"
        :disabled="
          q.stage !== 'answer' ||
          !selected ||
          !!q.ownAnswer ||
          !q.enrolled ||
          game.busy ||
          !game.connected ||
          !game.view?.controlling ||
          game.view.status !== 'running'
        "
        @click="confirm"
      >
        {{ q.ownAnswer ? "Saved" : "Confirm" }}
      </button>
    </footer>
  </section>
</template>
