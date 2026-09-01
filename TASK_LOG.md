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

## Pending

Nothing outstanding right now — all three requested changes plus the
delete-product bug fix are implemented, tested, and pushed.

## Notes / things surfaced along the way (not acted on unless listed above)

- The dev database's migration *history* still literally describes
  PascalCase tables (`Product`, `Cart`, ...) from before an earlier
  ad-hoc rename to lowercase, even though the live tables are already
  lowercase and correct. Running `prisma migrate dev` will offer to
  **reset the database** because of this drift — do not accept that
  prompt. The image-nullable change above was applied as a hand-written,
  targeted migration instead, specifically to avoid triggering that
  reset.
