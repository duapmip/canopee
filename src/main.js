import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import maplibregl from "maplibre-gl";
import { pct } from "./annotations.js";
import { createRouter, indexBuildings } from "./router.js";
import "./style.css";

const scene = await fetch("data/scene.json").then((r) => r.json());
const treeMeta = await fetch("data/tree-cover.json").then((r) => r.json());
const params = new URLSearchParams(location.search);
let hour = Number(params.get("h"));
if (!scene.hours.includes(hour)) hour = 16;

let season = "ete";
let view = "today";
let pointA = null;
let pointB = null;
let selectedStop = null;
let markerA = null;
let markerB = null;
let router = null;
let buildings = null;
let farKey = "";
const EMPTY = { type: "FeatureCollection", features: [] };
let amenities = EMPTY;
let stationCollection = EMPTY;
let showAllStations = false;

const el = {
  nombre: document.getElementById("heure-nombre"),
  range: document.getElementById("heure"),
  direct: document.getElementById("direct"),
  precedent: document.getElementById("precedent"),
  suivant: document.getElementById("suivant"),
  methode: document.getElementById("methode"),
  corps: document.getElementById("methode-corps"),
  resultat: document.getElementById("trajet-resultat"),
  ete: document.getElementById("saison-ete"),
  hiver: document.getElementById("saison-hiver"),
  today: document.getElementById("vue-aujourdhui"),
  future: document.getElementById("vue-future"),
  explanation: document.getElementById("vue-explication"),
  contexte: document.getElementById("trajet-contexte"),
  water: document.getElementById("couche-eau"),
  cool: document.getElementById("couche-frais"),
  parks: document.getElementById("couche-parcs"),
  stations: document.getElementById("couche-stations"),
  insights: document.getElementById("constats"),
  stationSearch: document.getElementById("chercher-station"),
  stationCount: document.getElementById("stations-compte"),
  stationList: document.getElementById("stations-liste"),
  stationAll: document.getElementById("stations-toutes"),
};

const SHADE_COLOR = ["interpolate", ["linear"], ["get", "s"], 0, "#d06a14", 0.5, "#8a5a3a", 1, "#0e2f46"];

function padding() {
  if (window.innerWidth < 760) {
    return { top: Math.round(window.innerHeight * 0.62), right: 10, bottom: 10, left: 10 };
  }
  return { top: 24, right: 24, bottom: 24, left: 380 };
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat)) {
      const x = ((ring[j][0] - ring[i][0]) * (lat - yi)) / (yj - yi) + ring[i][0];
      if (lon < x) inside = !inside;
    }
  }
  return inside;
}

function formatLength(meters) {
  return `${Math.round(meters).toLocaleString("fr-FR")}\u00a0m`;
}

function renderHour(h, speak) {
  hour = h;
  el.nombre.textContent = String(h);
  el.range.value = String(h);
  el.range.setAttribute("aria-valuetext", `${h} heures`);
  paintStreets();
  renderStations();
  if (pointA && pointB) drawRoute(speak);
  else if (speak) el.direct.textContent = `${h} heures`;
  const url = new URL(location.href);
  url.searchParams.set("h", String(h));
  history.replaceState(null, "", url);
}

function step(delta) {
  const index = scene.hours.indexOf(hour);
  renderHour(scene.hours[(index + delta + scene.hours.length) % scene.hours.length], true);
}

function stopPlay() {}

el.precedent.addEventListener("click", () => step(-1));
el.suivant.addEventListener("click", () => step(1));
el.range.addEventListener("input", () => renderHour(Number(el.range.value), true));
window.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea, select, dialog[open] button")) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    step(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    step(-1);
  }
});

const map = new maplibregl.Map({
  container: "carte",
  style: "https://tiles.openfreemap.org/styles/positron",
  bounds: scene.bounds,
  fitBoundsOptions: { padding: padding() },
  minZoom: 10,
  maxZoom: 18.5,
  maxPitch: 70,
  dragRotate: true,
  pitchWithRotate: true,
  touchPitch: true,
  attributionControl: true,
  customAttribution: "Ombre : IGN BD TOPO et arbres de Paris · Eau et fraîcheur : Ville de Paris / Eau de Paris · Stations et projets : Île-de-France Mobilités · 41 °C : Météo-France",
  locale: {
    "NavigationControl.ResetBearing": "Glisser pour tourner, cliquer pour le nord",
    "NavigationControl.ZoomIn": "Zoomer",
    "NavigationControl.ZoomOut": "Dézoomer",
  },
});
map.touchZoomRotate.enableRotation();
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

function calmBasemap() {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const id = layer.id.toLowerCase();
    if (id.startsWith("place") || id.includes("country") || id.includes("state") || id.includes("continent")) continue;
    const floor = 16.2;
    if ((layer.minzoom ?? 0) < floor) map.setLayerZoomRange(layer.id, floor, layer.maxzoom ?? 24);
  }
}

function syncVolumes() {
  const raised = map.getPitch() > 2;
  map.setLayoutProperty("batis-volume", "visibility", raised ? "visible" : "none");
  map.setLayoutProperty("batis-connus", "visibility", raised ? "none" : "visible");
  map.setLayoutProperty("batis-connus-line", "visibility", raised ? "none" : "visible");
}

function paintStreets() {
  if (!router || !map.getSource("rues-loin")) return;
  const index = scene.hours.indexOf(hour);
  const zoom = map.getZoom();
  const ids = zoom >= 15 ? router.edgesIn(map.getBounds()) : null;
  if (ids) {
    map.getSource("rues-pres").setData(router.nearCollection(ids, index, season, view === "future"));
    map.setLayoutProperty("rues-loin", "visibility", "none");
    map.setLayoutProperty("gain-loin", "visibility", "none");
    map.setLayoutProperty("gain-pres", "visibility", view === "future" ? "visible" : "none");
  } else {
    map.getSource("rues-pres").setData(EMPTY);
    const key = `${season}:${index}:${view}`;
    if (farKey !== key) {
      map.getSource("rues-loin").setData(router.farCollection(index, season, view === "future"));
      farKey = key;
    }
    map.setLayoutProperty("rues-loin", "visibility", "visible");
    map.setLayoutProperty("gain-loin", "visibility", view === "future" ? "visible" : "none");
    map.setLayoutProperty("gain-pres", "visibility", "none");
  }
  if (buildings && zoom >= 15) {
    const box = map.getBounds();
    const pad = 0.0012;
    const data = buildings.featuresIn(box.getWest() - pad, box.getSouth() - pad, box.getEast() + pad, box.getNorth() + pad);
    if (data) map.getSource("batis").setData(data);
  } else if (map.getSource("batis")) {
    map.getSource("batis").setData(EMPTY);
  }
  if (map.getLayer("batis-volume")) syncVolumes();
}

let resolveReady = () => {};
const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

map.on("load", () => {
  calmBasemap();
  map.addSource("rues-loin", { type: "geojson", data: EMPTY });
  map.addSource("rues-pres", { type: "geojson", data: EMPTY });
  map.addSource("batis", { type: "geojson", data: EMPTY });
  map.addSource("trajet", { type: "geojson", data: EMPTY });
  map.addSource("equipements", { type: "geojson", data: EMPTY });
  map.addSource("manques", { type: "geojson", data: EMPTY });
  map.addSource("projets", { type: "geojson", data: EMPTY });
  map.addSource("stations", { type: "geojson", data: EMPTY });

  const beforeLabels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  const add = (layer) => map.addLayer(layer, beforeLabels);
  const streetPaint = {
    "line-color": SHADE_COLOR,
    "line-opacity": 0.94,
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.15, 12, 1.9, 14.5, 3.4],
  };
  add({
    id: "gain-loin",
    type: "line",
    source: "rues-loin",
    filter: [">=", ["get", "g"], 0.08],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#258251", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14.5, 7] },
  });
  add({
    id: "gain-pres",
    type: "line",
    source: "rues-pres",
    filter: [">=", ["get", "g"], 0.08],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#258251", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 15, 7, 18.5, 11] },
  });
  add({
    id: "rues-loin",
    type: "line",
    source: "rues-loin",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: streetPaint,
  });
  add({
    id: "rues-pres",
    type: "line",
    source: "rues-pres",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": SHADE_COLOR,
      "line-opacity": 0.96,
      "line-width": ["interpolate", ["linear"], ["zoom"], 15, 2.6, 17, 4.4, 18.5, 6.5],
    },
  });
  add({
    id: "batis-connus",
    type: "fill",
    source: "batis",
    filter: ["==", ["get", "known"], 1],
    paint: { "fill-color": "#f6f0e4", "fill-opacity": 0.92 },
  });
  add({
    id: "batis-connus-line",
    type: "line",
    source: "batis",
    filter: ["==", ["get", "known"], 1],
    paint: { "line-color": "#c9bba4", "line-width": 0.6 },
  });
  add({
    id: "batis-inconnus",
    type: "line",
    source: "batis",
    filter: ["==", ["get", "known"], 0],
    paint: { "line-color": "#8d7760", "line-width": 1.1, "line-dasharray": [1.2, 1.1] },
  });
  add({
    id: "batis-volume",
    type: "fill-extrusion",
    source: "batis",
    filter: ["==", ["get", "known"], 1],
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-base": 0,
      "fill-extrusion-color": "#e4d5c0",
      "fill-extrusion-opacity": 0.96,
      "fill-extrusion-vertical-gradient": true,
    },
  });
  add({
    id: "manques",
    type: "circle",
    source: "manques",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 17],
      "circle-color": ["case", ["==", ["get", "priority"], 2], "#9a3f09", "#c98d32"],
      "circle-opacity": 0.65,
      "circle-stroke-color": "#fffaf2",
      "circle-stroke-width": 1,
    },
  });
  add({
    id: "projets",
    type: "line",
    source: "projets",
    layout: { visibility: "none", "line-cap": "round" },
    paint: { "line-color": "#744a9b", "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.85 },
  });
  for (const [id, category, color] of [
    ["points-eau", "water", "#0c6478"],
    ["lieux-frais", "cool", "#145233"],
    ["parcs-frais", "park", "#78a64b"],
  ]) {
    add({
      id,
      type: "circle",
      source: "equipements",
      minzoom: 13,
      filter: ["==", ["get", "category"], category],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5, 17, 8],
        "circle-color": color,
        "circle-opacity": 0.88,
        "circle-stroke-color": "#fffaf2",
        "circle-stroke-width": 1,
      },
    });
  }
  add({
    id: "stations-points",
    type: "circle",
    source: "stations",
    minzoom: 12,
    layout: { visibility: "visible" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 8, 16, 11],
      "circle-color": ["match", ["get", "score"], 3, "#9a3f09", 2, "#b34012", 1, "#35619b", "#234b69"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  add({
    id: "stations-chiffres",
    type: "symbol",
    source: "stations",
    minzoom: 12,
    layout: { visibility: "visible", "text-field": ["to-string", ["get", "score"]], "text-size": 11, "text-font": ["Noto Sans Regular"] },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "trajet-fond",
    type: "line",
    source: "trajet",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#fffaf2", "line-width": 12, "line-opacity": 1 },
  });
  map.addLayer({
    id: "trajet-couleur",
    type: "line",
    source: "trajet",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 6,
      "line-color": "#2568c8",
    },
  });

  map.on("pitch", syncVolumes);
  map.on("moveend", paintStreets);
  map.on("click", onMapClick);
  renderHour(hour, false);

  const get = (url, kind) => fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return kind === "bin" ? r.arrayBuffer() : r.json();
  });
  const getPacked = async (name) => {
    if (typeof DecompressionStream === "undefined") throw new Error("Ce navigateur ne sait pas décompresser les données cartographiques.");
    const { parts } = await get(`data/${name}.parts.json`, "json");
    const buffers = await Promise.all(Array.from({ length: parts }, (_, i) => get(`data/${name}.part${String(i).padStart(3, "0")}`, "bin")));
    return new Response(new Blob(buffers).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  };
  Promise.all([
    getPacked("axes.bin"),
    getPacked("tree-cover.bin"),
    getPacked("batis.bin"),
    get("data/amenities.json", "json"),
    get("data/gaps.json", "json"),
    get("data/projects.json", "json"),
    get("data/stations.json", "json"),
  ])
    .then(([axes, treeCover, batis, places, gaps, projects, stationRows]) => {
      router = createRouter(axes, (lon, lat) => pointInRing(lon, lat, scene.ring), treeCover);
      buildings = indexBuildings(batis);
      amenities = places;
      stationCollection = stationRows;
      map.getSource("equipements").setData(places);
      map.getSource("manques").setData(gaps);
      map.getSource("projets").setData(projects);
      paintStreets();
      syncView();
      el.resultat.textContent = "Cliquez A, puis B.";
      resolveReady();
    })
    .catch((error) => {
      el.resultat.textContent = "Les données de Paris n’ont pas pu être lues.";
      console.error(error);
    });
});

let lastNarrow = window.innerWidth < 760;
window.addEventListener("resize", () => {
  const narrow = window.innerWidth < 760;
  if (narrow !== lastNarrow) {
    lastNarrow = narrow;
    map.fitBounds(scene.bounds, { padding: padding(), duration: 0 });
  }
});

function borne(letter) {
  const node = document.createElement("div");
  node.className = "borne";
  node.textContent = letter;
  return new maplibregl.Marker({ element: node, anchor: "center" });
}

function showBorne(letter, lngLat) {
  const current = letter === "A" ? markerA : markerB;
  const marker = current || borne(letter);
  marker.setLngLat(lngLat).addTo(map);
  if (letter === "A") markerA = marker;
  else markerB = marker;
}

function hideBorne(letter) {
  (letter === "A" ? markerA : markerB)?.remove();
}

function clearLine() {
  map.getSource("trajet")?.setData(EMPTY);
}

function routeContext(segments) {
  const points = amenities.features || [];
  let water = 0;
  let cool = 0;
  for (const feature of points) {
    const category = feature.properties.category;
    if (category !== "water" && category !== "cool" && category !== "park") continue;
    const [lon, lat] = feature.geometry.coordinates;
    const near = segments.some((segment) => {
      const [a, b] = segment.coords;
      const x = (lon - a[0]) * 73400;
      const y = (lat - a[1]) * 111132;
      const dx = (b[0] - a[0]) * 73400;
      const dy = (b[1] - a[1]) * 111132;
      const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - t * dx, y - t * dy) <= 80;
    });
    if (near && category === "water") water++;
    if (near && category !== "water") cool++;
  }
  const parts = [`${water} fontaine${water > 1 ? "s" : ""} et ${cool} lieu${cool > 1 ? "x" : ""} frais à moins de 80 m du trajet`];
  if (selectedStop) parts.push(`passage par ${selectedStop.properties.name}`);
  if (view === "future" && season === "ete") parts.push("croissance de la canopée simulée sur les arbres jeunes recensés");
  return parts.join(" · ") + ". Vérifiez les horaires et l’accès sur place.";
}

function stationProfile(feature) {
  const p = feature.properties;
  const index = scene.hours.indexOf(hour);
  const shade = season === "hiver" ? p.shadeWinter[index] : view === "future" ? p.shadeFuture[index] : p.shadeToday[index];
  const shadeGap = shade != null && shade < 40;
  const waterGap = p.waterMeters > 350;
  const coolGap = p.coolMeters > 300;
  return { feature, shade, score: Number(shadeGap) + Number(waterGap) + Number(coolGap) };
}

function stationText(profile) {
  const p = profile.feature.properties;
  return `${profile.shade == null ? "Soleil couché" : `${profile.shade} % d’ombre sur les rues à 250 m`} · fontaine à ${p.waterMeters} m · lieu frais à ${p.coolMeters} m`;
}

function renderStationList(profiles) {
  const query = el.stationSearch.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ranked = [...profiles].sort((a, b) => b.score - a.score || (a.shade ?? 101) - (b.shade ?? 101) || b.feature.properties.waterMeters - a.feature.properties.waterMeters);
  const matching = query
    ? ranked.filter(({ feature }) => feature.properties.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query))
    : ranked;
  const visible = query || showAllStations ? matching : matching.slice(0, 10);
  el.stationCount.textContent = query
    ? `${matching.length} station${matching.length > 1 ? "s" : ""} trouvée${matching.length > 1 ? "s" : ""}.`
    : `Classement à ${hour} h · ${visible.length} station${visible.length > 1 ? "s" : ""} affichée${visible.length > 1 ? "s" : ""} sur ${matching.length}.`;
  el.stationList.replaceChildren();
  for (const profile of visible) {
    const p = profile.feature.properties;
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("strong");
    name.textContent = p.name;
    const score = document.createElement("span");
    score.textContent = `${p.mode} · ${profile.score} point${profile.score > 1 ? "s" : ""} d’attention sur 3`;
    const details = document.createElement("span");
    details.textContent = stationText(profile);
    button.append(name, score, details);
    button.addEventListener("click", () => {
      const coords = profile.feature.geometry.coordinates;
      map.flyTo({ center: coords, zoom: 15.4, padding: padding(), duration: 450 });
      showStationPopup(profile.feature, coords, profile);
    });
    li.append(button);
    el.stationList.append(li);
  }
  el.stationAll.hidden = Boolean(query) || showAllStations;
}

function renderStations() {
  if (!stationCollection.features?.length) return;
  const profiles = stationCollection.features.map(stationProfile);
  const lowShade = profiles.filter((p) => p.shade != null && p.shade < 40).length;
  const combined = profiles.filter((p) => p.score >= 2).length;
  const cards = [
    [profiles.length, "stations ferrées étudiées à Paris"],
    [profiles.some((p) => p.shade != null) ? lowShade : "—", `avec moins de 40 % d’ombre à ${hour} h`],
    [combined, "avec au moins 2 points d’attention"],
  ];
  el.insights.replaceChildren(...cards.map(([value, label]) => {
    const card = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    return card;
  }));
  renderStationList(profiles);
  if (map.getSource("stations")) {
    map.getSource("stations").setData({
      type: "FeatureCollection",
      features: profiles.map(({ feature, shade, score }) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          category: "station",
          name: feature.properties.name,
          mode: feature.properties.mode,
          waterMeters: feature.properties.waterMeters,
          coolMeters: feature.properties.coolMeters,
          shade,
          score,
        },
      })),
    });
  }
}

el.stationSearch.addEventListener("input", () => renderStationList(stationCollection.features.map(stationProfile)));
el.stationAll.addEventListener("click", () => { showAllStations = true; renderStationList(stationCollection.features.map(stationProfile)); });

function drawRoute(speak) {
  if (!pointA || !pointB || !router || !map.getSource("trajet")) return;
  const hourIndex = scene.hours.indexOf(hour);
  let result = router.plan(pointA[0], pointA[1], pointB[0], pointB[1], season, hourIndex, view === "future");
  if (result.ok && selectedStop) {
    const [lon, lat] = selectedStop.geometry.coordinates;
    const first = router.plan(pointA[0], pointA[1], lon, lat, season, hourIndex, view === "future");
    const second = router.plan(lon, lat, pointB[0], pointB[1], season, hourIndex, view === "future");
    if (first.ok && second.ok) {
      const length = first.length + second.length;
      result = {
        ...result,
        segments: [...first.segments, ...second.segments],
        length,
        shade: length ? (first.shade * first.length + second.shade * second.length) / length : null,
        todayShade: length ? (first.todayShade * first.length + second.todayShade * second.length) / length : null,
      };
    } else {
      selectedStop = null;
    }
  }
  if (!result.ok) {
    clearLine();
    hideBorne("B");
    pointB = null;
    el.resultat.textContent = result.message;
    el.contexte.textContent = "";
    if (speak) el.direct.textContent = result.message;
    return;
  }
  showBorne("A", result.origin);
  showBorne("B", result.destination);
  map.getSource("trajet").setData({
    type: "FeatureCollection",
    features: result.segments
      .filter((segment) => segment.coords.length >= 2)
      .map((segment) => ({
        type: "Feature",
        properties: { s: segment.s },
        geometry: { type: "LineString", coordinates: segment.coords },
      })),
  });
  const length = formatLength(result.length);
  const minutes = Math.max(1, Math.round(result.length / 75));
  el.resultat.textContent = result.neutral
    ? `${minutes} min à pied · ${length} · soleil couché`
    : view === "future" && season === "ete"
      ? `${minutes} min à pied · ${length} · ombre sur ce trajet : ${pct(result.todayShade)} aujourd’hui → ${pct(result.shade)} en 2036`
      : `${minutes} min à pied · ${length} · ${pct(result.shade)} à l’ombre`;
  el.contexte.textContent = routeContext(result.segments);
  if (speak) el.direct.textContent = el.resultat.textContent;
}

function place(lngLat, which) {
  if (!router) {
    el.resultat.textContent = "Chargement de Paris…";
    return;
  }
  const point = [lngLat.lng ?? lngLat[0], lngLat.lat ?? lngLat[1]];
  const snap = router.snap(point[0], point[1]);
  if (!snap.ok) {
    if (!(pointA && pointB)) el.resultat.textContent = snap.message;
    el.direct.textContent = snap.message;
    return;
  }
  const target = which || (pointA && !pointB ? "b" : "a");
  if (target === "b" && !pointA) {
    el.resultat.textContent = "Posez A d’abord.";
    el.direct.textContent = "Posez A d’abord.";
    return;
  }
  if (target === "a") {
    pointA = point;
    pointB = null;
    selectedStop = null;
    document.getElementById("adresse-a").value = "";
    document.getElementById("adresse-b").value = "";
    clearLine();
    hideBorne("B");
    showBorne("A", [snap.lon, snap.lat]);
    el.resultat.textContent = "A est posé. Choisissez B.";
    el.contexte.textContent = "";
    el.direct.textContent = "Point A posé. Choisissez B.";
    return;
  }
  pointB = point;
  document.getElementById("adresse-b").value = "";
  drawRoute(true);
}

function syncView() {
  el.today.setAttribute("aria-pressed", String(view === "today"));
  el.future.setAttribute("aria-pressed", String(view === "future"));
  el.explanation.textContent =
    view === "today"
      ? season === "ete"
        ? "Ombre des bâtiments calculée et couverture des arbres recensés estimée pour le 25 juin 2026. Fontaines et lieux frais observés."
        : "Ombre des bâtiments calculée pour le 21 décembre. La canopée n’est pas modélisée en hiver. Fontaines et lieux frais recensés en 2026."
      : season === "ete"
        ? "Scénario vers 2036 : les arbres jeunes recensés gagnent 2 m de rayon de canopée. Liserés verts : gain d’ombre estimé ; halos orange : manques ; traits violets : projets de transport. Ce n’est pas une prévision météo."
        : "Scénario vers 2036 : la croissance de la canopée n’est simulée qu’en été. En hiver, l’ombre reste celle des bâtiments ; les halos montrent les manques et les traits violets les projets de transport.";
  for (const [id, visible] of [
    ["points-eau", el.water.checked],
    ["lieux-frais", el.cool.checked],
    ["parcs-frais", el.parks.checked],
    ["stations-points", el.stations.checked],
    ["stations-chiffres", el.stations.checked],
    ["manques", view === "future"],
    ["projets", view === "future"],
  ]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
  paintStreets();
  renderStations();
  if (pointA && pointB) drawRoute(false);
}

function showStationPopup(feature, lngLat, suppliedProfile) {
  const p = feature.properties;
  const profile = suppliedProfile || {
    feature,
    shade: p.shade == null || p.shade === "null" ? null : Number(p.shade),
    score: Number(p.score),
  };
  const box = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = p.name;
  const details = document.createElement("p");
  details.textContent = `${p.mode} · ${profile.score} point${profile.score > 1 ? "s" : ""} d’attention sur 3. ${stationText(profile)}.`;
  const note = document.createElement("p");
  note.textContent = "Point représentatif de la station, pas une entrée. Distances à vol d’oiseau.";
  box.append(name, details, note);
  if (pointA && router?.snap(lngLat[0], lngLat[1]).ok) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Itinéraire depuis le départ";
    button.addEventListener("click", () => {
      pointB = lngLat;
      selectedStop = null;
      document.getElementById("adresse-b").value = `${p.name} (station)`;
      drawRoute(true);
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend(pointA);
      bounds.extend(pointB);
      map.fitBounds(bounds, { padding: padding(), maxZoom: 16, duration: 450 });
      mapPopup.remove();
    });
    box.append(button);
  }
  const mapPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "290px" })
    .setLngLat(lngLat)
    .setDOMContent(box)
    .addTo(map);
}

function popup(feature, lngLat) {
  if (feature.properties.category === "station") {
    showStationPopup(feature, feature.geometry.coordinates);
    return;
  }
  const box = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = feature.properties.name || "Information";
  box.append(title);
  const info = document.createElement("p");
  const p = feature.properties;
  const isTrue = (value) => value === true || value === "true";
  info.textContent = [p.kind, p.address, p.year ? `mise en service estimée : ${p.year}` : "", p.status].filter(Boolean).join(" · ");
  if (info.textContent) box.append(info);
  if (p.category === "cool" || p.category === "park") {
    const note = document.createElement("p");
    note.textContent = p.category === "park"
      ? "Végétation haute : " + Math.round((p.canopy || 0) * 100) + " %. Entrées et horaires à vérifier."
      : isTrue(p.free) ? "Accès déclaré gratuit. Horaires à vérifier." : "Accès et horaires à vérifier.";
    box.append(note);
  }
  if (isTrue(p.waterGap) || isTrue(p.refugeGap)) {
    info.textContent = [
      isTrue(p.waterGap) ? `fontaine à ${p.nearestWater} m` : "",
      isTrue(p.refugeGap) ? `refuge à ${p.nearestRefuge} m` : "",
    ].filter(Boolean).join(" · ");
    if (!info.parentElement) box.append(info);
  }
  if (p.category === "water" || (p.category === "cool" && isTrue(p.free))) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Passer par ce lieu";
    button.addEventListener("click", () => {
      if (!pointA || !pointB) {
        el.resultat.textContent = "Choisissez d’abord un départ et une arrivée.";
        return;
      }
      selectedStop = feature;
      drawRoute(true);
      mapPopup.remove();
    });
    box.append(button);
  }
  const mapPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
    .setLngLat(lngLat)
    .setDOMContent(box)
    .addTo(map);
}

function onMapClick(event) {
  const ids = ["stations-points", "points-eau", "lieux-frais", "parcs-frais", "manques", "projets"].filter((id) => map.getLayer(id));
  const feature = map.queryRenderedFeatures(event.point, { layers: ids })[0];
  if (feature) {
    popup(feature, event.lngLat);
    return;
  }
  place(event.lngLat);
}

async function searchAddress(letter) {
  const input = document.getElementById(`adresse-${letter}`);
  const results = document.getElementById(`choix-${letter}`);
  const query = input.value.trim();
  if (!query) return;
  results.replaceChildren();
  const status = document.createElement("p");
  status.className = "etat";
  status.textContent = "Recherche en cours…";
  results.append(status);
  try {
    const terms = /paris/i.test(query) ? query : `${query} Paris`;
    const url = new URL("https://data.geopf.fr/geocodage/search");
    url.searchParams.set("q", terms);
    url.searchParams.set("limit", "5");
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const choices = (data.features || []).filter((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return pointInRing(lon, lat, scene.ring);
    });
    results.replaceChildren();
    if (!choices.length) {
      status.textContent = "Aucune adresse trouvée dans Paris. Précisez la rue et le numéro.";
      results.append(status);
      return;
    }
    for (const feature of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = feature.properties.label;
      button.addEventListener("click", () => {
        const [lon, lat] = feature.geometry.coordinates;
        place([lon, lat], letter);
        input.value = feature.properties.label;
        results.replaceChildren();
        if (pointA && pointB) {
          const bounds = new maplibregl.LngLatBounds();
          bounds.extend(pointA);
          bounds.extend(pointB);
          map.fitBounds(bounds, { padding: padding(), maxZoom: 16, duration: 450 });
        }
        else map.flyTo({ center: [lon, lat], zoom: 15.5, duration: 450 });
      });
      results.append(button);
    }
  } catch (error) {
    status.textContent = "Recherche indisponible. Placez le point sur la carte.";
    results.replaceChildren(status);
    console.error(error);
  }
}

for (const letter of ["a", "b"]) {
  document.getElementById(`form-${letter}`).addEventListener("submit", (event) => {
    event.preventDefault();
    searchAddress(letter);
  });
}
el.today.addEventListener("click", () => { view = "today"; syncView(); });
el.future.addEventListener("click", () => { view = "future"; syncView(); });
for (const input of [el.water, el.cool, el.parks, el.stations]) input.addEventListener("change", syncView);

function setSeason(next) {
  season = next;
  el.ete.setAttribute("aria-pressed", String(season === "ete"));
  el.hiver.setAttribute("aria-pressed", String(season === "hiver"));
  renderHour(hour, Boolean(pointA && pointB));
  syncView();
}

el.ete.addEventListener("click", () => setSeason("ete"));
el.hiver.addEventListener("click", () => setSeason("hiver"));
document.getElementById("poser-a").addEventListener("click", () => place(map.getCenter(), "a"));
document.getElementById("poser-b").addEventListener("click", () => place(map.getCenter(), "b"));
document.getElementById("effacer").addEventListener("click", () => {
  pointA = null;
  pointB = null;
  selectedStop = null;
  for (const letter of ["a", "b"]) {
    document.getElementById(`adresse-${letter}`).value = "";
    document.getElementById(`choix-${letter}`).replaceChildren();
  }
  clearLine();
  hideBorne("A");
  hideBorne("B");
  el.resultat.textContent = "Cliquez A, puis B.";
  el.contexte.textContent = "";
  el.direct.textContent = "Trajet effacé.";
});

if (params.has("test")) {
  window.__ombre = {
    get map() {
      return map;
    },
    place: (lon, lat, which) => place([lon, lat], which),
    season: setSeason,
    hour: (h) => renderHour(h, false),
    ready,
  };
}

const stats = scene.stats;
const sunRows = scene.sun
  .map(
    (s) =>
      `<tr><th>${s.hour} h</th><td>${s.altitude.toLocaleString("fr-FR")}°</td><td>${s.azimuth.toLocaleString("fr-FR")}°</td><td>${scene.temperature.byHour[s.hour] ?? "—"}</td></tr>`,
  )
  .join("");
el.corps.innerHTML = `
  <p>Le ${scene.dateLabel}, de 7 h à 21 h, heure de Paris. Le 21 décembre n’est pas une autre carte : le bouton Hiver reprend les mêmes axes avec le soleil de cette date. Le ciel est supposé dégagé. Ce n’est pas une température, et ce n’est pas un extrait de jveuxdusoleil.fr.</p>
  <h3>Deux horizons</h3>
  <p>Aujourd’hui montre les équipements et les arbres recensés en 2026. Vers 2036 est un scénario conditionnel : les infrastructures de fraîcheur restent à leur niveau actuel, tandis que les arbres déjà recensés comme jeunes gagnent un rayon de canopée supposé de 2 m. Les liserés verts montrent les tronçons où cette hypothèse fait gagner au moins 8 points de couverture moyenne. Chaque halo orange représente une maille de 350 m dont le centre est à plus de 350 m d’une fontaine disponible et/ou à plus de 600 m d’un lieu frais gratuit ou d’un espace vert à au moins 25 % de végétation haute. Ces seuils sont des choix de visualisation, pas une norme sanitaire. Les 9 tracés violets sont des projets de transport dont la mise en service est estimée entre 2027 et 2036 ; leur réalisation et leur date ne sont pas garanties. Les plantations encore à venir ne sont pas placées sur la carte faute de localisation vérifiable. Les rues et bâtiments restent ceux d’aujourd’hui. Ce scénario ne prévoit ni la météo d’un jour de 2036, ni la température future d’un quartier.</p>
  <h3>Le soleil</h3>
  <p>À chaque heure ronde, pour le point 48,857° N, 2,352° E. Jours depuis le 1<sup>er</sup> janvier 2000, 12 h UTC. Anomalie moyenne M = 357,5291° + 0,98560028° × j. Équation du centre C = 1,9148° sin M + 0,0200° sin 2M + 0,0003° sin 3M. Longitude écliptique λ = M + C + 102,9372° + 180°. Déclinaison δ = arcsin(sin λ sin ε), ε = 23,4397°. Puis hauteur et azimut. Modèle de aa.quae.nl, le même que SunCalc, à environ un degré près. L’heure Météo-France est en UTC ; l’affichage est en heure légale, UTC+2 en juin et UTC+1 en décembre.</p>
  <h3>L’ombre</h3>
  <p>${stats.buildingsWithHeight.toLocaleString("fr-FR")} bâtiments de la BD TOPO ont une hauteur photogrammétrique (altimétrie annoncée ${stats.altimetricPrecisionMeters.toLocaleString("fr-FR")} m, planimétrie ${stats.planimetricPrecisionMeters.toLocaleString("fr-FR")} m). L’ombre des bâtiments est portée au plus à ${scene.maxShadowMeters} m. Pas de toit en pente ni de hauteur par défaut.</p>
  <p>Pour l’été, ${treeMeta.treesUsed.toLocaleString("fr-FR")} arbres du jeu « Les arbres » de Paris sont utilisés, dont ${treeMeta.youngTrees.toLocaleString("fr-FR")} classés « Jeune ». Le rayon de houppier actuel est une approximation de 30 % de la hauteur déclarée, limitée entre 1,5 et 6 m. En 2036, seuls ces jeunes arbres gagnent 2 m de rayon, avec un maximum de 8 m. La portion de rue sous les disques est additionnée puis plafonnée à 100 %. Cette couverture n’est pas une mesure de couronne ni une projection physique de l’ombre selon l’azimut du soleil. La météo, l’état sanitaire, l’abattage et la croissance réelle des arbres sont inconnus. En hiver, seule l’ombre des bâtiments est calculée.</p>
  <p>${stats.buildingsUnknownDrawn.toLocaleString("fr-FR")} emprises dans Paris n’ont pas de hauteur. Elles restent un contour en pointillés, sans volume, et ne projettent rien.</p>
  <h3>La couleur</h3>
  <p>L’axe est découpé en tronçons d’environ ${scene.sampleMeters} m. La couleur combine la part d’ombre calculée pour les bâtiments et la couverture de canopée estimée, de 0 à 100&nbsp;%. De plus loin, ces tronçons sont regroupés en bouts d’environ ${scene.chunkMeters} m. Là où l’axe n’a pas été calculé, il n’y a pas de couleur.</p>
  <h3>Les stations de transport</h3>
  <p>Les points de gare ou de station situés dans Paris viennent du jeu « Gares et stations du réseau ferré d’Île-de-France (donnée généralisée) » d’Île-de-France Mobilités. Ce sont des points représentatifs, pas les entrées. Autour de chaque point, la part d’ombre est la moyenne pondérée par longueur des tronçons de rue dont le centre se trouve dans un rayon de 250 m. Les distances à la fontaine disponible et au lieu frais gratuit ou espace vert sont calculées à vol d’oiseau, pas à pied. Les trois points d’attention sont : moins de 40 % d’ombre, plus de 350 m d’une fontaine et plus de 300 m d’un lieu frais. Ces seuils permettent la comparaison ; ils ne constituent pas une norme de santé ou d’accessibilité. La carte utilise le chiffre 0 à 3 sur chaque station pour être lisible sans dépendre uniquement de la couleur. La liste textuelle donne les mêmes valeurs essentielles.</p>
  <h3>Le trajet</h3>
  <p>A puis B, seulement sur les axes calculés dans le département. Les adresses sont recherchées dans la Base Adresse Nationale via le service de géocodage Géoplateforme. En été, un mètre au soleil du 25 juin coûte trente et une fois un mètre à l’ombre. En hiver, un mètre à l’ombre du 21 décembre coûte trente et une fois un mètre au soleil. Le trait suit les rues. Une fontaine ou un lieu frais gratuit peut être choisi comme étape en cliquant sur la carte. Hors du 75, ou à plus de 60 m d’une rue calculée, rien n’est tracé. Les horaires d’ouverture, l’accessibilité piétonne réelle et la disponibilité d’un équipement doivent être vérifiés sur place.</p>
  <h3>Hauteur du soleil et air</h3>
  <table>
    <caption>Station ${scene.temperature.station} (${scene.temperature.id}), le 25 juin 2026. La couleur de la carte n’utilise pas ces températures.</caption>
    <thead><tr><th>Heure</th><th>Hauteur</th><th>Azimut</th><th>Air (°C)</th></tr></thead>
    <tbody>${sunRows}</tbody>
  </table>
  <h3>Sources</h3>
  <ul>
    <li>IGN, BD TOPO, bâtiments et tronçons de route du département 75, WFS Géoplateforme. Contour de Paris : API Géo. Licence Ouverte.</li>
    <li>Ville de Paris / Eau de Paris : Fontaines à boire, Îlots de fraîcheur — équipements / activités, Îlots de fraîcheur — espaces verts frais. ODbL. Les jeux ont été relevés lors de la génération du prototype.</li>
    <li>Ville de Paris : Les arbres, hauteurs, stades de développement et emplacements. ODbL. Relevé lors de la génération du prototype.</li>
    <li>Île-de-France Mobilités : Lignes de transport en projet en Île-de-France. Dates estimées et statuts fournis par le jeu. Licence Ouverte.</li>
    <li>Île-de-France Mobilités : Gares et stations du réseau ferré d’Île-de-France (donnée généralisée). Points représentatifs, licence Ouverte v2.</li>
    <li>Base Adresse Nationale / IGN : service de géocodage Géoplateforme.</li>
    <li>${scene.temperature.source} À Luxembourg, ${scene.temperature.byHour[16] ?? "—"} °C à 16 h. À Montsouris, ${scene.montsouris.byHour[16] ?? "—"} °C à la même heure.</li>
    <li>Fond : OpenFreeMap, données OpenStreetMap. ODbL.</li>
  </ul>
`;
document.getElementById("fermer-methode").addEventListener("click", () => el.methode.close());
document.getElementById("ouvrir-methode").addEventListener("click", () => el.methode.showModal());

renderHour(hour, false);
