# GM

OpenMC geometry editor at https://gm.keff.uk.

## Development

Node.js 24.

```sh
npm ci
npm run ci
npm run dev
```

The dev server serves the built files at the address it prints. Rebuild after source edits. `npx wrangler dev` also runs the stateless MCP endpoint.

## Editor

- 13 editable examples and an empty geometry.
- Canonical CSG surfaces, regions, cells, materials, universes and rectangular/hexagonal lattices.
- Instanced GPU 3D, synchronized CSG sections, selection, isolation and cutaway.
- Shared-universe or single-occurrence edits, lattice painting, translations, undo/redo and local autosave.
- XML import/export and a Python OpenMC loader.

Complex Boolean meshes use worker-based voxelization. Sections evaluate canonical regions. Source notes remain in model metadata and [example documentation](public/docs/benchmarks/index.html). Material recipes are illustrative. Exports were parsed and re-exported with the OpenMC 0.15.3 Python API, with matching cell queries on 1,040 points. No transport solver is bundled. The format excludes rotated universes, distributed materials, settings and tallies.

## Agents

WebMCP tools edit the current browser workspace. `window.gmStudio` exposes the same operations. `/api/mcp` processes explicit model documents without persistence. Discovery: `/api/models.json`, `/openapi.json`, `/.well-known/mcp.json` and `/llms.txt`.

## Deployment

GitHub Actions runs syntax checks, geometry tests and the production build. Cloudflare Workers Builds follows `main`, runs `npm run ci`, then `npx wrangler deploy`. The Worker serves `dist/` and the `/api/mcp` handler at `gm.keff.uk`.
