import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import HomeScreen from "./screens/HomeScreen.vue";
import ShopScreen from "./screens/ShopScreen.vue";
import PlayerScreen from "./screens/PlayerScreen.vue";
import HostScreen from "./screens/HostScreen.vue";
import ProjectorScreen from "./screens/ProjectorScreen.vue";
import "./styles/main.css";
import "./styles/combat-scene.css";
import "./styles/cards.css";
import "./styles/combat-readability.css";
import "./styles/projector.css";
import "./styles/playback-queue.css";
import "./styles/expansion.css";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeScreen },
    { path: "/join/:code", component: HomeScreen },
    { path: "/play/:id/shop/:shopId", component: ShopScreen },
    { path: "/play/:id", component: PlayerScreen },
    { path: "/host/:id", component: HostScreen },
    { path: "/projector/:id", component: ProjectorScreen },
    { path: "/results/:id", component: PlayerScreen },
  ],
});
createApp(App).use(createPinia()).use(router).mount("#app");
