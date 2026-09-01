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

## Pending (in order)

1. **Rename Rajeshwari → Radha, branding only** (per your decision — the
   two top-level folders `Rajeshwari-Backend`/`Rajeshwari-Frontend` stay
   as-is since Render's dashboard root directory points at them; renaming
   those would need a coordinated update on your end and isn't happening
   here). Covers: page titles, logo text, PWA manifest name, UPI display
   name, `package.json` name, README, code comments/log strings.
2. **Pincode-based order restriction**
   - New `enabled` toggle + serviceable-pincode allow-list, managed by
     ADMIN/OWNER from a new admin panel section.
   - Enforced only at `POST /orders/checkout` (order placement) —
     browsing, cart, and saving a delivery address/profile stay
     unaffected, so customers outside the list can still see and save
     an address; they just can't place an order until you add their
     pincode or turn the restriction off.
   - Off by default until pincodes are added and the toggle is flipped
     on.

## Notes / things surfaced along the way (not acted on unless listed above)

- The dev database's migration *history* still literally describes
  PascalCase tables (`Product`, `Cart`, ...) from before an earlier
  ad-hoc rename to lowercase, even though the live tables are already
  lowercase and correct. Running `prisma migrate dev` will offer to
  **reset the database** because of this drift — do not accept that
  prompt. The image-nullable change above was applied as a hand-written,
  targeted migration instead, specifically to avoid triggering that
  reset.
