# Assistant operations

## Request path

1. The browser sends a prompt and the current JSON model to `/api/assistant` only on Send.
2. The Worker checks origin, request size, structural validity and model size.
3. A SQLite Durable Object atomically reserves the maximum estimated call cost against the browser's UTC day and the service's UTC day. One active request per browser is allowed.
4. OpenAI `/v1/decisions` (`gpt-6-luna`) classifies complexity. `/v1/responses` uses the same low-cost model with low or medium reasoning, a strict schema, no external tools, `store:false` and an output token cap.
5. The Worker independently validates the plan, resolves step references, runs the existing builders and checks each intermediate document. No generated code is executed.
6. The result is a complete canonical JSON model. The browser loads it as one undoable edit only if the original geometry has not changed. Otherwise it offers the JSON as a download.

The assistant supports primitive cells, Boolean combinations, moves, rotations, arrays, duplication, deletion, grouping, pins, lattices and placements. Its schema excludes arbitrary code, material composition generation and raw XML.

## Budget

Amounts are integer microdollars. The browser allowance is 500,000 microdollars per UTC day. An opaque HttpOnly, SameSite browser cookie is issued by the ledger and lasts 30 days. Clearing cookies creates a new identity; the service-wide cap remains effective. This is an anonymous browser allowance, not a user account entitlement.

Reservations use UTF-8 payload bytes plus framing overhead as a conservative token bound. Response generation is capped at 8,192 output tokens including reasoning. On receipt of usage, unused allowance is returned. Unknown upstream outcomes retain the call reservation. A crashed request retains its reservation; it never silently becomes free. API error responses below 500 refund that call's reserve. No automatic paid retries occur.

Rates checked on 2026-10-14:

- Decisions: $0.10 per million input tokens, no output charge.
- GPT-6 Luna Standard: $0.10 input, $0.01 cached input, $0.125 cache writes and $0.50 output per million tokens.
- The allowance conservatively charges non-cached input at the cache-write rate. It can be slightly higher than the invoice. The request size stays below long-context thresholds. Only the global OpenAI endpoint and Standard service tier are used.

Sources: [Decisions](https://developers.openai.com/api/docs/guides/decisions), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing).

Recheck rates before changing the model, endpoint, tier or token cap. The default shared daily cap is $20 and can be changed through `AI_DAILY_SERVICE_USD` in `wrangler.toml`. Infrastructure charges are separate from the API allowance.

## Stored data

`AssistantLedger`, singleton `gm-v1`, stores browser identity expiry, daily usage, reservations and optional subscriptions. Prompts, model documents and OpenAI credentials are not persisted. Old usage and reservation records are removed by a daily alarm after two days; browser identities expire after 30 days.

Set `MAILING_LIST_ENABLED = "true"` to display the consent form. Subscriptions contain the normalized email, consent wording and subscription time. No email is sent automatically. Preferences can remove the subscription associated with that browser. Any later mailing service must provide an unsubscribe link independent of the browser cookie and handle address verification before campaigns.

Subscriptions are stored under `subscriber:<sha256(email)>`. To export them, configure a separate Worker secret with `npx wrangler secret put MAILING_ADMIN_TOKEN`. An authenticated `GET /api/assistant/subscribers` with `Authorization: Bearer <that secret>` returns up to 500 entries and a `next` cursor. Pass that cursor as `?after=` for the next page. The endpoint is closed when the secret is missing. Treat exports as personal data and keep them outside this repository.

## Deployment

`OPENAI_API_KEY` is a Worker secret, never a client variable. Missing credentials leave manual editing functional and report that the assistant is not connected. The browser never falls back to a simulated AI result.

The first deploy uses migration `assistant-v1` with `new_sqlite_classes`. The PWA caches versioned app assets only; `/api/*` requests bypass the service worker. Updates wait for existing app windows to close so a model session does not mix application versions.
