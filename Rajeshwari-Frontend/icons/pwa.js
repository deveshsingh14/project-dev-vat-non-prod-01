/* ============================================================
   PWA glue: registers the service worker, shows a branded
   "Install app" prompt, an offline banner, and an update notice.
   Include on every page: <script src="pwa.js" defer></script>
   ============================================================ */

(function () {

  // ---------- 1. register the service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js")
        .then(reg => {
          // If a new version is waiting, offer to refresh.
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateBar(reg);
              }
            });
          });
        })
        .catch(err => console.log("SW registration failed:", err));
    });
  }

  // ---------- 2. install prompt ----------
  let deferredPrompt = null;
  const DISMISS_KEY = "pwaPromptDismissedAt";
  const DISMISS_DAYS = 7;

  function recentlyDismissed() {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && (Date.now() - t) < DISMISS_DAYS * 864e5;
  }

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();          // suppress the browser's own mini-bar
    deferredPrompt = e;
    if (!recentlyDismissed()) setTimeout(showInstallCard, 2500);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    removeEl("pwaInstallCard");
  });

  function showInstallCard() {
    if (!deferredPrompt || document.getElementById("pwaInstallCard")) return;

    const card = document.createElement("div");
    card.id = "pwaInstallCard";
    card.innerHTML = `
      <div class="pwa-ico">R</div>
      <div class="pwa-copy">
        <strong>Install Rajeshwari</strong>
        <span>Add to your home screen for faster shopping</span>
      </div>
      <button class="pwa-yes" id="pwaYes">Install</button>
      <button class="pwa-no" id="pwaNo" aria-label="Dismiss">×</button>`;
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add("in"));

    document.getElementById("pwaYes").onclick = async () => {
      card.classList.remove("in");
      const p = deferredPrompt;
      deferredPrompt = null;
      if (!p) return;
      p.prompt();
      await p.userChoice;
      setTimeout(() => removeEl("pwaInstallCard"), 300);
    };
    document.getElementById("pwaNo").onclick = () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      card.classList.remove("in");
      setTimeout(() => removeEl("pwaInstallCard"), 300);
    };
  }

  // iOS/Safari never fires beforeinstallprompt — show manual instructions.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  if (isIOS && !standalone && !recentlyDismissed()) {
    window.addEventListener("load", () => setTimeout(() => {
      if (document.getElementById("pwaInstallCard")) return;
      const card = document.createElement("div");
      card.id = "pwaInstallCard";
      card.innerHTML = `
        <div class="pwa-ico">R</div>
        <div class="pwa-copy">
          <strong>Add to Home Screen</strong>
          <span>Tap Share <b>⎋</b> then “Add to Home Screen”</span>
        </div>
        <button class="pwa-no" id="pwaNo" aria-label="Dismiss">×</button>`;
      document.body.appendChild(card);
      requestAnimationFrame(() => card.classList.add("in"));
      document.getElementById("pwaNo").onclick = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        card.classList.remove("in");
        setTimeout(() => removeEl("pwaInstallCard"), 300);
      };
    }, 3500));
  }

  // ---------- 3. offline banner ----------
  function setOnlineState() {
    const offline = !navigator.onLine;
    let bar = document.getElementById("pwaOfflineBar");
    if (offline && !bar) {
      bar = document.createElement("div");
      bar.id = "pwaOfflineBar";
      bar.textContent = "You're offline — some things may not load";
      document.body.appendChild(bar);
      requestAnimationFrame(() => bar.classList.add("in"));
    } else if (!offline && bar) {
      bar.classList.remove("in");
      setTimeout(() => removeEl("pwaOfflineBar"), 300);
    }
  }
  window.addEventListener("online", setOnlineState);
  window.addEventListener("offline", setOnlineState);
  window.addEventListener("load", setOnlineState);

  // ---------- 4. update notice ----------
  function showUpdateBar(reg) {
    if (document.getElementById("pwaUpdateBar")) return;
    const bar = document.createElement("div");
    bar.id = "pwaUpdateBar";
    bar.innerHTML = `<span>A new version is available</span><button id="pwaReload">Refresh</button>`;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add("in"));
    document.getElementById("pwaReload").onclick = () => {
      if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
      location.reload();
    };
  }

  function removeEl(id) {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

})();
