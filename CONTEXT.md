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

## Active task

_Nothing in progress right now._

## Open questions / decisions pending

_None._

## Last updated

2026-09-07
