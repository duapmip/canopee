import { readFile } from "node:fs/promises";
import { createAtlasPath } from "../src/story-atlas-geometry.js";
import { shadeColor } from "../src/story-palette.js";

const number = (value, digits = 0) => value.toLocaleString("fr-FR", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function atlasFigure(data) {
  const path = createAtlasPath(data);
  const hours = [9, 14, 16, 19];
  const indices = hours.map(hour => data.hours.indexOf(hour));
  const initial = hours.indexOf(16);
  const summaries = indices.map(index => {
    const { hour, lowShade, known } = data.hourly[index];
    return `À ${hour} h, ${lowShade} secteurs sur ${known} ont moins de 40 % d’ombre.`;
  });
  const cells = data.cells.map(cell => {
    const shades = indices.map(index => cell.shade[index]);
    return `<path d="${path(cell.ring)}" data-shades="${shades.join(",")}" fill="${shadeColor(shades[initial])}"/>`;
  }).join("");
  const buttons = hours.map((hour, i) => {
    return `<button type="button" data-atlas-index="${i}" data-summary="${summaries[i]}" aria-pressed="${i === initial}">${hour} h</button>`;
  }).join("");
  return {
    atlas: `<path d="${path(data.ring)}" fill="#263e56" stroke="#668095" stroke-width="1"/><g stroke="#182e44" stroke-width=".65" stroke-linejoin="round">${cells}</g>`,
    hours: buttons,
    atlasSummary: summaries[initial],
  };
}

function heatObservations(csv, modelDate) {
  const byYear = new Map();
  let lastDate, mapMaximum;
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [station, date, tx, quality] = line.split(";");
    if (station !== "75114001" || quality !== "1" || !tx || !Number.isFinite(Number(tx))) {
      throw new Error("Relevé de température quotidien invalide : " + date);
    }
    const iso = date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6);
    const day = new Date(iso + "T00:00:00Z");
    if (lastDate && day - lastDate !== 86_400_000) throw new Error("Série quotidienne discontinue : " + iso);
    lastDate = day;
    const year = day.getUTCFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + Number(Number(tx) > 35));
    if (iso === modelDate) mapMaximum = Number(tx);
  }
  if (mapMaximum == null) throw new Error("Maximum quotidien absent pour la journée de la carte");
  const lastYear = lastDate.getUTCFullYear();
  const through = lastDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
  const maxCount = Math.max(1, ...byYear.values());
  const rows = [...byYear].map(([year, count]) => {
    const label = year === lastYear ? `${year} <small>au ${through}</small>` : year;
    return `<div class="heat-row"><div><strong>${label}</strong><span>${count} ${count === 1 ? "jour" : "jours"}</span></div>
      <div class="heat-track" aria-hidden="true"><i style="width:${count / maxCount * 100}%"></i></div></div>`;
  });
  return { heatRows: rows.join(""), heatCount: byYear.get(lastYear), heatYear: lastYear, heatThrough: through, mapMaximum: number(mapMaximum, 1) };
}

function trafficPlot(stations, at16) {
  const matched = stations.filter(s => s.validations != null && s.shadeToday[at16] != null);
  const max = Math.ceil(Math.max(...matched.map(s => s.validations)) / 20e6) * 20;
  const x = value => 36 + value * 4.7;
  const y = value => 205 - value / max * 188;
  const xStation = s => x(100 - s.shadeToday[at16]).toFixed(1);
  const yStation = s => y(s.validations / 1e6).toFixed(1);
  const lines = [];
  for (let tick = 0; tick <= max; tick += 20) {
    lines.push(`<line x1="36" x2="506" y1="${y(tick)}" y2="${y(tick)}"/><text x="28" y="${y(tick) + 4}" text-anchor="end">${tick}</text>`);
  }
  for (const tick of [0, 20, 40, 60, 80, 100]) {
    lines.push(`<text x="${x(tick)}" y="227" text-anchor="middle">${tick} %</text>`);
  }
  const top = [...matched].sort((a, b) => b.validations - a.validations).slice(0, 3);
  return `<rect x="${x(60)}" y="17" width="${x(100) - x(60)}" height="188" fill="#fbf1d6"/>
    <g class="plot-axis">${lines.join("")}</g>
    <line x1="${x(60)}" x2="${x(60)}" y1="17" y2="205" stroke="#bda363" stroke-dasharray="3 4"/>
    ${matched.map(s => `<circle cx="${xStation(s)}" cy="${yStation(s)}" r="3.4" fill="${s.shadeToday[at16] < 40 ? "#c4871a" : "#0055a4"}" fill-opacity=".78"><title>${escape(s.name)}, ${number(s.validations / 1e6, 1)} M de validations, ${s.shadeToday[at16]} % d’ombre</title></circle>`).join("")}
    ${top.map(s => `<text class="plot-label" x="${Number(xStation(s)) - 6}" y="${Number(yStation(s)) - 8}" text-anchor="end">${escape(s.name)}</text>`).join("")}`;
}

function walkingBars(comparison) {
  const max = Math.max(comparison.shortest.minutes, comparison.preferred.minutes);
  return [["Le plus court", comparison.shortest], ["En cherchant l’ombre", comparison.preferred]].map(([label, route]) =>
    `<div class="walk-row"><div class="walk-label"><strong>${label}</strong><span>${number(route.minutes)} min</span></div>
      <div class="walk-track" style="width:${100 * route.minutes / max}%" aria-hidden="true"><i style="width:${route.shadePercent}%"></i></div>
      <small>dont environ ${number(route.sunMinutes)} min au soleil</small></div>`).join("");
}

function stationDots(groups) {
  const dots = [];
  for (const [count, type] of groups) {
    for (let i = 0; i < count; i++) {
      const index = dots.length;
      dots.push(`<circle cx="${8 + index % 30 * 13}" cy="${8 + Math.floor(index / 30) * 13}" r="4.5" class="dot-${type}"/>`);
    }
  }
  return dots.join("");
}

function stationHours(data) {
  const hours = [9, 12, 16, 19];
  const rows = ["République", "Gare de Lyon", "Bastille"].map(name => {
    const station = data.stations.find(s => s.name === name);
    const cells = hours.map(hour => {
      const shade = station.shadeToday[data.hours.indexOf(hour)];
      return `<td style="background:${shadeColor(shade / 100)};color:${shade >= 76 ? "#fff" : "#020a12"}">${shade}<small> %</small></td>`;
    });
    return `<tr><th scope="row">${escape(station.name)}</th>${cells.join("")}</tr>`;
  });
  return `<thead><tr><td></td>${hours.map(hour => `<th scope="col">${hour} h</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`;
}

// Render the pitch from the published story at build time. A projector only
// needs the finished page and its images, including for the interactive atlas.
export async function renderPresentation(html) {
  const [data, hex, temperatures] = await Promise.all([
    ...["story", "story-hex"].map(async name =>
      JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"))),
    readFile(new URL("../public/data/paris-montsouris-tx.csv", import.meta.url), "utf8"),
  ]);
  const at16 = data.hours.indexOf(16);
  const frame = data.hourly.find(row => row.hour === 16);
  const example = data.examples.find(row => row.id === "republique");
  const route = example.comparisons.find(row => row.season === "ete" && row.hour === 16);
  const gare = data.stations.find(s => s.name === "Gare de Lyon");
  const moved = frame.lowShade - frame.futureLowShade;
  const above = frame.known - frame.lowShade;
  const params = new URLSearchParams({ a: example.a.join(","), b: example.b.join(","), season: route.season, h: route.hour, accept: 0 });
  const values = {
    ...atlasFigure(hex),
    ...heatObservations(temperatures, data.method.summer),
    stationCount: frame.known, lowShade: frame.lowShade,
    scatter: trafficPlot(data.stations, at16),
    gareShade: gare.shadeToday[at16], gareSun: 100 - gare.shadeToday[at16], gareWater: gare.waterMeters,
    distantWater: data.stations.filter(s => s.waterMeters > 250).length,
    walkBars: walkingBars(route), detour: number(route.preferred.minutes - route.shortest.minutes),
    routeUrl: "./index.html?" + escape(params.toString()),
    futureLow: frame.futureLowShade, moved, above,
    dots: stationDots([[frame.futureLowShade, "low"], [moved, "change"], [above, "above"]]),
    stationHours: stationHours(data),
  };
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error("Champ de présentation inconnu : " + key);
    return values[key];
  });
}
