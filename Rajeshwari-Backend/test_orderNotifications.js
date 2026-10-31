// Order routes fire the right notifications (fake Prisma + spy push; no DB, no network).
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "order_notifications_test_secret";

function stub(modPath, exportsObj) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

// ---- spy push (keeps the real message builders) ----
const realBuilders = (() => {
  const statuses = ["Shipped", "Out for Delivery", "Attempted", "Delivered", "Cancelled"];
  return {
    newOrderForShop: o => ({ kind: "shop-new", id: o.id }),
    orderPlacedForCustomer: o => ({ kind: "customer-placed", id: o.id }),
    statusChangeForCustomer: o => (statuses.includes(o.status) ? { kind: `customer-${o.status}`, id: o.id } : null),
    NOTIFY_STATUSES: statuses
  };
})();
const pushed = [];
stub(path.join(__dirname, "src/utils/push"), {
  ...realBuilders,
  notifyUser: (userId, payload) => { pushed.push(["user", userId, payload]); return Promise.resolve(); },
  notifyAdmins: (payload) => { pushed.push(["admins", payload]); return Promise.resolve(); }
});
stub(path.join(__dirname, "src/utils/stock"), { bulkUpdateProductStock: async () => {} });

// ---- fake prisma ----
const orders = new Map();
const product = { id: 3, title: "Bangle", price: 500, stock: 10 };
let cart = [];
const tx = {
  cart: { findMany: async () => cart, deleteMany: async () => { cart = []; } },
  order: {
    create: async ({ data }) => {
      const o = { id: 100 + orders.size, status: "Pending", ...data, orderItems: data.orderItems.create };
      orders.set(o.id, o); return o;
    },
    findUnique: async ({ where }) => {
      const o = orders.get(where.id); return o ? { ...o, orderItems: [] } : null;
    },
    update: async ({ where, data }) => {
      const o = orders.get(where.id); if (!o) { const e = new Error("nf"); e.code = "P2025"; throw e; }
      Object.assign(o, data); return { ...o };
    }
  },
  product: { findMany: async () => [product] }
};
stub(path.join(__dirname, "src/config/db"), {
  ...tx,
  order: {
    ...tx.order,
    updateMany: async ({ where, data }) => {
      const o = orders.get(where.id);
      const ok = o && where.status.in.includes(o.status) &&
        (where.deliveryPartnerId === undefined || o.deliveryPartnerId === where.deliveryPartnerId) &&
        (!where.OR || where.OR.some(c => (o.deliveryPartnerId ?? null) === c.deliveryPartnerId));
      if (ok) Object.assign(o, data);
      return { count: ok ? 1 : 0 };
    }
  },
  user: { update: () => Promise.resolve(), findUnique: async ({ where }) => ({ role: where.id === 50 ? "DELIVERY_PARTNER" : "ADMIN" }) },
  pincodeRestriction: { findUnique: async () => null },
  $transaction: async (fn) => fn(tx)
});

const orderRoutes = require("./src/routes/orderRoutes");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/orders", orderRoutes);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/orders`;
});
test.after(() => server.close());

const tok = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET);
async function call(method, url, { id, role, body }) {
  const res = await fetch(base + url, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(id, role)}` },
    body: body ? JSON.stringify(body) : undefined
  });
  await new Promise(r => setImmediate(r)); // let fire-and-forget calls run
  return { status: res.status, body: await res.json().catch(() => null) };
}
const DETAILS = { fullName: "Asha K", phone: "9999999999", address: "1 Road", city: "Pune", state: "MH", pincode: "411001" };

test("checkout notifies the shop owner(s) and the customer", async () => {
  pushed.length = 0;
  cart = [{ quantity: 2, product }];
  const r = await call("POST", "/checkout", { id: 7, role: "CUSTOMER", body: DETAILS });
  assert.strictEqual(r.status, 200);
  const id = r.body.order.id;
  assert.deepStrictEqual(pushed, [
    ["admins", { kind: "shop-new", id }],
    ["user", 7, { kind: "customer-placed", id }]
  ]);
});

test("a failed checkout notifies nobody", async () => {
  pushed.length = 0;
  cart = [];
  const r = await call("POST", "/checkout", { id: 7, role: "CUSTOMER", body: DETAILS });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(pushed.length, 0);
});

test("admin status change notifies the customer only when it actually changes", async () => {
  cart = [{ quantity: 1, product }];
  const { body } = await call("POST", "/checkout", { id: 8, role: "CUSTOMER", body: DETAILS });
  const id = body.order.id;

  pushed.length = 0;
  assert.strictEqual((await call("PUT", `/${id}/status`, { id: 1, role: "ADMIN", body: { status: "Shipped" } })).status, 200);
  assert.deepStrictEqual(pushed, [["user", 8, { kind: "customer-Shipped", id }]]);

  pushed.length = 0;
  await call("PUT", `/${id}/status`, { id: 1, role: "OWNER", body: { status: "Shipped" } }); // re-save
  assert.strictEqual(pushed.length, 0, "re-saving the same status must not notify again");

  await call("PUT", `/${id}/status`, { id: 1, role: "ADMIN", body: { status: "Pending" } });
  assert.strictEqual(pushed.length, 0, "moving back to Pending is not announced");

  await call("PUT", `/${id}/status`, { id: 1, role: "ADMIN", body: { status: "Delivered" } });
  await call("PUT", `/${id}/status`, { id: 1, role: "ADMIN", body: { status: "Cancelled" } });
  assert.deepStrictEqual(pushed.map(p => p[2].kind), ["customer-Delivered", "customer-Cancelled"]);
});

test("customers can't change status (and nothing is sent)", async () => {
  pushed.length = 0;
  const r = await call("PUT", "/100/status", { id: 7, role: "CUSTOMER", body: { status: "Shipped" } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(pushed.length, 0);
});

test("delivery partner: out for delivery + delivered each notify once; unknown order is 404", async () => {
  cart = [{ quantity: 1, product }];
  const { body } = await call("POST", "/checkout", { id: 9, role: "CUSTOMER", body: DETAILS });
  const id = body.order.id;
  await call("PUT", `/${id}/status`, { id: 1, role: "ADMIN", body: { status: "Shipped" } });
  pushed.length = 0;
  await call("PATCH", `/${id}/delivery-status`, { id: 50, role: "DELIVERY_PARTNER", body: { status: "Out for Delivery" } });
  await call("PATCH", `/${id}/delivery-status`, { id: 50, role: "DELIVERY_PARTNER", body: { status: "Delivered" } });
  const again = await call("PATCH", `/${id}/delivery-status`, { id: 50, role: "DELIVERY_PARTNER", body: { status: "Delivered" } });
  assert.strictEqual(again.status, 409);
  assert.deepStrictEqual(pushed, [["user", 9, { kind: "customer-Out for Delivery", id }], ["user", 9, { kind: "customer-Delivered", id }]]);
  assert.strictEqual((await call("PATCH", "/99999/delivery-status", { id: 50, role: "DELIVERY_PARTNER", body: { status: "Delivered" } })).status, 404);
});
