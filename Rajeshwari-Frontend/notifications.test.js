/**
 * notifications.js — opt-in flow, UI states, logout unsubscribe.
 * Browser push APIs and the backend are faked.
 */
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

let server, sub, reg, loggedIn;

function fakeSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/device-1") {
  return {
    endpoint,
    toJSON() { return { endpoint, expirationTime: null, keys: { p256dh: "BKEY", auth: "AUTH" } }; },
    unsubscribe: jest.fn(async () => { sub = null; return true; })
  };
}

function setup({ supported = true, permission = "default", grant = "granted", keyEnabled = true, existingSub = false, login = true } = {}) {
  jest.resetModules();
  delete window.RadhaPush;
  loggedIn = login;
  sub = existingSub ? fakeSubscription() : null;
  server = { calls: [] };

  global.API_URL = "https://api.test";
  global.token = () => (loggedIn ? "jwt-token" : null);
  global.authHeaders = () => ({ Authorization: "Bearer jwt-token", "Content-Type": "application/json" });
  global.toast = jest.fn();

  global.fetch = jest.fn(async (url, opts = {}) => {
    server.calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : undefined });
    if (url.endsWith("/notifications/vapid-public-key")) {
      return keyEnabled
        ? { ok: true, json: async () => ({ enabled: true, publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" }) }
        : { ok: false, status: 503, json: async () => ({ enabled: false }) };
    }
    return { ok: true, status: 201, json: async () => ({}) };
  });

  reg = {
    pushManager: {
      getSubscription: jest.fn(async () => sub),
      subscribe: jest.fn(async () => { sub = fakeSubscription(); return sub; })
    }
  };
  if (supported) {
    Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve(reg) }, configurable: true });
    window.PushManager = function () {};
    window.Notification = { permission, requestPermission: jest.fn(async () => { window.Notification.permission = grant; return grant; }) };
  } else {
    delete navigator.serviceWorker;
    delete window.PushManager;
    delete window.Notification;
  }

  document.body.innerHTML = `
    <div id="panel" data-push-panel hidden>
      <p data-push-text></p>
      <button data-push-toggle>Turn on</button>
    </div>
    <div id="toast"></div>`;
  require("./notifications.js");
  return { panel: document.getElementById("panel"), btn: document.querySelector("[data-push-toggle]"), text: document.querySelector("[data-push-text]") };
}

afterEach(() => { delete navigator.serviceWorker; });

describe("urlBase64ToUint8Array", () => {
  const { urlBase64ToUint8Array } = require("./notifications.js");
  test("decodes URL-safe base64 without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
    expect(urlBase64ToUint8Array("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U")).toHaveLength(65);
  });
});

describe("UI states", () => {
  test("unsupported browser hides the panel", async () => {
    const { panel } = setup({ supported: false });
    await flush();
    expect(window.RadhaPush.state()).toBe("unsupported");
    expect(panel.hidden).toBe(true);
  });

  test("server without push configured hides the panel", async () => {
    const { panel } = setup({ keyEnabled: false });
    await flush();
    expect(window.RadhaPush.state()).toBe("unavailable");
    expect(panel.hidden).toBe(true);
  });

  test("logged out: explains, no button", async () => {
    const { panel, btn, text } = setup({ login: false });
    await flush();
    expect(window.RadhaPush.state()).toBe("needs-login");
    expect(panel.hidden).toBe(false);
    expect(btn.hidden).toBe(true);
    expect(text.textContent).toMatch(/Log in/);
  });

  test("blocked permission: explains how to allow, no button", async () => {
    const { btn, text } = setup({ permission: "denied" });
    await flush();
    expect(window.RadhaPush.state()).toBe("blocked");
    expect(btn.hidden).toBe(true);
    expect(text.textContent).toMatch(/blocked/);
  });
});

describe("turning notifications on and off", () => {
  test("click → permission → subscribe with the server key → registered for this account", async () => {
    const { btn, text, panel } = setup();
    await flush();
    expect(window.RadhaPush.state()).toBe("off");
    expect(btn.textContent).toBe("Turn on");

    btn.click();
    await flush(15);

    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1);
    const opts = reg.pushManager.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(opts.applicationServerKey).toBeInstanceOf(Uint8Array);
    const post = server.calls.find(c => c.method === "POST");
    expect(post.url).toBe("https://api.test/notifications/subscribe");
    expect(post.body).toEqual({ endpoint: "https://fcm.googleapis.com/fcm/send/device-1", expirationTime: null, keys: { p256dh: "BKEY", auth: "AUTH" } });
    expect(window.RadhaPush.state()).toBe("on");
    expect(btn.textContent).toBe("Turn off");
    expect(panel.dataset.state).toBe("on");
    expect(text.textContent).toMatch(/On/);
    expect(global.toast).toHaveBeenCalledWith("Order notifications on 🔔");
  });

  test("permission refused → nothing subscribed or sent", async () => {
    const { btn } = setup({ grant: "denied" });
    await flush();
    btn.click();
    await flush(15);
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(server.calls.some(c => c.method === "POST")).toBe(false);
    expect(window.RadhaPush.state()).toBe("blocked");
  });

  test("turning off unregisters this device on the server and in the browser", async () => {
    const { btn } = setup({ permission: "granted", existingSub: true });
    await flush();
    expect(window.RadhaPush.state()).toBe("on");
    const s = sub;
    btn.click();
    await flush(15);
    const del = server.calls.find(c => c.method === "DELETE");
    expect(del.body).toEqual({ endpoint: "https://fcm.googleapis.com/fcm/send/device-1" });
    expect(s.unsubscribe).toHaveBeenCalled();
    expect(window.RadhaPush.state()).toBe("off");
  });

  test("on page load an existing subscription is re-sent (keeps it bound to the current account)", async () => {
    setup({ permission: "granted", existingSub: true });
    await flush();
    expect(server.calls.filter(c => c.method === "POST")).toHaveLength(1);
  });

  test("no resync when logged out", async () => {
    setup({ permission: "granted", existingSub: true, login: false });
    await flush();
    expect(server.calls.some(c => c.method === "POST")).toBe(false);
  });
});

describe("logout", () => {
  test("beforeLogout unsubscribes this device while the token is still present", async () => {
    setup({ permission: "granted", existingSub: true });
    await flush();
    const { beforeLogout } = require("./api.js");
    const s = sub;
    await beforeLogout();
    expect(server.calls.some(c => c.method === "DELETE")).toBe(true);
    expect(s.unsubscribe).toHaveBeenCalled();
  });

  test("beforeLogout never throws or hangs", async () => {
    setup({ permission: "granted", existingSub: true });
    await flush();
    window.RadhaPush.disable = () => Promise.reject(new Error("boom"));
    const { beforeLogout } = require("./api.js");
    await expect(beforeLogout()).resolves.toBeUndefined();
  });
});
