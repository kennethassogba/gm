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
- XML import/export and a standalone, editable Python OpenMC model.

Complex Boolean meshes use interpolated implicit surfaces in a worker. Sections evaluate canonical regions. Source notes remain in model metadata and [example documentation](public/docs/benchmarks/index.html). Material recipes are illustrative. Exports were parsed and re-exported with the OpenMC 0.15.3 Python API, with matching cell queries on 1,360 points across the 13 examples and four construction fixtures. No transport solver is bundled. DAGMC CAD import, rotated universes, distributed materials, settings and tallies are not implemented. 3D meshes approximate the CSG surfaces; XML, Python and section queries use canonical regions.

## Construction

Use **Add** to create a parameterized cell, pin, universe or lattice. Select a cell to move, duplicate or delete it. Shift-click selects multiple cells. **Combine** shows union, intersection and subtraction before applying them.

**Repeat in lattice** turns a placed pin into an assembly, or a placed assembly into a core. **Layout** paints named universes into positions. **Dimensions** changes the lattice while preserving painted positions. **Build with a guide** reconstructs each example using the same public builders as free construction.

The model boundary manages the remaining space as material or void. The geometry check samples the current universe for overlaps and gaps; it does not replace OpenMC geometry debugging.

[Construction model and agent API](public/docs/construction.md)

## Agents

WebMCP tools edit the current browser workspace. `window.gmStudio` exposes the same operations. `/api/mcp` processes explicit model documents without persistence. Discovery: `/api/models.json`, `/openapi.json`, `/.well-known/mcp.json` and `/llms.txt`.

## Deployment

GitHub Actions runs syntax checks, geometry tests and the production build. Cloudflare Workers Builds follows `main`, runs `npm run ci`, then `npx wrangler deploy`. The Worker serves `dist/` and the `/api/mcp` handler at `gm.keff.uk`.
