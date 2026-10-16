<script setup lang="ts">
import type { ActorView } from "../../shared/model.ts";
import CombatArt from "./CombatArt.vue";
import ImpactBurst from "./ImpactBurst.vue";
import StatusEffects from "./StatusEffects.vue";
import { heroStatuses } from "../combat-status.ts";
defineProps<{
  actor: ActorView;
  selected?: boolean;
  own?: boolean;
  damage?: number;
  selectable?: boolean;
  impact?: { label: string; tone: string; lost?: number; blocked?: number };
  effectKey?: string;
  previousHp?: number;
  acting?: boolean;
  targeted?: boolean;
}>();
defineEmits<{ select: [] }>();
</script>
<template>
  <div class="hero-unit">
    <button
      class="hero"
      :class="[
        actor.character,
        {
          selected,
          own,
          downed: actor.hp === 0,
          'action-source': acting,
          'action-target': targeted,
        },
      ]"
      :data-combat-id="actor.memberId"
      :disabled="!selectable"
      :aria-label="`${own ? 'Your character: ' : ''}${actor.name}, ${actor.character}, ${actor.hp} of ${actor.maxHp} health, ${actor.block} Block`"
      :aria-pressed="selected"
      @click="$emit('select')"
    >
      <ImpactBurst v-if="impact" :impact="impact" :effect-key="effectKey" />
      <span v-if="own" class="you-label">YOU</span>
      <CombatArt class="hero-avatar" :kind="actor.character" />
      <strong>{{ actor.name }}</strong
      ><span class="hero-hp"
        >{{ actor.hp }}/{{ actor.maxHp }}
        <span class="health-unit">HP</span></span
      ><span class="meter health"
        ><span
          v-if="previousHp !== undefined"
          :key="effectKey"
          class="health-trail"
          :style="{ width: `${(previousHp / actor.maxHp) * 100}%` }" />
        <span :style="{ width: `${(actor.hp / actor.maxHp) * 100}%` }"
      /></span>
      <span class="hero-block" :class="{ 'no-block': !actor.block }"
        >{{ actor.block }} Block</span
      ><span class="meter block"
        ><span
          :style="{
            width: `${Math.min(100, (actor.block / actor.maxHp) * 100)}%`,
          }"
      /></span>
      <small>{{
        actor.hp === 0
          ? "Downed"
          : actor.ended
            ? "Ended"
            : `${actor.energy} energy`
      }}</small
      ><span v-if="damage" class="incoming">↓ {{ damage }}</span
      ><span v-if="actor.request" class="request">{{ actor.request }}</span>
    </button>
    <StatusEffects :effects="heroStatuses(actor.powers)" :owner="actor.name" />
  </div>
</template>
