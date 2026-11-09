/**
 * Télécharge les bâtiments (hauteur) et les tronçons de route de tout le
 * département 75, plus une marge, depuis le WFS Géoplateforme.
 * Chaque page est écrite dans data/raw/paris/ et reprise si elle existe déjà.
 */
const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/raw/paris/", ROOT);
const WFS = "https://data.geopf.fr/wfs/ows";

const BBOX = [2.2, 48.8, 2.48, 48.92];
const COUNT = 1000;
const PARALLEL = 4;

async function page(typeName, start, propertyName) {
  const url = new URL(WFS);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", typeName);
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("BBOX", `${BBOX.join(",")},EPSG:4326`);
  url.searchParams.set("COUNT", String(COUNT));
  url.searchParams.set("STARTINDEX", String(start));
  if (propertyName) url.searchParams.set("PROPERTYNAME", propertyName);
  let last = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    last = `${res.status} ${await res.text()}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(last);
}

async function download(typeName, propertyName, dirName) {
  const dir = new URL(`${dirName}/`, OUT);
  await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
  const first = await page(typeName, 0, propertyName);
  const total = Number(first.numberMatched);
  const pages = Math.ceil(total / COUNT);
  const fs = await import("node:fs/promises");
  const target0 = new URL("page-000.json", dir);
  await fs.writeFile(target0, JSON.stringify(first));
  console.log(`${dirName} ${total} objets, ${pages} pages`);

  let next = 1;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= pages) return;
      const target = new URL(`page-${String(i).padStart(3, "0")}.json`, dir);
      try {
        const existing = await fs.readFile(target, "utf8");
        if (existing.includes('"features"')) {
          console.log(`${dirName} page ${i + 1}/${pages} déjà là`);
          continue;
        }
      } catch {
        /* à télécharger */
      }
      const json = await page(typeName, i * COUNT, propertyName);
      await fs.writeFile(target, JSON.stringify(json));
      console.log(`${dirName} page ${i + 1}/${pages}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

const deptUrl = new URL(
  `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ADMINEXPRESS-COG.LATEST:departement&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json&CQL_FILTER=${encodeURIComponent("code_insee='75'")}`,
);
const fs = await import("node:fs/promises");
await fs.mkdir(OUT, { recursive: true });
const deptPath = new URL("departement.json", OUT);
try {
  const existing = JSON.parse(await fs.readFile(deptPath, "utf8"));
  if (!existing.features?.[0]?.geometry) throw new Error("vide");
  console.log("contour du 75 déjà là");
} catch {
  const res = await fetch(deptUrl);
  if (!res.ok) throw new Error(await res.text());
  await fs.writeFile(deptPath, JSON.stringify(await res.json()));
  console.log("contour du 75 écrit");
}

await download("BDTOPO_V3:batiment", "hauteur,geometrie", "bat");
await download(
  "BDTOPO_V3:troncon_de_route",
  "geometrie,nom_voie_ban_gauche,nom_voie_ban_droite,insee_commune_gauche,insee_commune_droite,position_par_rapport_au_sol,prive,importance,nature,fictif",
  "rue",
);
