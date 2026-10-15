import { build } from "esbuild";
import { cp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import {createHash} from 'node:crypto';
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STARTERS, BENCHMARKS } from "../public/model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });
await build({ entryPoints: [path.join(root, "public/app.js"),path.join(root,"public/section-worker.js"),path.join(root,"public/thumbnail-worker.js")], bundle: true, format: "esm", minify: true, sourcemap: false, outdir: output, target: "es2022" });
await mkdir(path.join(output, "api"), { recursive: true });
const catalog = {
  name: "GM Studio model catalog",
  version: "0.4.0",
  localDataPolicy: "Model documents stay in the browser unless you export or provide them to an agent tool.",
  entries: STARTERS.map(({ id, name, family, kind, status, subtitle, source, version, href, sourceNote, simplification, note }) => ({
    id, name, family, kind, status, subtitle,
    ...(source ? { source, version, href, sourceNote, simplification } : { note })
  })),
  benchmarks: BENCHMARKS.map(({ id, name, source, version, href, sourceNote, simplification }) => ({ id, name, source, version, href, sourceNote, simplification }))
};
await writeFile(path.join(output, "api", "models.json"), `${JSON.stringify(catalog, null, 2)}\n`);
const shell=(await readdir(output)).filter(name=>/\.(js|css|html|webmanifest|svg)$/.test(name)&&name!=='sw.js').map(name=>name==='index.html'?'/':'/'+name);
for(const name of await readdir(path.join(output,'icons')))shell.push('/icons/'+name);
const worker=await readFile(path.join(root,'public/sw.js'),'utf8');
const hash=createHash('sha256').update(worker);for(const name of shell)hash.update(await readFile(path.join(output,name==='/'?'index.html':name)));
await writeFile(path.join(output,'sw.js'),worker.replace('__GM_CACHE_VERSION__',hash.digest('hex').slice(0,16)).replace('__GM_SHELL_FILES__',JSON.stringify(shell)));
console.log(`Built ${output}`);
