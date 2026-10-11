import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STARTERS, BENCHMARKS } from "../public/model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });
await mkdir(path.join(output, "api"), { recursive: true });
const catalog = {
  name: "GM Studio model catalog",
  version: "0.1.0-preview",
  localDataPolicy: "Model documents stay in the browser unless you export or provide them to an agent tool.",
  entries: STARTERS.map(({ id, name, family, kind, status, subtitle, source, version, href, sourceNote, simplification, note }) => ({
    id, name, family, kind, status, subtitle,
    ...(source ? { source, version, href, sourceNote, simplification } : { note })
  })),
  benchmarks: BENCHMARKS.map(({ id, name, source, version, href, sourceNote, simplification }) => ({ id, name, source, version, href, sourceNote, simplification }))
};
await writeFile(path.join(output, "api", "models.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${output}`);
