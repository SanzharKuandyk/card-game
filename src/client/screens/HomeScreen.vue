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
  error.value = "";
  try {
    const result = await post("/api/session", {});
    await router.push(`/host/${result.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Cannot start";
  } finally {
    creating.value = false;
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
  try {
    const r = await fetch("/api/hosting");
    if (r.ok) canHost.value = (await r.json()).canHost;
  } catch {
    // Hosting a fresh game does not depend on discovering an existing one.
  }
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
    <button
      :class="hosting ? 'primary' : 'quiet'"
      :disabled="creating"
      @click="create"
    >
      Host
    </button>
  </main>
</template>
