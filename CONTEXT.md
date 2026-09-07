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
  service — see TASK_LOG.md and README.md "Product Images" section.

## Active task

_Nothing in progress right now._ Image-persistence fix is committed and
pushed (commit `be9a9f9`). One follow-up still needed from you:

- **Add the 3 Cloudinary env vars to the Render dashboard** (Settings →
  Environment) for the backend service — local `.env` doesn't reach
  Render on its own. Until you do, uploads will fail in production even
  though they work locally.
- 8 products have images that were already unrecoverably lost to this
  bug before the fix landed — they need a manual re-upload through the
  admin panel whenever convenient: Garnier Facewash, Mamaearth facewash,
  Fair and Lovely facewash, Biotique Facewash (x2), Vaseline Complete 10,
  Mamaearth Vitamin C daily Facewash, Everyouth Chocolate and Cherry
  Scrub.

## Open questions / decisions pending

_None._

## Last updated

2026-09-07
