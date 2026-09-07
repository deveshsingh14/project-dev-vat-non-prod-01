// Centralized API_URL / esc() / imgSrc() to replace duplicated logic
// across store.js, admin.js, checkout.js, account.js.

const API_URL = "https://project-dev-vat-non-prod-01.onrender.com";

function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Uploaded images are Cloudinary's absolute URLs; a handful of legacy
// products still carry a relative /uploads/... path from before that
// migration, so prefix the API origin for anything that isn't already
// absolute.
const NO_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4ede4'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='14' fill='%23b8a68f' text-anchor='middle' dominant-baseline='middle'%3ENo image%3C/text%3E%3C/svg%3E";
function imgSrc(image) {
  if (!image) return NO_IMAGE_PLACEHOLDER;
  return image.startsWith("http") ? image : API_URL + image;
}

function handle401(res) {
  if (res && res.status === 401 && localStorage.getItem("token")) {
    localStorage.removeItem("token");

    // store.js specific reset
    if (typeof savedProductIds !== 'undefined') savedProductIds = new Set();
    if (typeof WISHLIST !== 'undefined') WISHLIST = [];

    if (typeof updateAuthUI === 'function') updateAuthUI();
    if (typeof updateWishCount === 'function') updateWishCount();
    if (typeof refreshCartCount === 'function') refreshCartCount();
    if (typeof applyFilters === 'function') applyFilters();

    if (typeof toast === 'function') {
      toast("Session expired — please log in again");
    }

    if (typeof openAuth === 'function') {
      openAuth();
    } else {
      setTimeout(() => (window.location.href = "index.html"), 1200);
    }
    return true;
  }
  return false;
}
