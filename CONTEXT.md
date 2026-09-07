# Context

Snapshot of "where we left off." Unlike [TASK_LOG.md](TASK_LOG.md) (a
permanent history of completed work), this file only tracks *current*
state and gets overwritten as things change — read this first when
starting a new session, especially after an IDE/chat restart.

## Environment notes

- IDE: Google Antigravity. Its chat-history panel has a known bug where
  past conversations vanish from the UI after a restart even though the
  underlying data is intact (stored under
  `~/.gemini/antigravity-ide/brain/<uuid>/`). This file exists as a
  workaround so context isn't lost to that bug.
- Repo layout: `Rajeshwari-Backend/` and `Rajeshwari-Frontend/` (folder
  names kept as-is despite the Radha rebrand — see TASK_LOG.md).
- Backend auto-deploys on Render, frontend via GitHub Pages, both on
  push to `main`.
- Neon's free-tier DB sleeps after ~20min idle and needs a moment to
  wake on the next query — seen a few times during testing as a
  transient `/health` 503 or a request that briefly fails then
  succeeds on retry. Not a bug; `/health` is doing its job correctly
  by surfacing it.
- Do not accept `prisma migrate dev`'s offer to reset the dev database —
  migration history has PascalCase-vs-lowercase drift from an old
  ad-hoc rename; live tables are already correct. Use targeted
  hand-written migrations instead (generate with `prisma migrate diff
  --script`, apply with `prisma migrate deploy` — established pattern,
  used for the FK-index and onDelete-cascade migrations below).
- Product images are stored on Cloudinary (not local disk — Render's
  filesystem is ephemeral). Requires `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env` locally *and*
  in the Render dashboard's environment variables for the backend
  service (confirmed set and working in production as of 2026-09-07)
  — see TASK_LOG.md and README.md "Product Images" section.
- Backend validates required env vars at boot (`DATABASE_URL`,
  `JWT_SECRET`, `CLOUDINARY_*`) and exits with a clear message naming
  the missing one, rather than failing cryptically later.
- CORS is restricted to `https://deveshsingh14.github.io` and
  `localhost:5500`/`127.0.0.1:5500` (`ALLOWED_ORIGINS` in
  `src/index.js`) — if a new frontend origin, staging domain, or local
  dev port is ever added, it needs to be added there or its requests
  will silently get no CORS headers (blocked client-side by the
  browser, not a server error).
- `/auth/login` and `/auth/register` are rate-limited (10/15min,
  5/hour per IP) — relevant if a future admin bulk-onboards many users
  from one IP and hits the register limit.
- Shared frontend helpers (`API_URL`, `esc()`, `imgSrc()`,
  `NO_IMAGE_PLACEHOLDER`, `handle401`) live in `Rajeshwari-Frontend/
  api.js`, loaded before every page script — add new shared logic
  there, not copy-pasted into store.js/admin.js/checkout.js/account.js.
- **`GET /products` and `GET /orders/admin/all` are now paginated** —
  they return `{items, total, page, limit, totalPages}`, not a bare
  array. Accept `?page`/`?limit` (default limit 50, clamped to 200).
  Any new frontend code (or a future mobile client, script, etc.)
  consuming these must read `.items`, not treat the response as the
  array directly.
- **`POST /products` and `PUT /products/:id` now validate** title/
  price/stock via Zod (`src/middleware/validate.js` +
  the schemas in `productRoutes.js`) — a bad request gets a 400 with
  per-field messages instead of silently writing a broken row.
- **Errors log through `logger` (pino), not `console.log`** —
  `require("../config/logger")` in any new route file, use
  `logger.error(...)`. Exception: don't use the logger for a message
  that must print immediately before `process.exit()` (pino-pretty's
  transport is a worker thread and can lose an in-flight message) —
  plain `console.error` there, as in index.js's boot-validation check.
- **Cart/Wishlist/Order/OrderItem/ProductCategory now cascade-delete**
  at the DB level (`onDelete: Cascade` in schema.prisma) — deleting a
  product, user, or category no longer needs manual `deleteMany`
  cleanup first; Prisma/Postgres handles it.
- `render.yaml` exists but is inert — the live Render service is still
  configured entirely through its dashboard, not linked to this file.
  Don't assume changing render.yaml affects the running deployment.
- `.github/workflows/backend-ci.yml` runs `npm audit --audit-level=high`
  (fails on high+ vulns) plus lint/test `--if-present` on push/PR to
  main (paths-scoped to Rajeshwari-Backend/). No lint/test script
  exists in package.json yet, so those steps currently no-op.
- A full best-practices audit ("Radha Scaling Audit") was done — Phase
  1 (quick wins, all 9 items) and Phase 2 (structural, items 1-6 and 8
  of 8) are complete. Phase 2 item 7 (Sentry error monitoring) and
  Phase 3 (real test framework, service layer, caching) are scoped but
  not started — see below and TASK_LOG.md for the full breakdown.

## Active task

_Nothing in progress right now._ Phase 1 (10 commits, `8c4894d`..
`b494b26`) and Phase 2 items 1-6/8 (7 commits, `d097b28`..`77cd8db`)
of the scaling audit are committed and pushed.

## Open questions / decisions pending

- **Phase 2 item 7 (Sentry error monitoring)** is blocked on you: it
  needs a new external account + DSN, which the task explicitly said
  to check on before proceeding. Decide whenever convenient — free
  tier is fine to start.
- Whether/when to start **Phase 3** of the audit (real test framework,
  a thin service layer to remove repeated CRUD/cascade boilerplate,
  a caching layer). Not urgent.
- A small, pre-existing, unrelated bug surfaced while testing Phase 2:
  `GET /products/:id` with a non-numeric id (e.g. `/products/abc`)
  throws a raw Prisma validation error instead of a clean 400/404.
  Noticed only because the new structured logger made it visible;
  worth a quick fix whenever convenient.
- 8 products still have images unrecoverably lost to the pre-fix
  image-persistence bug and need a manual re-upload through the admin
  panel whenever convenient: Garnier Facewash, Mamaearth facewash, Fair
  and Lovely facewash, Biotique Facewash (x2), Vaseline Complete 10,
  Mamaearth Vitamin C daily Facewash, Everyouth Chocolate and Cherry
  Scrub.

## Last updated

2026-09-07
