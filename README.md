# GM

[Open the studio](https://gm.keff.uk) - [k_eff](https://keff.uk)

GM is an experiment in building OpenMC geometry in the browser. The goal is a small CAD workspace for creating solids, combining CSG regions, inspecting sections and exporting editable OpenMC models.

Start empty or use one of 21 editable examples covering CSG, shielding, detectors and reactors. Move, duplicate and combine cells, edit materials, and build nested universes and lattices. Models autosave in your browser. Install the app for offline editing.

## Architecture

The source of truth is a JSON document (`gm-openmc-model/v1`), in centimetres. It preserves OpenMC surfaces, Boolean regions, cells, materials, universes and lattices.

| Part | Implementation |
| --- | --- |
| Construction | Shared JavaScript builders for the editor, examples and model API |
| Views | Three.js instances for repeated universes; workers generate Boolean meshes; sections evaluate CSG regions |
| Export | `geometry.xml`, `materials.xml`, JSON and an editable OpenMC Python script |
| Storage | Local browser storage for models; a Cloudflare Durable Object for optional mailing-list subscriptions |
| Hosting | Cloudflare Worker and static assets, with a service worker for offline use |

The 3D mesh approximates curved and Boolean surfaces. Sections and exports use the canonical geometry. Geometry checks sample for gaps and overlaps; they do not prove validity. Material presets and generic reactor examples are illustrative. Benchmark sources and simplifications live in model metadata.

GM does not run particle transport. DAGMC import, rotated universe fills, distributed materials, settings and tallies are not implemented. Review exported geometry before using it in a simulation.

## Run locally

With Node.js 24:

```sh
npm ci
npm run build
npm run dev
```

The static server prints its address. For Worker endpoints, run `npx wrangler dev` after building.

## Deployment

GitHub Actions checks geometry and validates XML/Python exports with OpenMC 0.15.3. Cloudflare Workers Builds deploys `main` after `npm run ci`. Worker configuration is in `wrangler.toml`.

`MAILING_LIST_ENABLED` controls opt-in update subscriptions. Collection records consent and does not send email. Subscriber export requires the `MAILING_ADMIN_TOKEN` Worker secret.

[Construction and model API](public/docs/construction.md) - [Agent API](https://gm.keff.uk/docs/agents/) - [OpenMC documentation](https://docs.openmc.org/en/stable/)
