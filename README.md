# GM

[Open the studio](https://gm.keff.uk) - [k_eff](https://keff.uk)

GM is an experiment in building OpenMC geometry directly in the browser. The aim is to make CSG construction as direct as a small CAD tool: create solids, combine them, inspect sections and export a model you can keep editing in OpenMC.

Start empty or open one of 21 editable examples covering CSG, shielding, detectors and reactors. Select a cell to change its dimensions, move it, duplicate it or combine it with another. The optional assistant accepts a description of the geometry. Every generated edit can be undone.

## How it works

The source of truth is a JSON document (`gm-openmc-model/v1`), in centimetres. It stores surfaces, Boolean regions, cells, materials, universes and lattices in OpenMC's hierarchy.

| Part | Implementation |
| --- | --- |
| Construction | Shared JavaScript builders used by the editor, examples and agent tools |
| Views | Three.js with repeated universe instances; worker-generated meshes for Boolean solids; sections evaluate CSG regions |
| Export | `geometry.xml`, `materials.xml`, JSON and an editable OpenMC Python script |
| Assistant | OpenAI Decisions chooses reasoning effort; GPT-6 Luna returns a constrained JSON plan; the server applies validated operations to a copy of the model |
| Storage | Models autosave locally. A Cloudflare Durable Object stores assistant usage and optional mailing-list subscriptions |
| Hosting | Cloudflare Worker and static assets; service worker for offline editing and app installation |

The 3D mesh approximates curved and Boolean surfaces. Exports and sections use the canonical geometry. Geometry checks sample for overlaps and gaps; they are not a proof of validity. Material presets and generic reactor examples are illustrative. Benchmark sources and simplifications are preserved in model metadata.

GM does not run particle transport. DAGMC import, rotated universe fills, distributed materials, settings and tallies are not implemented. Review generated geometry before using it in a simulation.

## Run locally

Node.js 24:

```sh
npm ci
npm run build
npm run dev
```

The static server prints its address. To use the assistant API locally, copy `.dev.vars.example` to `.dev.vars`, set `OPENAI_API_KEY`, and run `npx wrangler dev` after building. Keep the key out of Git.

## Assistant allowance and data

The assistant uses an HttpOnly browser cookie and a server ledger to enforce **$0.50 per UTC day**, shared across tabs. Preferences shows estimated spend. The service-wide cap defaults to $20/day. Clearing cookies creates a new browser identity.

Prompts and model documents reach the GM Worker only on Send; OpenAI receives a geometry summary. GM stores usage totals, not prompts or models. Responses uses `store: false`; [OpenAI API data policies](https://developers.openai.com/api/docs/guides/your-data) still apply. Hide disables the assistant. Manual editing stays local.

## Deploy and contribute

GitHub Actions runs the existing geometry suite and validates exported XML/Python with OpenMC 0.15.3. Cloudflare Workers Builds deploys `main` after `npm run ci`. The first assistant deployment creates the Durable Object through the migration in `wrangler.toml`.

Set the Worker secret with `npx wrangler secret put OPENAI_API_KEY`. Mailing-list collection is controlled by `MAILING_LIST_ENABLED`; it records explicit consent and does not send email. See [assistant operations](docs/assistant.md) for budget, storage and subscription details.

[Construction and model API](public/docs/construction.md) - [Agent API](https://gm.keff.uk/docs/agents/) - [OpenMC documentation](https://docs.openmc.org/en/stable/)
