/**
 * Tests for pwa.js: pure helpers + the install flow that drives
 * [data-pwa-install] slots and the install card.
 */

const DAY = 864e5;

function loadPwa() {
  let mod;
  jest.isolateModules(() => { mod = require("./pwa.js"); });
  return mod;
}

function fakeInstallPrompt(outcome = "accepted") {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.prompt = jest.fn();
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  delete window.RadhaPWA;
  window.matchMedia = jest.fn(() => ({ matches: false }));
  document.body.innerHTML = `
    <div id="slot" data-pwa-install hidden>
      <p data-pwa-install-text></p>
      <button data-pwa-install-btn>Install app</button>
    </div>`;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("recentlyDismissed", () => {
  const { recentlyDismissed, DISMISS_KEY } = loadPwa();
  const store = (v) => ({ getItem: (k) => (k === DISMISS_KEY ? v : null) });

  test("false when never dismissed", () => {
    expect(recentlyDismissed(Date.now(), store(null))).toBe(false);
  });
  test("true within 7 days", () => {
    const now = Date.now();
    expect(recentlyDismissed(now, store(String(now - 2 * DAY)))).toBe(true);
  });
  test("false after 7 days", () => {
    const now = Date.now();
    expect(recentlyDismissed(now, store(String(now - 8 * DAY)))).toBe(false);
  });
  test("false (not a crash) when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); } };
    expect(recentlyDismissed(Date.now(), blocked)).toBe(false);
  });
});

describe("isIOSDevice", () => {
  const { isIOSDevice } = loadPwa();
  test("detects iPhone", () => {
    expect(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
  });
  test("detects iPadOS that reports as a Mac", () => {
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });
  test("real Mac and Android are not iOS", () => {
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(isIOSDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Linux armv8l", 5)).toBe(false);
  });
});

describe("app name", () => {
  test("is spelled Radha E-Commerce", () => {
    expect(loadPwa().APP_NAME).toBe("Radha E-Commerce");
  });
});

describe("install flow", () => {
  test("slot stays hidden when installing isn't possible", () => {
    loadPwa();
    expect(window.RadhaPWA.state()).toBe("unavailable");
    expect(document.getElementById("slot").hidden).toBe(true);
  });

  test("beforeinstallprompt shows the slot; clicking prompts; slot hides afterwards", async () => {
    loadPwa();
    const evt = fakeInstallPrompt("accepted");
    window.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);           // browser mini-bar suppressed
    expect(window.RadhaPWA.state()).toBe("prompt");
    const slot = document.getElementById("slot");
    expect(slot.hidden).toBe(false);
    expect(slot.querySelector("[data-pwa-install-text]").textContent).toMatch(/Radha E-Commerce/);

    slot.querySelector("[data-pwa-install-btn]").click();
    expect(evt.prompt).toHaveBeenCalledTimes(1);
    await Promise.resolve(); await Promise.resolve();
    expect(window.RadhaPWA.state()).toBe("unavailable"); // a prompt can only be used once
    expect(slot.hidden).toBe(true);
  });

  test("install card appears after a delay and dismissing remembers it", () => {
    loadPwa();
    window.dispatchEvent(fakeInstallPrompt());
    expect(document.getElementById("pwaInstallCard")).toBeNull();
    jest.advanceTimersByTime(2600);
    const card = document.getElementById("pwaInstallCard");
    expect(card).not.toBeNull();
    expect(card.textContent).toMatch(/Install Radha E-Commerce/);
    expect(document.getElementById("pwaStyles")).not.toBeNull(); // self-contained styles

    document.getElementById("pwaNo").click();
    expect(Number(localStorage.getItem("pwaPromptDismissedAt"))).toBeGreaterThan(0);
  });

  test("install card is not shown again within 7 days of dismissal", () => {
    localStorage.setItem("pwaPromptDismissedAt", String(Date.now() - DAY));
    loadPwa();
    window.dispatchEvent(fakeInstallPrompt());
    jest.advanceTimersByTime(5000);
    expect(document.getElementById("pwaInstallCard")).toBeNull();
    // ...but the persistent slot is still offered
    expect(document.getElementById("slot").hidden).toBe(false);
  });

  test("appinstalled hides everything", () => {
    loadPwa();
    window.dispatchEvent(fakeInstallPrompt());
    jest.advanceTimersByTime(2600);
    window.dispatchEvent(new Event("appinstalled"));
    expect(document.getElementById("pwaInstallCard")).toBeNull();
    expect(document.getElementById("slot").hidden).toBe(true);
  });

  test("reports installed when running standalone", () => {
    window.matchMedia = jest.fn((q) => ({ matches: q === "(display-mode: standalone)" }));
    loadPwa();
    expect(window.RadhaPWA.state()).toBe("installed");
    expect(document.getElementById("slot").hidden).toBe(true);
  });
});

describe("home-screen naming", () => {
  const fs = require("fs");
  const path = require("path");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));

  test("the app is Radha E-Commerce, the shortcut label is Radha", () => {
    expect(manifest.name).toBe("Radha E-Commerce");
    expect(manifest.short_name).toBe("Radha");
  });

  test("iOS home-screen label is Radha on every page that sets one", () => {
    const pages = fs.readdirSync(__dirname).filter(f => f.endsWith(".html") && f !== "sample.html");
    const titled = pages.filter(f => /apple-mobile-web-app-title/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
    expect(titled.length).toBeGreaterThanOrEqual(6);
    for (const f of titled) {
      expect(fs.readFileSync(path.join(__dirname, f), "utf8")).toMatch(/<meta name="apple-mobile-web-app-title" content="Radha">/);
    }
  });
});
