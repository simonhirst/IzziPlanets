import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const distRoot = path.resolve("dist");
const assetsRoot = path.join(distRoot, "assets");

function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

function findAsset(prefix, extension) {
  const files = fs.readdirSync(assetsRoot);
  const match = files.find((file) => file.startsWith(prefix) && file.endsWith(extension));
  if (!match) {
    throw new Error(`Missing asset for prefix=${prefix} ext=${extension}`);
  }
  return path.join(assetsRoot, match);
}

function sizeInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    raw: buffer.length,
    gzip: gzipSize(buffer),
  };
}

const budgets = [
  { label: "entry-js", file: findAsset("index-", ".js"), maxGzip: 2 * 1024 },
  { label: "runtime-js", file: findAsset("app-runtime-", ".js"), maxGzip: 30 * 1024 },
  { label: "three-vendor-js", file: findAsset("vendor-three-", ".js"), maxGzip: 170 * 1024 },
  { label: "runtime-css", file: findAsset("app-runtime-", ".css"), maxGzip: 8 * 1024 },
];

let failed = false;

for (const budget of budgets) {
  const info = sizeInfo(budget.file);
  const gzipKb = (info.gzip / 1024).toFixed(2);
  const maxKb = (budget.maxGzip / 1024).toFixed(2);
  console.log(`${budget.label}: gzip=${gzipKb} KB (budget ${maxKb} KB)`);
  if (info.gzip > budget.maxGzip) {
    failed = true;
    console.error(`Budget exceeded for ${budget.label}`);
  }
}

if (failed) {
  process.exit(1);
}
