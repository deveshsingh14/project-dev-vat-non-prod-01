# Old-address redirect (optional)

After the GitHub repo is renamed from `project-dev-vat-non-prod-01` to
`radha-e-commerce`, GitHub Pages stops serving the old address
(`https://deveshsingh14.github.io/project-dev-vat-non-prod-01/`) — it does
not redirect project sites. Bookmarks, shared links and apps installed from
the old address would then show a 404.

To keep them working, publish **these four files** as a new public repo named
`project-dev-vat-non-prod-01` with GitHub Pages enabled (Settings → Pages →
Deploy from branch → `main` / root):

| File | Purpose |
|---|---|
| `index.html`, `404.html` | send any old URL to the same page on the new address (path, query and hash kept) |
| `redirect.js` | the redirect + retires the app installed from the old address |
| `service-worker.js` | kill switch picked up by already-installed old apps: unregisters itself and moves open windows to the new address |

Notes
- Same origin (`deveshsingh14.github.io`), so logins (`localStorage`) carry over.
- Push notifications enabled on the old address are tied to the old app and
  end when it is retired; customers turn them on again on the new site
  (the backend drops the dead subscriptions automatically).
- This folder is **not** deployed with the shop (the Pages workflow only
  uploads `Rajeshwari-Frontend/`).
