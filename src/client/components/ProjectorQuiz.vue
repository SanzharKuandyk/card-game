<script setup lang="ts">
import { useGame } from "../stores/game.ts";
import QuizReplay from "./QuizReplay.vue";
import QuizTeamResults from "./QuizTeamResults.vue";
import TurnClock from "./TurnClock.vue";
const game = useGame();
</script>
<template>
  <section v-if="game.view?.quiz" class="projector-quiz">
    <header class="quiz-heading">
      <div>
        <h1>
          {{
            game.view.crews.find((c) => c.id === game.view?.quiz?.triggerCrewId)
              ?.name ?? "Host"
          }}
          ·
          {{
            game.view.quiz.triggerCrewId
              ? "reached the boss"
              : "called the boss"
          }}
        </h1>
        <span>Question {{ game.view.quiz.roundIndex + 1 }} / 2</span>
      </div>
      <TurnClock
        :remaining-ms="game.view.quiz.remainingMs"
        :paused="game.view.status === 'paused'"
        :offline="!game.connected"
      />
    </header>
    <div v-if="game.view.quiz.question" class="projector-question">
      <div>
        <h2>{{ game.view.quiz.question.prompt }}</h2>
        <p>{{ game.view.quiz.question.rule }}</p>
        <div class="quiz-options">
          <div
            v-for="o in game.view.quiz.question.options"
            :key="o.id"
            class="projector-option"
            :class="{
              correct: game.view.quiz.reveal?.correctOptionId === o.id,
            }"
          >
            <b>{{ game.view.quiz.optionLabels[o.id] }}</b
            >{{ o.text
            }}<strong v-if="game.view.quiz.reveal"
              >{{
                game.view.quiz.teams
                  .flatMap((t) => t.members)
                  .filter((m) => m.optionId === o.id).length
              }}
              answers</strong
            >
          </div>
        </div>
      </div>
      <QuizReplay
        :steps="
          game.view.quiz.reveal?.replay ?? game.view.quiz.question.setupReplay
        "
        :revealed="!!game.view.quiz.reveal"
      />
    </div>
    <div v-else class="quiz-announcement">
      <h2>
        {{
          game.view.quiz.stage === "reward"
            ? "Choose your cards"
            : "Two questions before the boss"
        }}
      </h2>
      <p>Team accuracy improves every member's card offer.</p>
    </div>
    <p v-if="game.view.quiz.reveal" class="quiz-explanation">
      {{
        game.view.quiz.reveal.explanations[
          game.view.quiz.reveal.correctOptionId
        ]
      }}
    </p>
    <QuizTeamResults :quiz="game.view.quiz" />
  </section>
</template>
