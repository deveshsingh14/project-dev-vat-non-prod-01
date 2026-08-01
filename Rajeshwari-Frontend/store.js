/* ============================================================
   Rajeshwari storefront — explore feed engine
   Talks to the same backend as before:
     GET /products, /categories
     POST/GET/PUT/DELETE /cart      (auth)
     POST/GET/DELETE /wishlist     (auth)
     POST /auth/login, /auth/register
   Wishlist is now ONE system: the API one. Hearts everywhere
   reflect GET /wishlist, keyed by product id.
   ============================================================ */

const API_URL = "http://localhost:5000";

// ---------- state ----------
let PRODUCTS = [];          // normalized products
let CATEGORIES = [];
let WISHLIST = [];          // raw wishlist rows {id, productId, product}
let savedProductIds = new Set();
let activeCategory = "";    // category name; "" = all
let searchQuery = "";
let isLogin = true;

// ---------- helpers ----------
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function token() { return localStorage.getItem("token"); }
function authHeaders(json) {
  const h = { Authorization: `Bearer ${token()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
function imgSrc(image) {
  if (!image) return "";
  return image.startsWith("http") ? image : API_URL + image;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2000);
}
function normalizeProduct(p) {
  const categoryList = (p.categories || [])
    .map(c => c.category && c.category.name).filter(Boolean);
  return { ...p, categoryList, category: categoryList[0] || "" };
}

// Deterministic image height per pin so the masonry feels organic
// but doesn't reshuffle on every render.
const HEIGHTS = [220, 300, 260, 340, 240, 310, 280, 380];
function pinHeight(id) { return HEIGHTS[id % HEIGHTS.length]; }

// Emoji avatar for a category story, by name keywords.
function categoryEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes("bride") || n.includes("chooda") || n.includes("dulhan")) return "👰";
  if (n.includes("earring")) return "💎";
  if (n.includes("necklace")) return "📿";
  if (n.includes("bangle") || n.includes("bracelet")) return "⚜️";
  if (n.includes("gold") || n.includes("gram")) return "🥇";
  if (n.includes("bindi")) return "🔴";
  if (n.includes("nose")) return "💫";
  if (n.includes("makeup") || n.includes("foundation") || n.includes("lip")) return "💄";
  if (n.includes("skin") || n.includes("serum") || n.includes("care")) return "🌸";
  if (n.includes("bhabhi") || n.includes("gift") || n.includes("combo")) return "🎁";
  return "";
}

// ============================================================
//  LOADING
// ============================================================
async function boot() {
  renderSkeletons();
  try {
    const [prodRes, catRes] = await Promise.all([
      fetch(`${API_URL}/products`),
      fetch(`${API_URL}/categories`)
    ]);
    PRODUCTS = (await prodRes.json()).map(normalizeProduct);
    CATEGORIES = await catRes.json();
  } catch (e) {
    console.log(e);
    document.getElementById("masonry").innerHTML =
      `<div class="empty-feed" style="column-span:all"><div class="big">⚠</div>
       Couldn't reach the store. Is the backend running?</div>`;
    return;
  }
  renderStories();
  renderChips();
  applyFilters();
  refreshWishlist();
  refreshCartCount();
  updateAuthUI();
}

function renderSkeletons() {
  const m = document.getElementById("masonry");
  m.innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<div class="skel" style="height:${HEIGHTS[i % HEIGHTS.length]}px"></div>`).join("");
}

// ============================================================
//  CATEGORY STORIES + CHIPS  (driven by the real DB categories)
// ============================================================
function categoryCover(cat) {
  // First product image in this category becomes the story face.
  const p = PRODUCTS.find(pr => pr.categoryList.includes(cat.name));
  return p ? imgSrc(p.image) : "";
}
function renderStories() {
  const rail = document.getElementById("storiesRail");
  const stories = [{ name: "", label: "For You" }].concat(
    CATEGORIES.map(c => ({ name: c.name, label: c.name }))
  );
  rail.innerHTML = stories.map(s => {
    let face;
    if (s.name === "") {
      face = `<div class="face">✨</div>`;
    } else {
      const cover = categoryCover(s);
      const emoji = categoryEmoji(s.name);
      face = cover
        ? `<img class="face" src="${esc(cover)}" alt="">`
        : emoji
          ? `<div class="face">${emoji}</div>`
          : `<div class="face letter">${esc(s.name[0].toUpperCase())}</div>`;
    }
    return `
      <button class="story ${activeCategory === s.name ? "active" : ""}" data-cat="${esc(s.name)}">
        <div class="ring"><div class="ring-inner">${face}</div></div>
        <span class="s-label">${esc(s.label)}</span>
      </button>`;
  }).join("");
  rail.querySelectorAll(".story").forEach(btn =>
    btn.addEventListener("click", () => setCategory(btn.dataset.cat)));
}
function renderChips() {
  const bar = document.getElementById("chipBar");
  const chips = [{ name: "", label: "All" }].concat(
    CATEGORIES.map(c => ({ name: c.name, label: c.name }))
  );
  bar.innerHTML = chips.map(c => `
    <button class="chip-btn ${activeCategory === c.name ? "active" : ""}" data-cat="${esc(c.name)}">
      ${esc(c.label)}
    </button>`).join("");
  bar.querySelectorAll(".chip-btn").forEach(btn =>
    btn.addEventListener("click", () => setCategory(btn.dataset.cat)));
}
function setCategory(cat) {
  activeCategory = cat;
  renderStories();
  renderChips();
  applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetFeed() {
  activeCategory = "";
  searchQuery = "";
  document.getElementById("searchInput").value = "";
  renderStories(); renderChips(); applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
//  FEED
// ============================================================
function applyFilters() {
  let items = [...PRODUCTS];

  if (activeCategory) {
    items = items.filter(p => p.categoryList.includes(activeCategory));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(p =>
      `${p.title} ${p.description || ""} ${p.keywords || ""} ${p.categoryList.join(" ")}`
        .toLowerCase().includes(q));
  }

  const sort = document.getElementById("sortSelect").value;
  if (sort === "priceAsc") items.sort((a, b) => a.price - b.price);
  else if (sort === "priceDesc") items.sort((a, b) => b.price - a.price);
  else items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderFeed(items);
}

function renderFeed(items) {
  const m = document.getElementById("masonry");
  const end = document.getElementById("feedEnd");

  if (!items.length) {
    m.innerHTML = `
      <div class="empty-feed" style="column-span:all">
        <div class="big">⌕</div>
        <h3>Nothing here yet</h3>
        <p>Try a different search or category.</p>
        <button class="btn-solid" style="flex:none" onclick="resetFeed()">Back to For You</button>
      </div>`;
    end.style.display = "none";
    return;
  }

  m.innerHTML = items.map(p => {
    const h = pinHeight(p.id);
    const saved = savedProductIds.has(p.id);
    const out = p.stock <= 0;
    return `
    <div class="pin" data-id="${p.id}">
      <div class="pin-img" style="height:${h}px" onclick="handlePinClick(event, ${p.id})">
        <img src="${esc(imgSrc(p.image))}" alt="${esc(p.title)}" loading="lazy" style="height:${h}px">
        ${out ? `<div class="pin-out">Out of stock</div>` : ""}
        <div class="pin-veil">
          <div class="veil-top">
            <button class="save-btn ${saved ? "saved" : ""}" onclick="toggleSave(event, ${p.id})">
              ${saved ? "Saved" : "Save"}
            </button>
          </div>
          <div class="veil-bottom">
            <button class="veil-round" title="Add to bag" onclick="quickAdd(event, ${p.id})">🛍</button>
            <button class="veil-round" title="Share" onclick="shareProduct(event, ${p.id})">↗</button>
          </div>
        </div>
        <div class="burst" id="burst-${p.id}">♥</div>
      </div>
      <div class="pin-meta">
        <div class="pin-title">${esc(p.title)}</div>
        <div class="pin-row">
          <span class="pin-price">${inr(p.price)}</span>
          <span class="pin-cat">${esc(p.category)}</span>
        </div>
      </div>
    </div>`;
  }).join("");

  end.style.display = "block";

  // staggered reveal
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add("in"), (i % 6) * 55);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.05 });
  m.querySelectorAll(".pin").forEach(el => obs.observe(el));
}

// single click opens the sheet; double click = save (Instagram style)
let lastTap = { id: null, t: 0 };
function handlePinClick(e, id) {
  const now = Date.now();
  if (lastTap.id === id && now - lastTap.t < 300) {
    // double tap
    lastTap = { id: null, t: 0 };
    clearTimeout(handlePinClick._single);
    doubleTapSave(id);
    return;
  }
  lastTap = { id, t: now };
  clearTimeout(handlePinClick._single);
  handlePinClick._single = setTimeout(() => openSheet(id), 300);
}
function doubleTapSave(id) {
  const burst = document.getElementById("burst-" + id);
  if (burst) {
    burst.classList.remove("go");
    void burst.offsetWidth; // restart animation
    burst.classList.add("go");
  }
  if (!savedProductIds.has(id)) saveToWishlist(id);
}

// ============================================================
//  SEARCH
// ============================================================
const searchInput = document.getElementById("searchInput");
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  applyFilters();
});
function clearSearch() {
  searchInput.value = ""; searchQuery = ""; applyFilters(); searchInput.focus();
}
function focusSearch() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => searchInput.focus(), 250);
}

// ============================================================
//  PRODUCT SHEET
// ============================================================
// ADDED: "More like this" — up to 4 products sharing a category,
// shown inside the sheet. Clicking one opens its sheet.
function moreLikeThisHTML(p) {
  const similar = PRODUCTS.filter(x =>
    x.id !== p.id && x.categoryList.some(c => p.categoryList.includes(c))
  ).slice(0, 4);
  if (!similar.length) return "";
  return `
    <div class="mlt">
      <h4 class="mlt-title">More like this</h4>
      <div class="mlt-row">
        ${similar.map(s => `
          <button class="mlt-card" onclick="openSheet(${s.id})">
            <img src="${esc(imgSrc(s.image))}" alt="${esc(s.title)}" loading="lazy">
            <span class="mlt-name">${esc(s.title)}</span>
            <span class="mlt-price">${inr(s.price)}</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function openSheet(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const saved = savedProductIds.has(p.id);
  const stockCls = p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "ok";
  const stockTxt = p.stock <= 0 ? "Out of stock" : p.stock <= 5 ? `Only ${p.stock} left` : "In stock";

  document.getElementById("sheetGrid").innerHTML = `
    <div class="sh-img"><img src="${esc(imgSrc(p.image))}" alt="${esc(p.title)}"></div>
    <div class="sh-body">
      <span class="sh-cat">${esc(p.category || "Collection")}</span>
      <h2 class="sh-title">${esc(p.title)}</h2>
      <p class="sh-desc">${esc(p.description)}</p>
      <div class="sh-price-row">
        <span class="sh-price">${inr(p.price)}</span>
        <span class="sh-stock ${stockCls}">${stockTxt}</span>
      </div>
      <div class="sh-cats">
        ${p.categoryList.map(c =>
          `<button class="sh-chip" onclick="closeSheet(); setCategory('${esc(c)}')">${esc(c)}</button>`).join("")}
      </div>
      <div class="sh-actions">
        <button class="btn-solid" ${p.stock <= 0 ? "disabled" : ""} onclick="addToCart(${p.id})">
          ${p.stock <= 0 ? "Out of stock" : "Add to bag · " + inr(p.price)}
        </button>
        <button class="btn-line ${saved ? "saved" : ""}" id="sheetHeart" onclick="toggleSaveFromSheet(${p.id})">♥</button>
      </div>
      ${moreLikeThisHTML(p)}
    </div>`;
  document.getElementById("productSheet").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  document.getElementById("productSheet").classList.remove("open");
  document.body.style.overflow = "";
}
document.getElementById("productSheet").addEventListener("click", function (e) {
  if (e.target === this) closeSheet();
});

// ============================================================
//  WISHLIST  (one system: the API)
// ============================================================
async function refreshWishlist() {
  if (!token()) { WISHLIST = []; savedProductIds = new Set(); updateWishCount(); return; }
  try {
    const res = await fetch(`${API_URL}/wishlist`, { headers: authHeaders() });
    if (handle401(res)) return;
    if (!res.ok) return;
    WISHLIST = await res.json();
    savedProductIds = new Set(WISHLIST.map(w => w.productId ?? w.product?.id));
    updateWishCount();
  } catch (e) { console.log(e); }
}
function updateWishCount() {
  const el = document.getElementById("wishCount");
  el.textContent = savedProductIds.size || "";
  el.dataset.zero = savedProductIds.size ? "0" : "1";
}
function toggleSave(e, id) {
  e.stopPropagation();
  savedProductIds.has(id) ? removeSave(id) : saveToWishlist(id);
}
function toggleSaveFromSheet(id) {
  savedProductIds.has(id) ? removeSave(id) : saveToWishlist(id);
}
async function saveToWishlist(id) {
  if (!token()) { openAuth(); return; }
  try {
    const res = await fetch(`${API_URL}/wishlist`, {
      method: "POST", headers: authHeaders(true),
      body: JSON.stringify({ productId: id })
    });
    if (handle401(res)) return;
    if (res.ok || res.status === 400) {  // 400 = already saved
      await refreshWishlist();
      applyFilters();
      syncSheetHeart(id);
      toast("Saved ♥");
    }
  } catch (e) { console.log(e); }
}
async function removeSave(productId) {
  const row = WISHLIST.find(w => (w.productId ?? w.product?.id) === productId);
  if (!row) return;
  try {
    await fetch(`${API_URL}/wishlist/${row.id}`, { method: "DELETE", headers: authHeaders() });
    await refreshWishlist();
    applyFilters();
    renderWishlistDrawer();
    syncSheetHeart(productId);
    toast("Removed from saved");
  } catch (e) { console.log(e); }
}
function syncSheetHeart(id) {
  const h = document.getElementById("sheetHeart");
  if (h) h.classList.toggle("saved", savedProductIds.has(id));
}

function openWishlist() {
  if (!token()) { openAuth(); return; }
  document.getElementById("wishBack").classList.add("open");
  refreshWishlist().then(renderWishlistDrawer);
}
function closeWishlist() { document.getElementById("wishBack").classList.remove("open"); }
function renderWishlistDrawer() {
  const box = document.getElementById("wishlistItems");
  if (!WISHLIST.length) {
    box.innerHTML = `<div class="drawer-empty"><div class="big">♡</div>
      Nothing saved yet.<br>Double-tap any product to save it.</div>`;
    return;
  }
  box.innerHTML = WISHLIST.map(w => {
    const p = w.product || {};
    return `
    <div class="line-item">
      <img src="${esc(imgSrc(p.image))}" alt="">
      <div class="li-info">
        <div class="li-title">${esc(p.title)}</div>
        <div class="li-price">${inr(p.price)}</div>
        <div class="li-controls">
          <button class="li-move" onclick="moveToBag(${w.id}, ${p.id})">Move to bag</button>
          <button class="li-remove" onclick="removeSave(${p.id})">Remove</button>
        </div>
      </div>
    </div>`;
  }).join("");
}
async function moveToBag(wishId, productId) {
  await addToCart(productId, true);
  await removeSave(productId);
}

// ============================================================
//  CART
// ============================================================
async function refreshCartCount() {
  const el = document.getElementById("cartCount");
  if (!token()) { el.textContent = ""; el.dataset.zero = "1"; return; }
  try {
    const res = await fetch(`${API_URL}/cart`, { headers: authHeaders() });
    if (handle401(res)) return;
    if (!res.ok) return;
    const items = await res.json();
    const n = items.reduce((s, i) => s + i.quantity, 0);
    el.textContent = n || "";
    el.dataset.zero = n ? "0" : "1";
  } catch (e) { console.log(e); }
}
async function addToCart(productId, silent) {
  if (!token()) { openAuth(); return; }
  try {
    const res = await fetch(`${API_URL}/cart`, {
      method: "POST", headers: authHeaders(true),
      body: JSON.stringify({ productId, quantity: 1 })
    });
    if (handle401(res)) return;
    if (res.ok) {
      if (!silent) toast("Added to bag 🛍");
      refreshCartCount();
    }
  } catch (e) { console.log(e); }
}
function quickAdd(e, id) { e.stopPropagation(); addToCart(id); }

function openCart() {
  if (!token()) { openAuth(); return; }
  document.getElementById("cartBack").classList.add("open");
  loadCartDrawer();
}
function closeCart() { document.getElementById("cartBack").classList.remove("open"); }
async function loadCartDrawer() {
  const box = document.getElementById("cartItems");
  try {
    const res = await fetch(`${API_URL}/cart`, { headers: authHeaders() });
    if (handle401(res)) return;
    const items = await res.json();
    let total = 0;
    if (!items.length) {
      box.innerHTML = `<div class="drawer-empty"><div class="big">🛍</div>Your bag is empty.</div>`;
      document.getElementById("cartTotal").textContent = inr(0);
      return;
    }
    box.innerHTML = items.map(item => {
      const p = item.product || {};
      total += p.price * item.quantity;
      return `
      <div class="line-item">
        <img src="${esc(imgSrc(p.image))}" alt="">
        <div class="li-info">
          <div class="li-title">${esc(p.title)}</div>
          <div class="li-price">${inr(p.price)}</div>
          <div class="li-controls">
            <div class="qty">
              <button onclick="changeQty(${item.id}, ${item.quantity - 1})">−</button>
              <span>${item.quantity}</span>
              <button onclick="changeQty(${item.id}, ${item.quantity + 1})">+</button>
            </div>
            <button class="li-remove" onclick="removeCartItem(${item.id})">Remove</button>
          </div>
        </div>
      </div>`;
    }).join("");
    document.getElementById("cartTotal").textContent = inr(total);
  } catch (e) { console.log(e); }
}
async function changeQty(cartItemId, qty) {
  if (qty < 1) return removeCartItem(cartItemId);
  try {
    await fetch(`${API_URL}/cart/${cartItemId}`, {
      method: "PUT", headers: authHeaders(true),
      body: JSON.stringify({ quantity: qty })
    });
    loadCartDrawer(); refreshCartCount();
  } catch (e) { console.log(e); }
}
async function removeCartItem(cartItemId) {
  try {
    await fetch(`${API_URL}/cart/${cartItemId}`, { method: "DELETE", headers: authHeaders() });
    loadCartDrawer(); refreshCartCount();
  } catch (e) { console.log(e); }
}
function goToCheckout() { window.location.href = "checkout.html"; }

function backdropClose(e, which) {
  if (e.target !== e.currentTarget) return;
  which === "cart" ? closeCart() : closeWishlist();
}

// ============================================================
//  SHARE
// ============================================================
function shareProduct(e, id) {
  e.stopPropagation();
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  if (navigator.share) {
    navigator.share({ title: p.title, text: `${p.title} — ${inr(p.price)} at Rajeshwari Bangles & Jewellery` })
      .catch(() => {});
  } else {
    toast("Sharing isn't supported on this browser");
  }
}

// ============================================================
//  AUTH
// ============================================================
function openAuth() { document.getElementById("authModal").classList.add("open"); }
function closeAuth() { document.getElementById("authModal").classList.remove("open"); }
document.getElementById("authModal").addEventListener("click", function (e) {
  if (e.target === this) closeAuth();
});
function toggleAuthMode() {
  isLogin = !isLogin;
  document.getElementById("authTitle").textContent = isLogin ? "Welcome back" : "Create account";
  document.getElementById("authSub").textContent = isLogin
    ? "Log in to save products and shop."
    : "Sign up to start saving your favourites.";
  document.getElementById("authBtn").textContent = isLogin ? "Log in" : "Sign up";
  document.getElementById("authName").style.display = isLogin ? "none" : "block";
  document.getElementById("authSwitchText").textContent = isLogin ? "New here?" : "Already have an account?";
  document.getElementById("authSwitchBtn").textContent = isLogin ? "Create account" : "Log in";
}
async function submitAuth() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const name = document.getElementById("authName").value.trim();
  if (!email || !password || (!isLogin && !name)) { toast("Please fill in all fields"); return; }

  const endpoint = isLogin ? "login" : "register";
  const body = isLogin ? { email, password } : { name, email, password };
  try {
    const res = await fetch(`${API_URL}/auth/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!isLogin && res.ok) {
      // registered — now log them in seamlessly
      isLogin = true; toggleAuthMode(); toggleAuthMode(); // resync labels
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginRes.json();
      if (loginData.token) return finishLogin(loginData.token);
    }

    if (data.token) return finishLogin(data.token);
    toast(data.message || "Something went wrong");
  } catch (e) { console.log(e); toast("Couldn't reach the server"); }
}
function finishLogin(jwt) {
  localStorage.setItem("token", jwt);
  closeAuth();
  toast("Welcome ✨");
  let payload = null;
  try { payload = JSON.parse(atob(jwt.split(".")[1])); } catch (e) {}
  if (payload && payload.role === "ADMIN") { window.location.href = "admin.html"; return; }
  updateAuthUI();
  refreshWishlist().then(applyFilters);
  refreshCartCount();
}
function logout() {
  localStorage.removeItem("token");
  savedProductIds = new Set(); WISHLIST = [];
  updateAuthUI(); updateWishCount(); refreshCartCount(); applyFilters();
  toast("Logged out");
}
function updateAuthUI() {
  const authed = !!token();
  document.getElementById("loginBtn").style.display = authed ? "none" : "flex";
  document.getElementById("logoutBtn").style.display = authed ? "flex" : "none";
  const acct = document.getElementById("accountBtn");
  if (acct) acct.style.display = authed ? "flex" : "none";
}

// ADDED: when the 7-day JWT expires, API calls start returning 401.
// Instead of failing silently, log out gracefully and reopen login.
function handle401(res) {
  if (res && res.status === 401 && token()) {
    localStorage.removeItem("token");
    savedProductIds = new Set(); WISHLIST = [];
    updateAuthUI(); updateWishCount(); refreshCartCount(); applyFilters();
    toast("Session expired — please log in again");
    openAuth();
    return true;
  }
  return false;
}

// ---------- boot ----------
boot();
