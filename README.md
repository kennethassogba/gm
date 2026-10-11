# GM Studio

GM Studio is a local-first browser workspace for editing OpenMC geometry starters. The source is published in a private GitHub repository and the Cloudflare Worker is configured for `gm.keff.uk`.

## Run locally

Requirements: Node.js 20 or newer.

```sh
npm run build
npm run dev
```

Open `http://localhost:4173`. The static preview server does not run the MCP endpoint. Use `npx wrangler dev` to exercise the Worker and `/api/mcp` locally.

## What is in this preview

- Fuel pin and schematic repeated rectangular lattice starters.
- A source-based BEAVRS 2D slice: published 19×19 core map, one representative 17×17 pin layout shared by its 193 map entries, pin geometry and an editable fuel radius.
- A hexagonal lattice editing sketch and generic architecture sketches.
- Canvas projections, cell and surface selection, simple parametric edits, local undo/redo and browser autosave.
- A supported-subset XML reader, starter geometry and material XML output, and an OpenMC Python starter.
- Public benchmark source notes, catalog JSON, OpenAPI, browser scripting API and an HTTP MCP endpoint.

See [`public/docs/`](public/docs/index.html) for the import/export scope. This preview does not include the planned C++/WebAssembly geometry kernel, arbitrary Boolean CSG rendering, GPU acceleration, or a complete BEAVRS model. The BEAVRS slice uses one representative pin-layout template and 3.1% UO₂ recipe across the 193 map entries; assembly-specific loading, baffle detail, enrichment zoning, control rods, burnable absorbers, instrumentation variants and boron are omitted. It does not run OpenMC. No exported model has been checked against an installed OpenMC release.

Benchmark cards identify source and version where available, explain what is absent, and do not bundle third-party benchmark inputs. Generic architectures are labeled as illustrative.

## Agent surfaces

- `GET /api/models.json` lists editable starters, source references and the simplified BEAVRS 2D slice.
- `POST /api/mcp` exposes `catalog.list`, `geometry.template`, `geometry.validate` and `geometry.export` over JSON-RPC.
- `GET /openapi.json` describes the HTTP endpoints.
- `window.openmcStudio` exposes controls to browser automation in the current tab.
- `/.well-known/mcp.json` and `/llms.txt` provide endpoint discovery.

The endpoint processes supplied model JSON for one request and does not persist it. Avoid sending model files to an agent host unless its data path is appropriate for them.

## Cloudflare Workers

Workers Builds uses `npm run build` followed by `npx wrangler deploy` from the repository root. `wrangler.toml` points the Worker entrypoint at `src/index.js` and serves the generated `dist/` assets. The Worker sends `/api/*` through its handler first; `/api/mcp` is implemented in `functions/api/mcp.js` and other API assets are served from `dist/`.

Connect the private `main` branch with Workers Builds, then add `gm.keff.uk` under the Worker’s custom domains.
