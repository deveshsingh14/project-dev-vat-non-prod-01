/* ============================================================
   Rajeshwari — service worker
   Strategy:
     app shell (html/css/js/icons) -> stale-while-revalidate
     product images                -> cache-first (they never change)
     API calls (/products, /cart…) -> network-only, never cached
                                      (prices, stock and carts must
                                       always be live)
   Bump CACHE_VERSION whenever you change the shell files.
   ============================================================ */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `rajeshwari-shell-${CACHE_VERSION}`;
const IMG_CACHE = `rajeshwari-img-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  "index.html",
  "checkout.html",
  "account.html",
  "offline.html",
  "store.css",
  "store.js",
  "checkout.js",
  "account.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

// ---------- install ----------
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      // addAll fails the whole install if ONE file 404s, so add
      // them individually and tolerate misses.
      Promise.all(SHELL_ASSETS.map(url =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

// ---------- activate: clean old versions ----------
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== IMG_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// allow the page to trigger an immediate update
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ---------- fetch ----------
self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle GETs. Never touch POST/PUT/DELETE — those are
  // orders, cart changes and logins.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // --- product images from the API's /uploads folder: cache-first ---
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // --- API data: always live, never cached ---
  const API_PATHS = ["/products", "/categories", "/cart", "/wishlist", "/orders", "/users", "/auth"];
  const isApiCall = API_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + "/"));
  if (isApiCall) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // --- cross-origin (fonts, QR service, CDN): let the network handle it ---
  if (url.origin !== self.location.origin) return;

  // --- app shell: stale-while-revalidate ---
  event.respondWith(
    caches.open(SHELL_CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });

      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      if (hit) {
        network; // refresh in the background
        return hit;
      }

      const res = await network;
      if (res) return res;

      // offline and nothing cached — show the offline page for navigations
      if (req.mode === "navigate") {
        const offline = await cache.match("offline.html");
        if (offline) return offline;
      }
      return Response.error();
    })
  );
});
