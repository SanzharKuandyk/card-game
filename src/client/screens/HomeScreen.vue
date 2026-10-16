<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
const route = useRoute(),
  router = useRouter();
const code = ref(String(route.params.code ?? ""));
const name = ref("");
const error = ref("");
const showHost = ref(false);
const canHost = ref(false);
const creating = ref(false);
const hosting = computed(
  () => showHost.value || (!route.params.code && canHost.value),
);
const sessions = ref<{ id: string; code: string; status: string }[]>([]);
async function post(path: string, body: object) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.message);
  return result;
}
async function join() {
  try {
    const result = await post("/api/join", {
      code: code.value.trim(),
      name: name.value.trim(),
    });
    await router.push(`/play/${result.sessionId}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Cannot join";
  }
}
async function create() {
  if (creating.value) return;
  creating.value = true;
  try {
    const result = await post("/api/session", {});
    await router.push(`/host/${result.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Cannot start";
  } finally {
    creating.value = false;
  }
}
async function recover(id: string) {
  try {
    await post("/api/recover", { sessionId: id });
    await router.push(`/host/${id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Cannot recover";
  }
}
onMounted(async () => {
  if (
    location.hash === "#host" ||
    new URLSearchParams(location.hash.slice(1)).has("host")
  ) {
    history.replaceState(null, "", location.pathname);
    showHost.value = true;
  }
  const r = await fetch("/api/hosting");
  const access = await r.json();
  canHost.value = access.canHost;
  if (access.session) sessions.value = [access.session];
});
</script>
<template>
  <main class="entry">
    <span class="entry-mark" aria-hidden="true">♠</span>
    <h1>{{ hosting ? "Host" : "Join" }}</h1>
    <form v-if="!hosting" @submit.prevent="join">
      <label
        >Code<input
          v-model="code"
          name="code"
          autocomplete="off"
          maxlength="8"
          required /></label
      ><label
        >Name<input
          v-model="name"
          name="name"
          autocomplete="given-name"
          maxlength="24"
          required /></label
      ><button class="primary" type="submit">Join</button>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <button v-if="!hosting" class="quiet" @click="showHost = true">Host</button>
    <section v-if="hosting" class="host-entry">
      <button class="primary" :disabled="creating" @click="create">
        New game</button
      ><button v-for="s in sessions" :key="s.id" @click="recover(s.id)">
        Resume {{ s.code }}
      </button>
    </section>
  </main>
</template>
