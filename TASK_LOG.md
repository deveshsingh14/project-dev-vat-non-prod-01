# Task log

Running log of work requested across this project. Updated as we go — one
change at a time, tested against the real dev DB/API, committed, then
pushed to `main` (which auto-deploys the backend on Render and the
frontend via GitHub Pages).

## Done

- **Products can be created without an image, and get one added later**
  (commit `603d424`)
  - `Product.image` is now nullable (schema + migration
    `20260901000000_make_product_image_optional`), so a bulk-upload CSV
    row with a blank `image` column creates the product instead of
    failing per-row.
  - Bulk-upload, create, and update routes normalize a blank/whitespace
    image to `null`.
  - Admin "Edit product" modal now has an upload-image-file control
    (previously only the Add-product form had one), so an image can be
    attached to an existing product that was created without one.
  - Storefront/admin/checkout/account show a placeholder swatch instead
    of a broken-image icon when a product has no image.
  - Tested locally against the real dev DB: imageless CSV row → created
    with `image: null`; upload + attach to that product → works; clear
    image (`""`) → stored as `null`; omitting `image` on update → left
    untouched. All test data cleaned up afterward.

- **Bug fix: `DELETE /products/:id` 500'd for any product with a
  category assigned** (found while cleaning up test data above)
  - The route deleted `cart`/`wishlist`/`orderItem` rows for the product
    but never deleted its `product_category` join rows, so deleting a
    categorized product hit a foreign-key violation.
  - Fixed by deleting `productCategory` rows for the product before
    deleting the product itself.
  - Tested locally: created a product with a category, deleted it →
    `200 Product deleted` (previously `500`). Cleaned up test data.

- **Rename Rajeshwari → Radha, branding only** (commit pending push)
  - Per your decision: the two top-level folders `Rajeshwari-Backend`/
    `Rajeshwari-Frontend` stay as-is since Render's dashboard root
    directory points at them; renaming those would need a coordinated
    update on your end and wasn't done here.
  - Changed: page titles, logo text, PWA manifest name/short_name, UPI
    display name (`radha@upi` / "Radha Bangles Jewellery"), service
    worker cache-key prefixes, `package.json`/`package-lock.json` name,
    README title/description, code comments, and the dev-only JWT
    fallback secret strings in `test_auth.js`/`test_rbac.js`.
  - Verified: `grep -ri rajeshwari` across the repo now only matches the
    intentionally-kept folder-path references (README structure diagram,
    `cd Rajeshwari-Backend`, the GitHub Pages workflow path). Confirmed
    `manifest.json`, `package.json`, and `package-lock.json` are still
    valid JSON after the edits.

- **Pincode-based order restriction**
  - New `pincode_restriction` (singleton enabled/disabled toggle) and
    `serviceable_pincode` (allow-list) tables, plus `/pincode-restrictions`
    routes (GET / PUT toggle / POST add / DELETE remove), ADMIN/OWNER-only.
  - Enforced only at `POST /orders/checkout`. The delivery details are
    now saved to the user's profile *before* the restriction check runs
    (previously that save happened after order creation), so a blocked
    customer's address is still saved even though their order isn't
    placed — browsing, cart, and saving an address were never blocked
    either way.
  - Off by default (`enabled: false`, empty allow-list) — every pincode
    can check out until you add pincodes and flip the toggle in the new
    "Delivery areas" admin panel section.
  - Tested locally end-to-end with a throwaway customer account: checkout
    succeeds with restriction off regardless of pincode; with it on, a
    non-listed pincode gets a 403 and the cart is left untouched, *and*
    the address was confirmed saved to the profile; a listed pincode
    still succeeds. Also checked: non-admin/owner tokens get 403 from all
    four `/pincode-restrictions` routes, and an invalid (non-6-digit)
    pincode is rejected with 400. Cleaned up the test orders/user
    afterward and restored product stock.

- **Bug fix: uploaded product images disappeared after every backend
  restart/redeploy**
  - Root cause: `POST /products/upload` wrote images to the backend's
    local disk (`uploads/`) via multer, served through
    `express.static("uploads")`. Render's filesystem is ephemeral — any
    file written at runtime (i.e. every image an admin ever uploaded
    through the panel) is wiped on the next restart/redeploy. Only the
    handful of images already committed to git survived.
  - Fixed by moving image storage to Cloudinary: `uploadMiddleware.js`
    now uses `multer.memoryStorage()` instead of `diskStorage`, and the
    `/products/upload` route uploads the in-memory buffer straight to
    Cloudinary (`src/config/cloudinary.js`) and returns its absolute
    `secure_url`. No frontend change needed — `imgSrc()` in
    store.js/admin.js/checkout.js/account.js already passed absolute
    URLs through unchanged.
  - Data migration: the 6 product images that had survived from an
    earlier migration (still present in `uploads/` and referenced by
    Product rows) were uploaded to Cloudinary and their DB `image`
    fields updated to the new Cloudinary URLs, via a one-off script
    (run once, then deleted — not part of the codebase).
  - **8 products already had dangling `/uploads/...` references from
    before this fix** — those specific files were already wiped by a
    prior restart and are unrecoverable. They'll show broken/no image
    until an admin re-uploads through the panel (now durable). Affected:
    Garnier Facewash (28), Mamaearth facewash (30), Fair and Lovely
    facewash (29), Biotique Facewash (32 and 73), Vaseline Complete 10
    (7), Mamaearth Vitamin C daily Facewash (13), Everyouth Chocolate
    and Cherry Scrub (27).
  - New required env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
    `CLOUDINARY_API_SECRET` — set locally in `.env` (git-ignored) and
    must also be added to the Render dashboard's environment variables
    for the backend service, or production uploads will fail. Placeholder
    documented in `.env.example` and `README.md`.
  - Tested end-to-end: uploaded a real image through `/products/upload`
    with a valid admin token → got back a Cloudinary URL → confirmed
    that URL still returns `200` even with the backend process killed
    (`kill -9`), proving persistence no longer depends on the backend
    process/disk. Regression-checked: non-image file still rejected
    with `400`, unauthenticated upload still rejected with `401`.
    Verified `GET /products/:id` returns the new Cloudinary URLs for
    migrated products via the live API. Cleaned up the test image from
    Cloudinary afterward.
  - **Caught mid-task**: real Cloudinary credentials were briefly pasted
    into the git-tracked `.env.example` instead of the git-ignored
    `.env`. Fixed before anything was committed — moved the real values
    to `.env`, restored `.env.example` to placeholders. Nothing was
    ever pushed with the real secret in it.

- **Radha Scaling Audit — Phase 1 (quick wins)**
  - Full codebase audit (33 findings across security/error-handling/
    scalability/code-quality/testing/config/db/ops/frontend) published
    as an artifact; Phase 1 — the small-effort, highest-leverage
    items — implemented as 9 separate commits:
    1. Removed the hardcoded JWT secret in `test_auth.js` (now reads
       `process.env.JWT_SECRET`) and deleted `reset_password.js`
       entirely — it hardcoded a live account's email + a literal new
       password, and duplicated the already-existing, properly
       env-driven `resetAdminPassword.js`.
    2. Restricted CORS (`src/index.js`) to the real frontend origins
       (`https://deveshsingh14.github.io`, `localhost:5500`/
       `127.0.0.1:5500` for local dev) instead of `cors()` reflecting
       every origin. Rejects with `callback(null, false)`, not an
       Error, so a disallowed origin gets a clean 200 with no CORS
       header rather than a 500.
    3. Added `express-rate-limit` to `POST /auth/login` (10/15min) and
       `POST /auth/register` (5/hour) per IP.
    4. `npm audit fix` — 9 vulnerabilities (1 high) → 6 (all moderate,
       all transitive through firebase-admin).
    5. Removed the unused Firebase Admin wiring (`src/config/
       firebase.js` + the `firebase-admin` dependency) — confirmed
       zero importers anywhere and no planned-use mention first. This
       also fully cleared the remaining moderate vulnerabilities:
       `npm audit` is now 0/0/0/0. The local, git-ignored
       `firebase-service-account.json` was left on disk in case it's
       needed again.
    6. Added boot-time validation in `src/index.js` for `DATABASE_URL`,
       `JWT_SECRET`, and the 3 `CLOUDINARY_*` vars — exits with a
       clear message naming exactly which var is missing, instead of
       failing cryptically later (this is exactly what happened with
       the Cloudinary rollout above).
    7. Consolidated `API_URL`, `esc()`, `NO_IMAGE_PLACEHOLDER`, and
       `imgSrc()` — previously identical copies in `store.js`,
       `admin.js`, `checkout.js`, `account.js` — into the shared
       `api.js` (already home to `handle401`).
    8. Added `@@index` to the frequently-filtered FK columns (`Cart`,
       `Wishlist`, `Order`, `OrderItem`, `ProductCategory`) via a
       hand-written migration (generated with the read-only
       `prisma migrate diff`, applied with `prisma migrate deploy` —
       never `migrate dev`, per the drift note below).
    9. Added a real `GET /health` that runs `SELECT 1` through Prisma
       and returns `{status, db, timestamp}` — 200 when connected, 503
       when not.
  - Tested end-to-end after every single item against the real dev
    DB/API before moving to the next (details in each commit message):
    boot with/without required env vars, CORS allowed vs. disallowed
    origin, rate limits tripping at the 11th/6th request while a
    single normal request is unaffected, `npm audit` before/after,
    server still boots after removing firebase-admin, `node --check`
    on api.js concatenated with each page script (catches duplicate-
    declaration errors a browser's shared global scope would hit),
    `imgSrc()`/`esc()` output verified identical to pre-refactor
    behavior, all 9 new indexes confirmed present via a direct
    `pg_indexes` query, `/health` returns 200 connected and 503
    disconnected (tested against a deliberately broken `DATABASE_URL`
    in a throwaway `.env` copy, restored and verified byte-for-byte
    afterward). Final full pass across all 9 changes together before
    pushing.
  - Phase 2 (structural: centralized error middleware, pagination,
    input validation, structured logging, onDelete cascades,
    render.yaml, monitoring, backend CI) and Phase 3 (real test
    framework, service layer, caching) are documented in the audit but
    not started — see CONTEXT.md.

## Pending

Nothing outstanding right now — all three original requested changes,
the delete-product bug fix, the pincode restriction feature, the
image-persistence fix, and Phase 1 of the scaling audit are
implemented, tested, and pushed. Phase 2/3 of the audit are scoped
but not scheduled — see CONTEXT.md.

## Notes / things surfaced along the way (not acted on unless listed above)

- The dev database's migration *history* still literally describes
  PascalCase tables (`Product`, `Cart`, ...) from before an earlier
  ad-hoc rename to lowercase, even though the live tables are already
  lowercase and correct. Running `prisma migrate dev` will offer to
  **reset the database** because of this drift — do not accept that
  prompt. The image-nullable change above was applied as a hand-written,
  targeted migration instead, specifically to avoid triggering that
  reset.
