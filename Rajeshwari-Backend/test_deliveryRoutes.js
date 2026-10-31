// Delivery portal routes end-to-end over HTTP, with an in-memory fake Prisma
// that really evaluates the `where` conditions (so races / wrong-partner
// updates are exercised). No database, no network.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "delivery_routes_test_secret";

function stub(modPath, exportsObj) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

// ---------- in-memory data ----------
const users = new Map([
  [1, { id: 1, role: "ADMIN" }],
  [10, { id: 10, role: "DELIVERY_PARTNER", name: "Ravi" }],
  [11, { id: 11, role: "DELIVERY_PARTNER", name: "Sita" }],
  [12, { id: 12, role: "CUSTOMER" }], // demoted partner
  [50, { id: 50, role: "CUSTOMER" }]
]);
let orders = new Map();
function seed() {
  orders = new Map([
    [1, { id: 1, userId: 50, status: "Pending", deliveryPartnerId: null, paymentMethod: "COD", paymentStatus: "Pending", createdAt: new Date(1) }],
    [2, { id: 2, userId: 50, status: "Shipped", deliveryPartnerId: null, paymentMethod: "COD", paymentStatus: "Pending", createdAt: new Date(2) }],
    [3, { id: 3, userId: 50, status: "Out for Delivery", deliveryPartnerId: 11, paymentMethod: "COD", paymentStatus: "Pending", createdAt: new Date(3) }],
    [4, { id: 4, userId: 50, status: "Delivered", deliveryPartnerId: 10, paymentMethod: "COD", paymentStatus: "Paid", createdAt: new Date(4) }],
    [5, { id: 5, userId: 50, status: "Attempted", deliveryPartnerId: null, paymentMethod: "COD", paymentStatus: "Pending", createdAt: new Date(5) }],
    [6, { id: 6, userId: 50, status: "Shipped", deliveryPartnerId: null, paymentMethod: "UPI", paymentStatus: "Paid", createdAt: new Date(6) }]
  ]);
}

function matches(o, where) {
  for (const [k, v] of Object.entries(where || {})) {
    if (k === "OR") { if (!v.some(w => matches(o, w))) return false; continue; }
    if (v && typeof v === "object" && Array.isArray(v.in)) { if (!v.in.includes(o[k])) return false; continue; }
    if (o[k] !== v) return false;
  }
  return true;
}
const lastFindManyWhere = [];
const fakePrisma = {
  user: { findUnique: async ({ where }) => users.get(where.id) || null },
  order: {
    findMany: async ({ where }) => { lastFindManyWhere.push(where); return [...orders.values()].filter(o => matches(o, where)).map(o => ({ ...o, orderItems: [] })); },
    findUnique: async ({ where }) => { const o = orders.get(where.id); return o ? { ...o, orderItems: [] } : null; },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const o of orders.values()) if (matches(o, where)) { Object.assign(o, data); count++; }
      return { count };
    },
    update: async ({ where, data }) => { const o = orders.get(where.id); Object.assign(o, data); return { ...o }; }
  },
  product: { findMany: async () => [] },
  $transaction: async fn => fn(fakePrisma)
};
stub(path.join(__dirname, "src/config/db"), fakePrisma);
stub(path.join(__dirname, "src/utils/stock"), { bulkUpdateProductStock: async () => {} });
const pushed = [];
stub(path.join(__dirname, "src/utils/push"), {
  NOTIFY_STATUSES: ["Shipped", "Out for Delivery", "Attempted", "Delivered", "Cancelled"],
  statusChangeForCustomer: o => ({ kind: o.status, id: o.id }),
  notifyUser: (uid, p) => { pushed.push([uid, p.kind, p.id]); return Promise.resolve(); },
  notifyAdmins: () => Promise.resolve(),
  newOrderForShop: () => ({}), orderPlacedForCustomer: () => ({})
});

const orderRoutes = require("./src/routes/orderRoutes");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/orders", orderRoutes);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/orders`;
});
test.after(() => server.close());

async function call(method, url, userId, body) {
  const u = users.get(userId);
  const role = userId === 12 ? "DELIVERY_PARTNER" : u.role; // 12 holds an old partner token
  const res = await fetch(base + url, { method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: userId, role }, process.env.JWT_SECRET)}` },
    body: body ? JSON.stringify(body) : undefined });
  await new Promise(r => setImmediate(r));
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ids = r => r.body.map(o => o.id).sort((a, b) => a - b);

test("partner queue: unassigned Shipped + own + orphaned in-progress; never others' or finished", async () => {
  seed();
  assert.deepStrictEqual(ids(await call("GET", "/delivery", 10)), [2, 5, 6]);   // not 3 (Sita's), not 1/4
  assert.deepStrictEqual(ids(await call("GET", "/delivery", 11)), [2, 3, 5, 6]);
});

test("admin sees the whole delivery queue", async () => {
  seed();
  assert.deepStrictEqual(ids(await call("GET", "/delivery", 1)), [2, 3, 5, 6]);
});

test("customers and demoted partners (stale token) are refused", async () => {
  seed();
  assert.strictEqual((await call("GET", "/delivery", 50)).status, 403);
  assert.strictEqual((await call("GET", "/delivery", 12)).status, 403);
});

test("pick up → out for delivery → delivered; COD becomes Paid; customer notified each step", async () => {
  seed(); pushed.length = 0;
  let r = await call("PATCH", "/2/delivery-status", 10, { status: "Out for Delivery" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(orders.get(2).deliveryPartnerId, 10);
  r = await call("PATCH", "/2/delivery-status", 10, { status: "Delivered" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(orders.get(2).status, "Delivered");
  assert.strictEqual(orders.get(2).paymentStatus, "Paid");
  assert.deepStrictEqual(pushed, [[50, "Out for Delivery", 2], [50, "Delivered", 2]]);
});

test("prepaid order stays as it was on delivery (no payment change)", async () => {
  seed();
  await call("PATCH", "/6/delivery-status", 10, { status: "Out for Delivery" });
  await call("PATCH", "/6/delivery-status", 10, { status: "Delivered" });
  assert.strictEqual(orders.get(6).paymentStatus, "Paid");
  assert.strictEqual(orders.get(6).paymentMethod, "UPI");
});

test("two partners can't claim the same order", async () => {
  seed(); pushed.length = 0;
  const [a, b] = await Promise.all([
    call("PATCH", "/2/delivery-status", 10, { status: "Out for Delivery" }),
    call("PATCH", "/2/delivery-status", 11, { status: "Out for Delivery" })
  ]);
  assert.deepStrictEqual([a.status, b.status].sort(), [200, 409]);
  assert.strictEqual(pushed.length, 1);
});

test("only the assigned partner can deliver / mark attempted", async () => {
  seed(); pushed.length = 0;
  let r = await call("PATCH", "/3/delivery-status", 10, { status: "Delivered" }); // Sita's order
  assert.strictEqual(r.status, 409);
  assert.match(r.body.message, /assigned to another delivery partner/);
  assert.strictEqual(orders.get(3).status, "Out for Delivery");
  r = await call("PATCH", "/3/delivery-status", 11, { status: "Attempted" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(pushed, [[50, "Attempted", 3]]);
});

test("attempted orders can be retried", async () => {
  seed();
  assert.strictEqual((await call("PATCH", "/5/delivery-status", 10, { status: "Out for Delivery" })).status, 200);
  assert.strictEqual(orders.get(5).deliveryPartnerId, 10);
});

test("steps can't be skipped or repeated", async () => {
  seed(); pushed.length = 0;
  let r = await call("PATCH", "/1/delivery-status", 10, { status: "Out for Delivery" }); // Pending
  assert.strictEqual(r.status, 409);
  assert.match(r.body.message, /Can't mark a "Pending" order/);
  r = await call("PATCH", "/2/delivery-status", 10, { status: "Delivered" }); // not picked up yet
  assert.strictEqual(r.status, 409);
  r = await call("PATCH", "/4/delivery-status", 10, { status: "Delivered" }); // already delivered
  assert.strictEqual(r.status, 409);
  assert.strictEqual(pushed.length, 0);
});

test("validation: unknown status, extra fields (e.g. paymentStatus), bad id, missing order", async () => {
  seed();
  assert.strictEqual((await call("PATCH", "/2/delivery-status", 10, { status: "Cancelled" })).status, 400);
  assert.strictEqual((await call("PATCH", "/2/delivery-status", 10, { status: "Out for Delivery", paymentStatus: "Refunded" })).status, 400);
  assert.strictEqual((await call("PATCH", "/abc/delivery-status", 10, { status: "Delivered" })).status, 400);
  assert.strictEqual((await call("PATCH", "/999/delivery-status", 10, { status: "Delivered" })).status, 404);
  assert.strictEqual(orders.get(2).paymentStatus, "Pending");
});

test("admin can move an order to any status; moving back to Shipped/Pending releases the partner", async () => {
  seed();
  let r = await call("PUT", "/3/status", 1, { status: "Shipped" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(orders.get(3).deliveryPartnerId, null);
  r = await call("PUT", "/2/status", 1, { status: "Out for Delivery" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await call("PUT", "/2/status", 1, { status: "Lost" })).status, 400);
});
