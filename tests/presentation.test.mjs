import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderPresentation } from "../scripts/presentation-figures.mjs";
import { shadeColor } from "../src/story-palette.js";

const readData = async name => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));

test("The pitch hour buttons and initial map use the same frames as the story", async () => {
  const hex = await readData("story-hex");
  const html = await renderPresentation("{{hours}}{{atlas}}");
  const buttons = [...html.matchAll(/data-atlas-index="(\d+)" data-summary="([^"]+)" aria-pressed="(true|false)">(\d+) h/g)];
  const hours = buttons.map(match => Number(match[4]));
  assert.deepEqual(hours, [9, 14, 16, 19]);
  for (const [, index, summary, pressed, hour] of buttons) {
    const frame = hex.hourly.find(row => row.hour === Number(hour));
    assert.equal(hours[Number(index)], frame.hour);
    assert.equal(pressed === "true", frame.hour === 16);
    assert.ok(summary.includes(`${frame.lowShade} secteurs sur ${frame.known}`));
  }
  const cells = [...html.matchAll(/data-shades="([^"]*)" fill="([^"]+)"/g)];
  assert.equal(cells.length, hex.cells.length);
  for (const [index, [, values, fill]] of cells.entries()) {
    const series = hex.cells[index].shade;
    assert.equal(values, hours.map(hour => series[hex.hours.indexOf(hour)]).join(","));
    assert.equal(fill, shadeColor(series[hex.hours.indexOf(16)]));
  }
});

test("The pitch demo opens the displayed route, hour and summer shade preference", async () => {
  const story = await readData("story");
  const example = story.examples.find(row => row.id === "republique");
  const comparison = example.comparisons.find(row => row.season === "ete" && row.hour === 16);
  const link = await renderPresentation("{{routeUrl}}");
  const url = new URL(link.replaceAll("&amp;", "&"), "http://localhost/");
  assert.equal(url.pathname, "/index.html");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    a: example.a.join(","), b: example.b.join(","),
    season: comparison.season, h: String(comparison.hour), accept: "0",
  });
});

test("The climate slide counts daily maxima strictly above 35 °C and dates the partial year", async () => {
  const heat = await renderPresentation("{{heatRows}}|{{heatCount}}|{{heatYear}}|{{heatThrough}}|{{mapMaximum}}");
  const [bars, count, year, through, maximum] = heat.split("|");
  const totals = [...bars.matchAll(/<span>(\d+) jours?<\/span>/g)].map(match => Number(match[1]));
  assert.deepEqual(totals, [5, 2, 2, 5, 19]);
  assert.deepEqual([count, year, through, maximum], ["19", "2026", "24 novembre", "40,1"]);
  const csv = await readFile(new URL("../public/data/paris-montsouris-tx.csv", import.meta.url), "utf8");
  const rows = csv.trim().split("\n").slice(1).map(row => row.split(";"));
  assert.equal(rows.length, 1789);
  assert.equal(rows[0][1], "20220101");
  assert.equal(rows.at(-1)[1], "20261124");
  assert.equal(rows.filter(([, date, tx]) => date.startsWith("2026") && Number(tx) === 35).length, 1);
});
