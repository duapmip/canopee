import { shadeColor } from "./story-palette.js";
import { pairPresentationWindows } from "./presentation-speaker.js";

const byId = id => document.getElementById(id);
const stage = byId("deck");
const slides = [...stage.querySelectorAll(".slide")];
const previous = byId("prev-slide");
const next = byId("next-slide");
const contents = byId("contents-dialog");
const allNotes = byId("notes-dialog");
const speakerMode = new URLSearchParams(location.search).get("orateur") === "1";
const fullButton = byId("screen-toggle");
const status = byId("deck-status");
const pad = value => String(value).padStart(2, "0");
let current = -1;
let updateCompanion;

function heading(slide) {
  const copy = slide.querySelector("h1, h2").cloneNode(true);
  copy.querySelectorAll("br").forEach(br => br.replaceWith(" "));
  return copy.textContent.replace(/\s+/g, " ").trim();
}

function notes(slide) {
  return byId("oral").content.querySelector(`[data-for="${slide.id}"]`).cloneNode(true);
}
if (speakerMode) {
  document.body.classList.add("speaker-mode");
  document.title = "Notes orateur — Canopée";
  document.querySelector(".deck-brand > span").textContent = "Vue orateur";
  byId("speaker-panel").hidden = false;
  for (const slide of slides) {
    const title = document.createElement("h3");
    title.textContent = heading(slide);
    byId("all-notes").append(title, notes(slide));
  }
  byId("all-notes-toggle").addEventListener("click", () => allNotes.showModal());
}

// The anchors also work as ordinary shareable URLs, including on reload.
const progressLinks = [];
const contentsLinks = [];
for (const [index, slide] of slides.entries()) {
  const link = document.createElement("a");
  link.href = "#" + slide.id;
  link.title = slide.dataset.chapter;
  link.setAttribute("aria-label", `Diapositive ${index + 1} · ${slide.dataset.chapter}`);
  byId("progress").append(link);
  progressLinks.push(link);

  const item = document.createElement("li");
  const entry = document.createElement("a");
  entry.href = link.href;
  const number = document.createElement("span");
  number.textContent = pad(index + 1);
  entry.append(number, slide.dataset.chapter);
  item.append(entry);
  byId("slide-list").append(item);
  contentsLinks.push(entry);
}

function display(index, notify = true) {
  if (index === current) return;
  const focusInsideSlide = stage.contains(document.activeElement);
  current = index;
  slides.forEach((slide, i) => {
    slide.hidden = speakerMode || i !== index;
    for (const link of [progressLinks[i], contentsLinks[i]]) {
      if (i === index) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    }
  });
  previous.disabled = index === 0;
  next.disabled = index === slides.length - 1;
  byId("current").textContent = pad(index + 1);
  stage.scrollTop = 0;
  const slide = slides[index];
  const title = heading(slide);
  if (speakerMode) {
    byId("speaker-title").textContent = title;
    byId("speaker-notes").replaceChildren(notes(slide));
    byId("speaker-next").textContent = slides[index + 1] ? "À suivre · " + heading(slides[index + 1]) : "";
  }
  status.textContent = `Diapositive ${index + 1} sur ${slides.length}. ${title}`;
  updateCompanion?.(slide.id, notify);
  if (focusInsideSlide) stage.focus({ preventScroll: true });
}

function fromURL() {
  display(Math.max(0, slides.findIndex(slide => "#" + slide.id === location.hash)));
}
function goTo(index) {
  if (index < 0 || index >= slides.length || index === current) return;
  history.pushState(null, "", "#" + slides[index].id);
  display(index);
}
byId("contents-toggle").addEventListener("click", () => {
  contents.showModal();
  contentsLinks[current].focus();
});
contents.addEventListener("click", event => {
  if (event.target !== contents) return;
  const bounds = contents.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) contents.close();
});
for (const links of [progressLinks, contentsLinks]) {
  links.forEach((link, i) => link.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (contents.open) contents.close();
    goTo(i);
  }));
}
previous.addEventListener("click", () => goTo(current - 1));
next.addEventListener("click", () => goTo(current + 1));
window.addEventListener("popstate", fromURL);
window.addEventListener("hashchange", fromURL);

const hourButtons = [...document.querySelectorAll("[data-atlas-index]")];
const hexagons = [...document.querySelectorAll("[data-shades]")].map(path => ({
  path, values: path.dataset.shades.split(",").map(value => value === "" ? null : Number(value)),
}));
function showHour(index) {
  const selected = hourButtons[index];
  hourButtons.forEach(button => button.setAttribute("aria-pressed", String(button === selected)));
  for (const { path, values } of hexagons) path.setAttribute("fill", shadeColor(values[index]));
  byId("atlas-reading").textContent = selected.dataset.summary;
  status.textContent = selected.dataset.summary;
}
hourButtons.forEach((button, i) => {
  button.addEventListener("click", () => showHour(i));
  button.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.stopPropagation();
    event.preventDefault();
    const target = Math.max(0, Math.min(hourButtons.length - 1, i + (event.key === "ArrowLeft" ? -1 : 1)));
    hourButtons[target].focus();
    showHour(target);
  });
});

const root = document.documentElement;
const nativeScreen = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;
let inWindow = false;
let idleTimer;

function wakeControls() {
  clearTimeout(idleTimer);
  document.body.classList.remove("controls-idle");
  if (document.body.classList.contains("is-presenting")) {
    idleTimer = setTimeout(() => document.body.classList.add("controls-idle"), 2800);
  }
}
function syncScreen() {
  const presenting = Boolean(nativeScreen() || inWindow);
  document.body.classList.toggle("is-presenting", presenting);
  fullButton.setAttribute("aria-pressed", String(presenting));
  const label = presenting ? "Quitter" : canFullscreen ? "Plein écran" : "Présenter";
  fullButton.querySelector("span").textContent = label;
  fullButton.title = presenting ? "Quitter la présentation (F ou Échap)" : label + " (F)";
  fullButton.querySelector("use").setAttribute("href", presenting ? "#collapse" : "#expand");
  wakeControls();
}
async function toggleScreen() {
  if (nativeScreen()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    await exit.call(document);
  } else if (inWindow) {
    inWindow = false;
  } else {
    const enter = root.requestFullscreen || root.webkitRequestFullscreen;
    try {
      if (canFullscreen && enter) await enter.call(root);
      else inWindow = true;
    } catch {
      inWindow = true;
    }
    if (inWindow) status.textContent = "Mode présentation dans cette fenêtre.";
  }
  syncScreen();
}
fullButton.addEventListener("click", toggleScreen);
document.addEventListener("fullscreenchange", syncScreen);
document.addEventListener("webkitfullscreenchange", syncScreen);
for (const type of ["pointermove", "pointerdown", "focusin"]) {
  document.addEventListener(type, () => {
    if (document.body.classList.contains("is-presenting")) wakeControls();
  }, { passive: true });
}

document.addEventListener("keydown", event => {
  if (event.defaultPrevented || contents.open || allNotes.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest("input, textarea, select, [contenteditable=true]")) return;
  wakeControls();
  if (event.key === " " && event.target.closest("button, a")) return;
  switch (event.key) {
    case "ArrowRight": case "PageDown": case " ": goTo(current + (event.shiftKey ? -1 : 1)); break;
    case "ArrowLeft": case "PageUp": goTo(current - 1); break;
    case "Home": goTo(0); break;
    case "End": goTo(slides.length - 1); break;
    case "f": case "F": if (!event.repeat) toggleScreen(); break;
    case "Escape": if (!nativeScreen() && !inWindow) return; toggleScreen(); break;
    default: return;
  }
  event.preventDefault();
});

let touchStart;
stage.addEventListener("touchstart", event => {
  touchStart = event.touches.length === 1 && !event.target.closest("a, button") ? event.touches[0] : null;
}, { passive: true });
stage.addEventListener("touchcancel", () => { touchStart = null; });
stage.addEventListener("touchend", event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.clientX;
  const dy = event.changedTouches[0].clientY - touchStart.clientY;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) goTo(current + (dx < 0 ? 1 : -1));
}, { passive: true });

stage.tabIndex = -1;
document.body.classList.add("deck-ready");
document.querySelector(".deck-footer").hidden = false;
fullButton.hidden = false;
byId("total").textContent = pad(slides.length);
fromURL();
syncScreen();
updateCompanion = pairPresentationWindows(byId("speaker-toggle"), speakerMode, () => slides[current].id, id => {
  const index = slides.findIndex(slide => slide.id === id);
  if (index < 0 || index === current) return;
  history.replaceState(null, "", "#" + id);
  display(index, false);
});
