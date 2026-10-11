# GM Studio

GM Studio is a local-first browser workspace for editing a small starter subset of OpenMC geometry. The source is published in a private GitHub repository and the planned hosting target is Cloudflare Pages at `gm.keff.uk`.

## Run locally

Requirements: Node.js 20 or newer.

```sh
npm run build
npm run dev
```

Open `http://localhost:4173`. The static preview server does not run the Pages MCP Function. Use Cloudflare Pages preview or Wrangler to exercise `/api/mcp`.

## What is in this preview

- Fuel pin and schematic repeated rectangular lattice starters.
- A hexagonal lattice editing sketch and generic architecture sketches.
- Canvas projections, cell and surface selection, simple parametric edits, local undo/redo and browser autosave.
- A supported-subset XML reader, starter geometry and material XML output, and an OpenMC Python starter.
- Public benchmark source notes, catalog JSON, OpenAPI, browser scripting API and an HTTP MCP endpoint.

See [`public/docs/`](public/docs/index.html) for the import/export scope. This preview does not include the planned C++/WebAssembly geometry kernel, arbitrary Boolean CSG rendering, GPU acceleration, or a BEAVRS model. It does not run OpenMC. No exported model has been checked against an installed OpenMC release.

Benchmark cards identify source and version where available, explain what is absent, and do not bundle third-party benchmark inputs. Generic architectures are labeled as illustrative.

## Agent surfaces

- `GET /api/models.json` lists starter and benchmark references.
- `POST /api/mcp` exposes `catalog.list`, `geometry.template`, `geometry.validate` and `geometry.export` over JSON-RPC.
- `GET /openapi.json` describes the HTTP endpoints.
- `window.openmcStudio` exposes controls to browser automation in the current tab.
- `/.well-known/mcp.json` and `/llms.txt` provide endpoint discovery.

The endpoint processes supplied model JSON for one request and does not persist it. Avoid sending model files to an agent host unless its data path is appropriate for them.

## Cloudflare Pages

Build command: `npm run build`  
Output directory: `dist`  
Pages Functions source: `functions/`

`wrangler.toml` sets the Pages output directory. Git integration should connect the private `main` branch and the custom domain should be added in the Pages project settings.
