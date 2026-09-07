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
- Do not accept `prisma migrate dev`'s offer to reset the dev database —
  migration history has PascalCase-vs-lowercase drift from an old
  ad-hoc rename; live tables are already correct. Use targeted
  hand-written migrations instead.
- Product images are stored on Cloudinary (not local disk — Render's
  filesystem is ephemeral). Requires `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env` locally *and*
  in the Render dashboard's environment variables for the backend
  service (confirmed set and working in production as of 2026-09-07)
  — see TASK_LOG.md and README.md "Product Images" section.
- Backend now validates required env vars at boot (`DATABASE_URL`,
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
- A full best-practices audit ("Radha Scaling Audit") was done — Phase
  1 (quick wins) is complete; Phase 2 (structural: centralized error
  handling, pagination on GET /products and GET /orders/admin/all,
  input validation layer, structured logging, onDelete cascades in
  schema.prisma, render.yaml, monitoring, backend CI) and Phase 3 (real
  test framework, service layer, caching) are scoped but not started —
  see TASK_LOG.md for the full Phase 1 breakdown.

## Active task

_Nothing in progress right now._ Phase 1 of the scaling audit is
committed and pushed (10 commits, `8c4894d`..`0def478`).

## Open questions / decisions pending

- Whether/when to start **Phase 2** of the scaling audit (structural
  fixes — see above). Not urgent, but worth deciding on a timeline
  before the catalog/order volume grows much further, since the
  unpaginated `GET /products`/`GET /orders/admin/all` are the biggest
  landmines in there.
- 8 products still have images unrecoverably lost to the pre-fix
  image-persistence bug and need a manual re-upload through the admin
  panel whenever convenient: Garnier Facewash, Mamaearth facewash, Fair
  and Lovely facewash, Biotique Facewash (x2), Vaseline Complete 10,
  Mamaearth Vitamin C daily Facewash, Everyouth Chocolate and Cherry
  Scrub.

## Last updated

2026-09-07
