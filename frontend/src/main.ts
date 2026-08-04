import { createApp } from "vue";
import App from "./App.vue";
import PaginationBar from "./components/PaginationBar.vue";
import { installElementPlus } from "./plugins/element-plus";
import { router } from "./router";
import { pinia } from "./stores";
import { useAuthStore } from "./stores/auth";
import { setUnauthorizedHandler } from "./utils/api";
import { startSessionActivityMonitor } from "./services/session-activity";
import "./styles.css";
import "./table-layout.css";

const app = createApp(App);
installElementPlus(app);
app.component("PaginationBar", PaginationBar);
app.use(pinia);

const auth = useAuthStore();
setUnauthorizedHandler(() => {
  auth.logout();
  if (router.currentRoute.value.path !== "/login") void router.replace("/login");
});
app.use(router);
app.mount("#app");
startSessionActivityMonitor(router);
