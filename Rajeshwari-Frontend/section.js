/* ============================================================
   Storefront sections
     general   -> index.html     "Radha E-Commerce" (everything else)
     jewellery -> jewellery.html "Jewellery & Bangles"
   A category belongs to the jewellery section when the admin ticks
   "Jewellery & Bangles page" on it (category.isJewellery). A product is
   jewellery if ANY of its categories is. Missing flag (older backend)
   = not jewellery, so the main store keeps working regardless.
   Loaded before store.js; pure functions so they can be unit-tested.
   ============================================================ */

const SECTIONS = {
  general: {
    page: "index.html",
    allLabel: "For You",
    searchPlaceholder: "Search skincare, haircare, baby care…",
    emptyTitle: "Nothing here yet",
    emptyText: "Try a different search or category."
  },
  jewellery: {
    page: "jewellery.html",
    allLabel: "All Jewellery",
    searchPlaceholder: "Search bangles, earrings, chura…",
    emptyTitle: "Our jewellery collection is coming soon",
    emptyText: "Bangles, earrings and bridal sets will appear here shortly."
  }
};

function sectionFromDocument(doc) {
  const s = doc && doc.body && doc.body.dataset ? doc.body.dataset.section : "";
  return s === "jewellery" ? "jewellery" : "general";
}

function isJewelleryCategory(category) {
  return !!category && category.isJewellery === true;
}

function isJewelleryProduct(product) {
  return ((product && product.categories) || [])
    .some(link => isJewelleryCategory(link && link.category));
}

function productInSection(product, section) {
  const jewel = typeof product.jewellery === "boolean" ? product.jewellery : isJewelleryProduct(product);
  return section === "jewellery" ? jewel : !jewel;
}

function filterProductsBySection(products, section) {
  return (products || []).filter(p => productInSection(p, section));
}

function categoriesForSection(categories, section) {
  return (categories || []).filter(c =>
    section === "jewellery" ? isJewelleryCategory(c) : !isJewelleryCategory(c));
}

// Which section's page shows this category name (for links that cross
// sections, e.g. a product chip on the "wrong" page).
function sectionOfCategoryName(categories, name) {
  const c = (categories || []).find(x => x.name === name);
  return c && isJewelleryCategory(c) ? "jewellery" : "general";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SECTIONS,
    sectionFromDocument,
    isJewelleryCategory,
    isJewelleryProduct,
    productInSection,
    filterProductsBySection,
    categoriesForSection,
    sectionOfCategoryName
  };
}
