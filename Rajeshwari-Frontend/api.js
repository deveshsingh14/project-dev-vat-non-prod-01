// Centralized handle401 to replace duplicated logic across files

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
