import "./style.css";
import { AfterDarkGlobe } from "./globe.js";
import { HOVER_MODES } from "./hoverModes.js";

const globe = new AfterDarkGlobe(document.querySelector(".globe"));
const ui = document.querySelector(".hover-ui");
const toggle = document.querySelector(".hover-ui__toggle");
const list = document.querySelector(".hover-ui__list");
const panel = document.querySelector("#ctrl");

list.innerHTML = HOVER_MODES.map(
  (mode) =>
    `<li><button type="button" data-mode="${mode.id}">${mode.name}</button></li>`
).join("");

function setMode(id) {
  const mode = HOVER_MODES.find((item) => item.id === id) || HOVER_MODES[0];
  globe.setHoverMode(mode.id);
  toggle.textContent = `Hover · ${mode.name}`;
  list.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.mode) === mode.id);
  });
}

function formatValue(key, value) {
  if (key === "displFactor") return Number(value).toFixed(3);
  if (key === "noiseSeed") return String(Math.round(value));
  if (key === "color1" || key === "color2") return String(value).toLowerCase();
  return Number(value).toFixed(2);
}

function syncPanel(except) {
  panel.querySelectorAll("[data-key]").forEach((input) => {
    if (input === except) return;
    const key = input.dataset.key;
    const value = globe.params[key];
    if (input.type === "color") {
      input.value = value;
      return;
    }
    if (input.type === "text" || input.type === "number") {
      input.value = formatValue(key, value);
      return;
    }
    input.value = value;
  });
}

function setParam(key, raw, source) {
  if (key === "color1" || key === "color2") {
    let hex = String(raw).trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    globe.params[key] = hex.toLowerCase();
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    globe.params[key] = n;
  }
  globe.applyParams();
  syncPanel(source);
}

toggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !ui.classList.contains("is-open");
  ui.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  list.hidden = !open;
});

list.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  setMode(Number(btn.dataset.mode));
  ui.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  list.hidden = true;
});

document.addEventListener("click", (e) => {
  if (e.target.closest(".hover-ui")) return;
  ui.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  list.hidden = true;
});

panel.querySelector(".ctrl__view").addEventListener("click", () => {
  globe.cycleView();
});

panel.querySelectorAll(".ctrl__heading").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.parentElement.classList.toggle("is-closed");
  });
});

panel.addEventListener("pointerdown", (e) => e.stopPropagation());

panel.querySelectorAll("[data-key]").forEach((input) => {
  const eventName = input.type === "text" ? "change" : "input";
  input.addEventListener(eventName, () => {
    setParam(input.dataset.key, input.value, input);
  });
});

setMode(0);
syncPanel();
