import fs from "node:fs/promises";
import path from "node:path";

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const OUTPUT_PATH = path.resolve("public/data/ephemeris/latest.json");

const BODIES = [
  ["Mercury", "199"],
  ["Venus", "299"],
  ["Earth", "399"],
  ["Mars", "499"],
  ["Jupiter", "599"],
  ["Saturn", "699"],
  ["Uranus", "799"],
  ["Neptune", "899"],
  ["Pluto", "999"],
];

function buildUrl(code) {
  const params = new URLSearchParams({
    format: "text",
    COMMAND: `'${code}'`,
    EPHEM_TYPE: "VECTORS",
    CENTER: "'500@10'",
    START_TIME: `'${DATE}'`,
    STOP_TIME: `'${DATE}'`,
    STEP_SIZE: "'1 d'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'1'",
    REF_PLANE: "'ECLIPTIC'",
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;
}

function parseXYZ(text) {
  const match = text.match(/X\s*=\s*([-+0-9.E]+)\s+Y\s*=\s*([-+0-9.E]+)\s+Z\s*=\s*([-+0-9.E]+)/m);
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

async function fetchBody(name, code) {
  const res = await fetch(buildUrl(code));
  if (!res.ok) {
    throw new Error(`Horizons request failed for ${name}: ${res.status}`);
  }
  const text = await res.text();
  const xyz = parseXYZ(text);
  if (!xyz) {
    throw new Error(`Could not parse XYZ from Horizons response for ${name}`);
  }
  return xyz;
}

async function main() {
  const bodies = {};
  for (const [name, code] of BODIES) {
    const xyz = await fetchBody(name, code);
    bodies[name] = xyz;
  }

  const payload = {
    source: "NASA JPL Horizons",
    generatedAt: new Date().toISOString(),
    validAt: `${DATE}T00:00:00.000Z`,
    coordinateFrame: "heliocentric-au",
    bodies,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
