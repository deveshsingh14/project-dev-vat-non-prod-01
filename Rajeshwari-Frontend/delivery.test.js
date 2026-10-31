/**
 * Delivery partner portal (delivery.js)
 */
document.body.innerHTML = `
  <div id="partnerName"></div>
  <div id="deliveriesContainer"></div>
  <div id="toast"></div>
`;

const api = require("./api");
global.API_URL = "http://localhost:5000";
global.esc = api.esc;
global.inr = api.inr;
global.authHeaders = jest.fn(json => (json ? { Authorization: "Bearer t", "Content-Type": "application/json" } : { Authorization: "Bearer t" }));
global.toast = jest.fn();
global.beforeLogout = jest.fn(async () => {});

Object.defineProperty(window, "localStorage", {
  value: { getItem: jest.fn(() => "mock-token"), setItem: jest.fn(), removeItem: jest.fn() },
  writable: true
});
jest.spyOn(console, "error").mockImplementation(() => {});
global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
window.confirm = jest.fn(() => true);

const mod = require("./delivery");
const flush = () => new Promise(r => setTimeout(r, 0));
const container = () => document.getElementById("deliveriesContainer");
const ok = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const PARTNER = { id: 10, name: "Ravi Kumar", role: "DELIVERY_PARTNER" };
const order = (over = {}) => ({
  id: 7, status: "Shipped", deliveryPartnerId: null, fullName: "Asha", phone: "+91 98765 43210",
  address: "12 MG Road", city: "Pune", state: "MH", pincode: "411001",
  paymentMethod: "COD", paymentStatus: "Pending", totalAmount: 1250,
  orderItems: [{ quantity: 2, title: "Bridal Bangles" }], ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(mod.nav, "to").mockImplementation(() => {});
  window.confirm.mockReturnValue(true);
  container().innerHTML = "";
  mod._setMe(PARTNER);
});

describe("boot", () => {
  test("no token -> back to the store", async () => {
    window.localStorage.getItem.mockReturnValueOnce(null);
    await mod.boot();
    expect(mod.nav.to).toHaveBeenCalledWith("index.html");
  });

  test("uses /users/me (the old /auth/me route never existed)", async () => {
    global.fetch.mockReturnValueOnce(ok(PARTNER)).mockReturnValueOnce(ok([]));
    await mod.boot(); await flush();
    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:5000/users/me");
    expect(global.fetch.mock.calls[1][0]).toBe("http://localhost:5000/orders/delivery");
    expect(document.getElementById("partnerName").textContent).toBe("Hi, Ravi");
  });

  test("customers are sent away and their token cleared", async () => {
    global.fetch.mockReturnValueOnce(ok({ id: 1, role: "CUSTOMER" }));
    await mod.boot();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("token");
    expect(mod.nav.to).toHaveBeenCalledWith("index.html");
  });

  test("a failed profile request also sends them away", async () => {
    global.fetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 401 }));
    await mod.boot();
    expect(mod.nav.to).toHaveBeenCalledWith("index.html");
  });
});

describe("rendering", () => {
  test("splits 'My deliveries' and 'Ready to pick up' with the right buttons", () => {
    mod._setDeliveries([
      order({ id: 1, status: "Shipped" }),
      order({ id: 2, status: "Out for Delivery", deliveryPartnerId: 10 }),
      order({ id: 3, status: "Attempted", deliveryPartnerId: 10 })
    ]);
    mod.renderDeliveries();
    const html = container().innerHTML;
    expect(html.indexOf("My deliveries")).toBeLessThan(html.indexOf("Ready to pick up"));
    const buttons = id => [...container().querySelectorAll(`[data-order="${id}"] button`)].map(b => b.dataset.status);
    expect(buttons(1)).toEqual(["Out for Delivery"]);
    expect(buttons(2)).toEqual(["Delivered", "Attempted"]);
    expect(buttons(3)).toEqual(["Out for Delivery"]);
  });

  test("someone else's order shows who has it and no buttons", () => {
    mod._setDeliveries([order({ id: 4, status: "Out for Delivery", deliveryPartnerId: 11, deliveryPartner: { id: 11, name: "Sita" } })]);
    mod.renderDeliveries();
    expect(container().querySelectorAll("button").length).toBe(0);
    expect(container().textContent).toContain("With Sita");
  });

  test("customer-entered text is escaped (no script injection)", () => {
    mod._setDeliveries([order({ fullName: '<img src=x onerror="alert(1)">', address: "<script>bad()</script>",
      orderItems: [{ quantity: 1, title: "<b>x</b>" }] })]);
    mod.renderDeliveries();
    expect(container().querySelector("img")).toBeNull();
    expect(container().querySelector("script")).toBeNull();
    expect(container().querySelector("b")).toBeNull();
    expect(container().textContent).toContain('<img src=x onerror="alert(1)">');
  });

  test("cash to collect only for unpaid COD orders; tel and map links", () => {
    expect(mod.cashToCollect(order())).toBe(1250);
    expect(mod.cashToCollect(order({ paymentStatus: "Paid" }))).toBe(0);
    expect(mod.cashToCollect(order({ paymentMethod: "UPI" }))).toBe(0);
    mod._setDeliveries([order()]);
    mod.renderDeliveries();
    expect(container().querySelector(".dl-cash").textContent).toMatch(/Collect cash:\s*₹1,250/);
    expect(container().querySelector('a[href^="tel:"]').getAttribute("href")).toBe("tel:+919876543210");
    expect(container().querySelector('a[href*="google.com/maps"]').getAttribute("href")).toContain(encodeURIComponent("12 MG Road, Pune, MH - 411001"));
  });

  test("empty and error states", async () => {
    mod._setDeliveries([]);
    mod.renderDeliveries();
    expect(container().textContent).toMatch(/No deliveries right now/);
    global.fetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 500 }));
    await mod.loadDeliveries();
    expect(container().textContent).toMatch(/Couldn't load deliveries/);
  });
});

describe("actions", () => {
  test("clicking a button PATCHes the status with JSON and refreshes", async () => {
    mod._setDeliveries([order()]);
    mod.renderDeliveries();
    global.fetch.mockReturnValueOnce(ok({})).mockReturnValueOnce(ok([]));
    container().querySelector('button[data-status="Out for Delivery"]').click();
    await flush(); await flush();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:5000/orders/7/delivery-status");
    expect(opts.method).toBe("PATCH");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ status: "Out for Delivery" });
    expect(global.toast).toHaveBeenCalledWith("Order #7: Out for Delivery");
    expect(global.fetch.mock.calls[1][0]).toBe("http://localhost:5000/orders/delivery");
  });

  test("delivering a COD order asks to confirm the cash", async () => {
    mod._setDeliveries([order({ status: "Out for Delivery", deliveryPartnerId: 10 })]);
    window.confirm.mockReturnValueOnce(false);
    await mod.updateStatus(7, "Delivered");
    expect(window.confirm.mock.calls[0][0]).toMatch(/₹1,250 cash collected/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("server refusal (e.g. taken by another partner) is shown and the list refreshed", async () => {
    mod._setDeliveries([order()]);
    global.fetch
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ message: "This order is assigned to another delivery partner." }) }))
      .mockReturnValueOnce(ok([]));
    await mod.updateStatus(7, "Out for Delivery");
    expect(global.toast).toHaveBeenCalledWith("This order is assigned to another delivery partner.", "err");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("network error is reported", async () => {
    mod._setDeliveries([order()]);
    global.fetch.mockReturnValueOnce(Promise.reject(new Error("offline"))).mockReturnValueOnce(ok([]));
    await mod.updateStatus(7, "Out for Delivery");
    expect(global.toast).toHaveBeenCalledWith("Something went wrong", "err");
  });
});

describe("logout", () => {
  test("unsubscribes notifications first, then clears the token", async () => {
    await mod.logout();
    expect(global.beforeLogout).toHaveBeenCalled();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("token");
    expect(mod.nav.to).toHaveBeenCalledWith("index.html");
  });
});
