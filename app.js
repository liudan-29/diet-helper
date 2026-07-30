import { createCooking } from "./lib/cooking-ui.js";
import {
  readActiveModule,
  readStore,
  saveActiveModule,
} from "./lib/local-store.js";
import { createProfile } from "./lib/profile-ui.js";
import { createRecords } from "./lib/records-ui.js";
import { createWhereToEat } from "./lib/where-to-eat.js";

const MODULES = ["eat", "cook", "records", "mine"];
const MODULE_TITLES = {
  eat: "去哪吃",
  cook: "自己做",
  records: "记一笔",
  mine: "我的",
};
const scrollPositions = Object.fromEntries(MODULES.map((name) => [name, 0]));
let activeModule = readActiveModule(MODULES);
const initialStore = readStore();

document.querySelector("#storageWarning").hidden = !initialStore.recovered;

const records = createRecords();
let whereToEat;
let cooking;
let profile;

const openRecordEditor = (prefill) => {
  openModule("records");
  records.openEditor(prefill);
};

whereToEat = createWhereToEat({ openRecordEditor, openModule });
cooking = createCooking({ openRecordEditor });
profile = createProfile({
  openModule,
  openRestaurant: (id) => whereToEat.openRestaurant(id),
  openPlan: (id) => cooking.openPlan(id),
  reuseRequest: (id) => whereToEat.reuseRequest(id),
  reusePlan: (id) => cooking.reusePlan(id),
  openRecord: (id) => records.openRecord(id),
});

document.querySelectorAll("[data-module-target]").forEach((button) => {
  button.addEventListener("click", () => openModule(button.dataset.moduleTarget));
});

window.addEventListener("popstate", (event) => {
  const target = MODULES.includes(event.state?.module) ? event.state.module : "eat";
  openModule(target, { fromHistory: true });
});

window.addEventListener("storage", (event) => {
  if (event.key === "diet-helper-data") {
    records.refresh();
    profile.refresh();
    whereToEat.refresh();
  }
});

openModule(activeModule, { replaceHistory: true, initial: true });

function openModule(target, options = {}) {
  const next = MODULES.includes(target) ? target : "eat";
  if (activeModule === "records" && next !== "records" && !records.canLeave()) return false;
  if (!options.initial) scrollPositions[activeModule] = window.scrollY;
  activeModule = next;
  document.querySelectorAll("[data-module]").forEach((section) => {
    const active = section.dataset.module === next;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-module-target]").forEach((button) => {
    const active = button.dataset.moduleTarget === next;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#moduleTitle").textContent = MODULE_TITLES[next];
  document.querySelector("#locationButton").hidden = next !== "eat";
  saveActiveModule(next);
  if (next === "records") records.refresh();
  if (next === "mine") profile.refresh();
  if (next === "eat") whereToEat?.refresh();
  if (!options.fromHistory) {
    const method = options.replaceHistory ? "replaceState" : "pushState";
    history[method]({ module: next }, "", `#${next}`);
  }
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollPositions[next], behavior: "auto" });
    if (!options.initial) {
      document.querySelector(`#module-${next} h1`)?.focus({ preventScroll: true });
    }
  });
  return true;
}
