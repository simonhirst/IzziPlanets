import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("public/assets/textures/planets");
const OUT = path.resolve("public/assets/textures/manifest.json");

async function main() {
  const files = await fs.readdir(ROOT);
  const grouped = new Map();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".ktx2"].includes(ext)) continue;
    const base = path.basename(file, ext);
    if (!grouped.has(base)) grouped.set(base, {});
    grouped.get(base)[ext.slice(1)] = `/assets/textures/planets/${file}`;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    textures: Object.fromEntries(grouped.entries()),
  };

  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
