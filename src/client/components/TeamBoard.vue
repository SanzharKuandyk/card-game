<script setup lang="ts">
import { computed, ref } from "vue";
import type { CombatView, CrewView } from "../../shared/model.ts";
import TurnClock from "./TurnClock.vue";
import { enemyStatuses, heroStatuses } from "../combat-status.ts";
import StatusEffects from "./StatusEffects.vue";
import EffectDetails from "./EffectDetails.vue";
import CombatArt from "./CombatArt.vue";
import ImpactBurst from "./ImpactBurst.vue";
import CardArt from "./CardArt.vue";
import CardText from "./CardText.vue";
import PlaybackQueue from "./PlaybackQueue.vue";
import type { CardDefinition } from "../../shared/model.ts";
import { useBoardFeedback } from "../use-board-feedback.ts";
import {
  effectText,
  impactFor,
  playbackItem,
  beforeImpact,
} from "../combat-feedback.ts";
const props = defineProps<{
  crew: CrewView;
  cards: CardDefinition[];
  connected: boolean;
  boss?: boolean;
  lobby?: boolean;
  names?: Record<string, string>;
  paused?: boolean;
  sharedCombat?: CombatView | null;
}>();
const detail = ref<HTMLDialogElement>();
const collapsed = ref(false);
const explanation = ref<{ title: string; lines: string[] } | null>(null);
const { active, stage, board, shown, upcoming, recent } = useBoardFeedback(
  () => props.crew,
  () => props.connected,
);
// Shared health follows one class-wide presentation clock, independent of
// local card playback, so every team sees the same boss health.
const enemies = computed(
  () => props.sharedCombat?.enemies ?? board.value?.enemies ?? [],
);
const intents = computed(
  () => props.sharedCombat?.intents ?? board.value?.intents ?? [],
);
const card = computed(() =>
  props.cards.find((entry) => entry.id === shown.value?.card?.id),
);
const outcomes = computed(
  () => shown.value?.events.filter((event) => event.kind !== "play") ?? [],
);
const impact = (id: string) =>
  impactFor(
    stage.value === "impact" || stage.value === "exit" ? active.value : null,
    id,
  );
const targeted = (id: string) =>
  stage.value === "windup" &&
  active.value?.events.some(
    (event) => event.kind !== "play" && event.targetId === id,
  );
const targetNames = computed(() =>
  [...new Set(outcomes.value.map((event) => name(event.targetId)))].join(", "),
);
const phase = computed(() =>
  props.lobby
    ? "Waiting"
    : props.boss
      ? "Boss"
      : ((
          {
            map: "Map",
            battle: "Fight",
            reward: "Choosing cards",
            rest: "Rest",
            shop: "Shop",
            event: "Event",
            defeat: "Retry",
            finished: "Finished",
          } as Record<string, string>
        )[props.crew.phase] ?? props.crew.phase),
);
const name = (id: string) =>
  props.crew.members.find((m) => m.id === id)?.name ??
  props.names?.[id] ??
  board.value?.enemies.find((e) => e.id === id)?.name ??
  "Ally";
const incoming = (id: string) =>
  board.value?.intents
    .flatMap((i) => i.targets)
    .filter((t) => t.memberId === id)
    .reduce((sum, t) => sum + t.damage, 0) ?? 0;
function inspectIntent(enemyId: string) {
  const intent = intents.value.find((entry) => entry.enemyId === enemyId);
  if (!intent) return;
  explanation.value = {
    title: `${name(enemyId)} · ${intent.label}`,
    lines: intent.targets.length
      ? intent.targets.map(
          (target) =>
            `${name(target.memberId)}: ${target.damage} incoming damage before Block.`,
        )
      : [intent.label],
  };
}
</script>
<template>
  <article
    class="team-screen team-board"
    :class="{ 'board-collapsed': collapsed }"
    :style="{ '--team-colour': crew.colour }"
    :aria-label="`${crew.name} board`"
  >
    <header>
      <strong>{{ crew.symbol }} {{ crew.name }}</strong
      ><span>{{ phase }} · {{ crew.row }}/15</span
      ><button
        class="quiet board-inspect"
        :aria-label="`Inspect ${crew.name}`"
        @click="detail?.showModal()"
      >
        Details
      </button>
      <button
        class="quiet board-toggle"
        :aria-label="`${collapsed ? 'Expand' : 'Collapse'} ${crew.name}`"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? "Expand" : "Collapse" }}
      </button>
    </header>
    <div class="board-turn">
      <strong>{{ board ? "Turn " + board.turn : phase }}</strong
      ><span v-if="board"
        >{{ board.actors.filter((a) => a.ended).length }}/{{
          board.actors.length
        }}
        ended</span
      ><TurnClock
        v-if="board"
        :remaining-ms="board.remainingMs"
        :paused="paused"
        :offline="!connected"
      />
    </div>
    <div class="board-enemies">
      <template v-if="board">
        <div
          v-for="enemy in enemies"
          :key="enemy.id"
          :class="{
            fallen: !enemy.hp,
            'action-target': targeted(enemy.id),
            'action-source':
              active?.sourceId === enemy.id &&
              stage !== 'impact' &&
              stage !== 'exit',
          }"
        >
          <button
            class="board-enemy-intent"
            :disabled="
              !enemy.hp || !intents.some((i) => i.enemyId === enemy.id)
            "
            :aria-label="`${enemy.name} intention`"
            @click="inspectIntent(enemy.id)"
          >
            {{
              enemy.hp
                ? intents.find((i) => i.enemyId === enemy.id)?.label
                : "Defeated"
            }}<template
              v-if="
                enemy.hp &&
                intents.find((i) => i.enemyId === enemy.id)?.targets.length
              "
            >
              ·
              {{
                intents
                  .find((i) => i.enemyId === enemy.id)!
                  .targets.map((t) => t.damage)
                  .filter((n, index, values) => values.indexOf(n) === index)
                  .join(" / ")
              }}
              damage</template
            >
          </button>
          <ImpactBurst :impact="impact(enemy.id)" :effect-key="active?.key" />
          <CombatArt
            :kind="enemy.pattern"
            :class="{
              'source-strike':
                active?.sourceId === enemy.id && stage === 'windup',
            }"
          />
          <strong>{{ enemy.name }}</strong
          ><span class="board-enemy-hp"
            >{{ enemy.hp }}/{{ enemy.maxHp }} HP</span
          >
          <span class="meter health"
            ><span :style="{ width: (enemy.hp / enemy.maxHp) * 100 + '%' }"
          /></span>
          <div class="board-status">
            <span v-if="enemy.block">{{ enemy.block }} Block</span
            ><StatusEffects
              :owner="enemy.name"
              :effects="enemyStatuses(enemy)"
            />
          </div>
        </div>
      </template>
      <p v-else class="board-location">
        {{ boss ? "Shared boss" : phase
        }}<span v-if="!board">
          · {{ crew.members.filter((m) => m.online).length }}/{{
            crew.members.length
          }}
          online</span
        >
      </p>
    </div>
    <div class="board-members">
      <div
        v-for="member in crew.members"
        :key="member.id"
        class="board-member"
        :class="{
          'action-target': targeted(member.id),
          'action-source':
            active?.sourceId === member.id &&
            stage !== 'impact' &&
            stage !== 'exit',
          'member-offline': !member.online,
        }"
      >
        <ImpactBurst :impact="impact(member.id)" :effect-key="active?.key" />
        <div class="board-person">
          <CombatArt :kind="member.character" /><strong>{{
            member.name
          }}</strong>
        </div>
        <template
          v-for="actor in board?.actors.filter(
            (a) => a.memberId === member.id,
          ) ?? []"
          :key="actor.memberId"
        >
          <b
            >{{ actor.hp }}<small>/{{ actor.maxHp }}</small></b
          ><span class="board-resources"
            >{{ actor.block }} Block · {{ actor.energy }} Energy</span
          >
          <span class="meter health"
            ><span :style="{ width: `${(actor.hp / actor.maxHp) * 100}%` }"
          /></span>
          <span class="board-readiness">{{
            !member.online
              ? "Offline"
              : actor.hp === 0
                ? "Downed"
                : actor.ended
                  ? "✓ Ended"
                  : actor.request || "Playing"
          }}</span>
          <StatusEffects
            :owner="member.name"
            :effects="heroStatuses(actor.powers)"
          />
        </template>
        <template v-if="!board?.actors.some((a) => a.memberId === member.id)"
          ><b
            >{{ member.hp }}<small>/{{ member.maxHp }}</small></b
          ><span class="board-readiness">{{
            !member.online
              ? "Offline"
              : crew.votes[member.id]
                ? "✓ Voted"
                : phase
          }}</span></template
        >
      </div>
    </div>
    <section
      class="board-playback"
      aria-label="Team action"
      :class="{
        'is-playing': !!active,
        'is-revealing': active && stage !== 'impact' && stage !== 'exit',
        'is-impact': active && (stage === 'impact' || stage === 'exit'),
        'is-exiting': active && stage === 'exit',
      }"
    >
      <PlaybackQueue
        v-if="shown"
        :upcoming="upcoming"
        :recent="recent"
        :current="playbackItem(shown, !active || !beforeImpact(stage))"
      />
      <template v-if="shown">
        <button
          v-if="active"
          :key="shown.key"
          class="board-play-card"
          :aria-label="`Inspect ${shown.title}`"
          @click="
            explanation = {
              title: shown.title,
              lines: [
                shown.card?.text ?? shown.title,
                ...outcomes.map(
                  (event) => `${name(event.targetId)}: ${effectText(event)}`,
                ),
              ],
            }
          "
        >
          <span v-if="shown.card" class="board-card-cost">{{
            shown.card.cost
          }}</span>
          <CardArt v-if="card" :card="card" />
          <div>
            <small>{{ name(shown.sourceId) }}</small
            ><strong
              >{{ shown.title }}{{ shown.card?.upgraded ? " +" : "" }}</strong
            >
          </div>
          <CardText
            v-if="shown.card"
            :text="shown.card.text"
            class="board-card-description"
          />
        </button>
        <div v-else class="board-last-play">
          <small>Last play</small><strong>{{ shown.title }}</strong
          ><span>{{ name(shown.sourceId) }}</span>
        </div>
        <p
          v-if="active && stage !== 'impact' && stage !== 'exit'"
          class="board-card-rule"
        >
          {{ shown.card ? "Playing" : "Incoming" }} → {{ targetNames }}
        </p>
        <ul v-else class="board-outcomes">
          <li v-for="event in outcomes.slice(0, 2)" :key="event.id">
            <b>{{ name(event.targetId) }}</b> ·
            <CardText :text="effectText(event)" />
          </li>
          <li v-if="outcomes.length > 2" class="board-extra">
            +{{ outcomes.length - 2 }} effects · Details
          </li>
          <li v-if="!outcomes.length">
            <CardText :text="shown.card?.text ?? 'Effect applied'" />
          </li>
        </ul>
        <strong
          v-if="
            shown.after.result &&
            (!active || stage === 'impact' || stage === 'exit')
          "
          class="board-fight-result"
          >{{
            shown.after.result === "victory"
              ? "Victory"
              : shown.after.result === "defeat"
                ? "Defeat"
                : "Fight ended"
          }}</strong
        >
      </template>
      <p v-else class="board-idle">{{ board ? "Cards appear here" : phase }}</p>
    </section>
    <dialog
      ref="detail"
      class="combat-history-dialog team-detail"
      :aria-label="crew.name + ' details'"
    >
      <header>
        <h2>{{ crew.name }} · {{ phase }}</h2>
        <button @click="detail?.close()">Close</button>
      </header>
      <div class="history-entries">
        <section v-for="member in crew.members" :key="member.id">
          <h3>
            {{ member.name }} · {{ member.online ? "Online" : "Offline" }}
          </h3>
          <template
            v-for="actor in board?.actors.filter(
              (a) => a.memberId === member.id,
            ) ?? []"
            :key="actor.memberId"
            ><p>
              {{ actor.hp }}/{{ actor.maxHp }} HP · {{ actor.block }} Block ·
              {{ actor.energy }} energy · Incoming
              {{ incoming(actor.memberId) }}
            </p>
            <p>
              Hand:
              {{
                actor.hand
                  .map((c) => c.name + " (" + c.cost + ")")
                  .join(", ") || "Empty"
              }}
            </p></template
          >
        </section>
        <h3>Recent plays</h3>
        <ol class="board-feed" aria-label="Recent plays">
          <li
            v-for="event in board?.log.slice(-12).reverse() ?? []"
            :key="event.id"
          >
            <strong>{{ name(event.sourceId) }}</strong> · {{ effectText(event)
            }}<span v-if="event.targetId !== event.sourceId">
              → {{ name(event.targetId) }}</span
            >
          </li>
        </ol>
      </div>
    </dialog>
    <EffectDetails
      v-if="explanation"
      :title="explanation.title"
      :lines="explanation.lines"
      @close="explanation = null"
    />
  </article>
</template>
