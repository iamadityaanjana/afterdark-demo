import "./style.css";
import { AfterDarkGlobe } from "./globe.js";
import { HOVER_MODES } from "./hoverModes.js";

const globe = new AfterDarkGlobe(document.querySelector(".globe"));
const ui = document.querySelector(".hover-ui");
const toggle = document.querySelector(".hover-ui__toggle");
const list = document.querySelector(".hover-ui__list");
const panel = document.querySelector("#ctrl");

const SECTIONS = [
  {
    id: "corona",
    title: "Stellar Corona",
    open: true,
    rows: [
      { key: "displFactor", label: "Strength", min: 0, max: 0.01, step: 0.0001, digits: 3 },
      { key: "expandFactor", label: "Expand", min: 0, max: 2, step: 0.01, digits: 2 },
      { key: "mixFactor", label: "Mix", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "scaleFactor", label: "Scale", min: 0, max: 40, step: 0.01, digits: 2 },
      { key: "noiseSeed", label: "Noise Seed", min: 1, max: 10000, step: 1, digits: 0 },
      { key: "noiseScale", label: "Noise Scale", min: 1, max: 20, step: 0.01, digits: 2 },
      { key: "noiseSpeed", label: "Noise Speed", min: 0, max: 0.2, step: 0.001, digits: 2 },
      { key: "noiseEvolveSpeed", label: "Evolve", min: 0, max: 8, step: 0.01, digits: 2 },
    ],
  },
  {
    id: "color",
    title: "Color",
    open: true,
    rows: [
      { key: "color1", label: "Primary", type: "color" },
      { key: "color2", label: "Secondary", type: "color" },
      { key: "background", label: "Background", type: "color" },
    ],
  },
  {
    id: "globe",
    title: "Globe",
    open: false,
    rows: [
      { key: "globeCover", label: "Cover", min: 0.45, max: 1, step: 0.01, digits: 2 },
      { key: "landBoost", label: "Land Boost", min: 0, max: 2, step: 0.01, digits: 2 },
      { key: "mapStrength", label: "Map Str", min: 0, max: 3, step: 0.01, digits: 2 },
      { key: "mapBlur", label: "Map Blur", min: 0, max: 8, step: 0.1, digits: 1 },
      { key: "sphereInvert", label: "Invert", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "sphereAdd", label: "Sphere Add", min: 0, max: 2, step: 0.01, digits: 2 },
      { key: "sphereMaskBlur", label: "Mask Blur", min: 0, max: 32, step: 1, digits: 0 },
    ],
  },
  {
    id: "levels",
    title: "Levels",
    open: false,
    rows: [
      { key: "levelsBlack", label: "Black", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "levelsWhite", label: "White", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "gamma", label: "Gamma", min: 0.2, max: 3, step: 0.01, digits: 2 },
      { key: "innerNoiseAmount", label: "In Amount", min: 0, max: 2, step: 0.01, digits: 2 },
      { key: "innerNoiseBlur", label: "In Blur", min: 0, max: 24, step: 1, digits: 0 },
      { key: "innerNoiseBlack", label: "In Black", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "innerNoiseWhite", label: "In White", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "innerNoiseGamma", label: "In Gamma", min: 0.2, max: 4, step: 0.01, digits: 2 },
    ],
  },
  {
    id: "motion",
    title: "Motion",
    open: false,
    rows: [
      { key: "autoRotateEnabled", label: "Auto Spin", type: "bool" },
      { key: "autoRotateSpeed", label: "Spin Speed", min: 0, max: 30, step: 0.1, digits: 1 },
      { key: "mouseInteract", label: "Hover Fx", type: "bool" },
      { key: "mouseStrength", label: "Hover Str", min: 0, max: 2, step: 0.01, digits: 2 },
      { key: "mouseRadius", label: "Hover Rad", min: 0.02, max: 0.4, step: 0.01, digits: 2 },
      { key: "hoverExpandIncr", label: "Hov Expand", min: 0, max: 1, step: 0.01, digits: 2 },
      { key: "hoverDisplIncr", label: "Hov Disp", min: 0, max: 0.005, step: 0.0001, digits: 4 },
      { key: "trailAmount", label: "Trail", min: 0, max: 1, step: 0.01, digits: 2 },
    ],
  },
];

const rowByKey = Object.fromEntries(SECTIONS.flatMap((s) => s.rows.map((r) => [r.key, r])));

function rowHtml(row) {
  if (row.type === "color") {
    return `<label class="ctrl__row ctrl__row--color">
      <span>${row.label}</span>
      <input type="color" data-key="${row.key}" />
      <input type="text" data-key="${row.key}" spellcheck="false" />
    </label>`;
  }
  if (row.type === "bool") {
    return `<label class="ctrl__row ctrl__row--check">
      <span>${row.label}</span>
      <input type="checkbox" data-key="${row.key}" />
    </label>`;
  }
  return `<label class="ctrl__row">
    <span>${row.label}</span>
    <input type="range" data-key="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}" />
    <input type="number" data-key="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}" />
  </label>`;
}

panel.insertAdjacentHTML(
  "beforeend",
  SECTIONS.map(
    (section) => `<section class="ctrl__section${section.open ? "" : " is-closed"}" data-section="${section.id}">
      <button class="ctrl__heading" type="button">
        ${section.title}
        <span class="ctrl__fold" aria-hidden="true">()</span>
      </button>
      <div class="ctrl__body">${section.rows.map(rowHtml).join("")}</div>
    </section>`
  ).join("")
);

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
  const row = rowByKey[key];
  if (!row || row.type === "color") return String(value).toLowerCase();
  if (row.type === "bool") return value ? "1" : "0";
  const digits = row.digits ?? 2;
  if (digits === 0) return String(Math.round(Number(value)));
  return Number(value).toFixed(digits);
}

function syncPanel(except) {
  panel.querySelectorAll("[data-key]").forEach((input) => {
    if (input === except) return;
    const key = input.dataset.key;
    const value = globe.params[key];
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
      return;
    }
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
  const row = rowByKey[key];
  if (row?.type === "color") {
    let hex = String(raw).trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    globe.params[key] = hex.toLowerCase();
  } else if (row?.type === "bool") {
    globe.params[key] = Boolean(raw);
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
    const value = input.type === "checkbox" ? input.checked : input.value;
    setParam(input.dataset.key, value, input);
  });
});

setMode(0);
syncPanel();
