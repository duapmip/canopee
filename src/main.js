import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import maplibregl from "maplibre-gl";
import { pct } from "./annotations.js";
import { createRouter, indexBuildings } from "./router.js";
import "./style.css";

const scene = await fetch("data/scene.json").then((r) => r.json());
const params = new URLSearchParams(location.search);
let hour = Number(params.get("h"));
if (!scene.hours.includes(hour)) hour = 16;

let season = "ete";
let pointA = null;
let pointB = null;
let markerA = null;
let markerB = null;
let router = null;
let buildings = null;
let farKey = "";
const EMPTY = { type: "FeatureCollection", features: [] };

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
};

const SHADE_COLOR = ["interpolate", ["linear"], ["get", "s"], 0, "#d06a14", 0.5, "#8a5a3a", 1, "#0e2f46"];

function padding() {
  if (window.innerWidth < 760) {
    return { top: 12, right: 10, bottom: Math.round(window.innerHeight * 0.46), left: 10 };
  }
  return { top: 24, right: 24, bottom: 24, left: 300 };
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
  customAttribution: "Ombre : IGN BD TOPO · 41 °C : Météo-France, Luxembourg, 25 juin 2026",
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
    map.getSource("rues-pres").setData(router.nearCollection(ids, index, season));
    map.setLayoutProperty("rues-loin", "visibility", "none");
  } else {
    map.getSource("rues-pres").setData(EMPTY);
    const key = `${season}:${index}`;
    if (farKey !== key) {
      map.getSource("rues-loin").setData(router.farCollection(index, season));
      farKey = key;
    }
    map.setLayoutProperty("rues-loin", "visibility", "visible");
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

  const beforeLabels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  const add = (layer) => map.addLayer(layer, beforeLabels);
  const streetPaint = {
    "line-color": SHADE_COLOR,
    "line-opacity": 0.94,
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.15, 12, 1.9, 14.5, 3.4],
  };
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
  map.addLayer({
    id: "trajet-fond",
    type: "line",
    source: "trajet",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#fffaf2", "line-width": 7.5, "line-opacity": 0.94 },
  });
  map.addLayer({
    id: "trajet-couleur",
    type: "line",
    source: "trajet",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 4.2,
      "line-color": ["case", ["<", ["get", "s"], 0], "#3a342c", SHADE_COLOR],
    },
  });

  map.on("pitch", syncVolumes);
  map.on("moveend", paintStreets);
  map.on("click", (event) => place(event.lngLat));
  renderHour(hour, false);

  Promise.all([fetch("data/axes.bin").then((r) => r.arrayBuffer()), fetch("data/batis.bin").then((r) => r.arrayBuffer())])
    .then(([axes, batis]) => {
      router = createRouter(axes, (lon, lat) => pointInRing(lon, lat, scene.ring));
      buildings = indexBuildings(batis);
      paintStreets();
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

function drawRoute(speak) {
  if (!pointA || !pointB || !router || !map.getSource("trajet")) return;
  const result = router.plan(pointA[0], pointA[1], pointB[0], pointB[1], season, scene.hours.indexOf(hour));
  if (!result.ok) {
    clearLine();
    hideBorne("B");
    pointB = null;
    el.resultat.textContent = result.message;
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
  el.resultat.textContent = result.neutral ? `${length} · soleil couché` : `${length} · ${pct(result.shade)} à l’ombre`;
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
    clearLine();
    hideBorne("B");
    showBorne("A", [snap.lon, snap.lat]);
    el.resultat.textContent = "A est posé. Choisissez B.";
    el.direct.textContent = "Point A posé. Choisissez B.";
    return;
  }
  pointB = point;
  drawRoute(true);
}

function setSeason(next) {
  season = next;
  el.ete.setAttribute("aria-pressed", String(season === "ete"));
  el.hiver.setAttribute("aria-pressed", String(season === "hiver"));
  renderHour(hour, Boolean(pointA && pointB));
}

el.ete.addEventListener("click", () => setSeason("ete"));
el.hiver.addEventListener("click", () => setSeason("hiver"));
document.getElementById("poser-a").addEventListener("click", () => place(map.getCenter(), "a"));
document.getElementById("poser-b").addEventListener("click", () => place(map.getCenter(), "b"));
document.getElementById("effacer").addEventListener("click", () => {
  pointA = null;
  pointB = null;
  clearLine();
  hideBorne("A");
  hideBorne("B");
  el.resultat.textContent = "Cliquez A, puis B.";
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
  <h3>Le soleil</h3>
  <p>À chaque heure ronde, pour le point 48,857° N, 2,352° E. Jours depuis le 1<sup>er</sup> janvier 2000, 12 h UTC. Anomalie moyenne M = 357,5291° + 0,98560028° × j. Équation du centre C = 1,9148° sin M + 0,0200° sin 2M + 0,0003° sin 3M. Longitude écliptique λ = M + C + 102,9372° + 180°. Déclinaison δ = arcsin(sin λ sin ε), ε = 23,4397°. Puis hauteur et azimut. Modèle de aa.quae.nl, le même que SunCalc, à environ un degré près. L’heure Météo-France est en UTC ; l’affichage est en heure légale, UTC+2 en juin et UTC+1 en décembre.</p>
  <h3>L’ombre</h3>
  <p>${stats.buildingsWithHeight.toLocaleString("fr-FR")} bâtiments de la BD TOPO ont une hauteur photogrammétrique (altimétrie annoncée ${stats.altimetricPrecisionMeters.toLocaleString("fr-FR")} m, planimétrie ${stats.planimetricPrecisionMeters.toLocaleString("fr-FR")} m). L’ombre est portée au plus à ${scene.maxShadowMeters} m. Pas de toit en pente, pas d’arbre : un parc sans immeuble reste au soleil. Aucune hauteur par défaut.</p>
  <p>${stats.buildingsUnknownDrawn.toLocaleString("fr-FR")} emprises dans Paris n’ont pas de hauteur. Elles restent un contour en pointillés, sans volume, et ne projettent rien.</p>
  <h3>La couleur</h3>
  <p>L’axe est découpé en tronçons d’environ ${scene.sampleMeters} m. La couleur est la part de ces points à l’ombre, de 0 à 100&nbsp;%. De plus loin, ces tronçons sont regroupés en bouts d’environ ${scene.chunkMeters} m. Là où l’axe n’a pas été calculé, il n’y a pas de couleur.</p>
  <h3>Le trajet</h3>
  <p>A puis B, seulement sur les axes calculés dans le département. En été, un mètre au soleil du 25 juin coûte trente et une fois un mètre à l’ombre. En hiver, un mètre à l’ombre du 21 décembre coûte trente et une fois un mètre au soleil. Le trait suit les rues. Hors du 75, ou à plus de 60 m d’une rue calculée, rien n’est tracé.</p>
  <h3>Hauteur du soleil et air</h3>
  <table>
    <caption>Station ${scene.temperature.station} (${scene.temperature.id}), le 25 juin 2026. La couleur de la carte n’utilise pas ces températures.</caption>
    <thead><tr><th>Heure</th><th>Hauteur</th><th>Azimut</th><th>Air (°C)</th></tr></thead>
    <tbody>${sunRows}</tbody>
  </table>
  <h3>Sources</h3>
  <ul>
    <li>IGN, BD TOPO, bâtiments et tronçons de route du département 75, WFS Géoplateforme. Contour ADMIN EXPRESS. Licence Ouverte.</li>
    <li>${scene.temperature.source} À Luxembourg, ${scene.temperature.byHour[16] ?? "—"} °C à 16 h. À Montsouris, ${scene.montsouris.byHour[16] ?? "—"} °C à la même heure.</li>
    <li>Fond : OpenFreeMap, données OpenStreetMap. ODbL.</li>
  </ul>
`;
document.getElementById("fermer-methode").addEventListener("click", () => el.methode.close());

renderHour(hour, false);
