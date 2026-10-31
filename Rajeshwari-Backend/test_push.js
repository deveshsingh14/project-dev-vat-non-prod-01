// Unit tests for src/utils/push.js with fake web-push + fake Prisma (no DB, no network).
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

function stub(modPath, exportsObj) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

const sent = [];
let failFor = {};               // endpoint -> statusCode to throw
const fakeWebPush = {
  vapid: null,
  setVapidDetails(subject, pub, priv) { this.vapid = { subject, pub, priv }; },
  async sendNotification(sub, body) {
    if (failFor[sub.endpoint]) { const e = new Error("push error"); e.statusCode = failFor[sub.endpoint]; throw e; }
    sent.push({ endpoint: sub.endpoint, keys: sub.keys, payload: JSON.parse(body) });
    return { statusCode: 201 };
  }
};

let subs = [];
const deleted = [];
let findManyArgs = [];
let findManyThrows = false;
const fakePrisma = {
  pushSubscription: {
    findMany: async (args) => { findManyArgs.push(args); if (findManyThrows) throw new Error("db down"); return subs; },
    deleteMany: async ({ where }) => { deleted.push(...where.id.in); return { count: where.id.in.length }; }
  }
};

stub("web-push", fakeWebPush);
stub(path.join(__dirname, "src/config/db"), fakePrisma);
const push = require("./src/utils/push");

const VAPID = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "https://example.test/" };
function configure(on) {
  for (const k of Object.keys(VAPID)) { if (on) process.env[k] = VAPID[k]; else delete process.env[k]; }
  push._reset();
}
function reset() { sent.length = 0; deleted.length = 0; findManyArgs = []; failFor = {}; findManyThrows = false; }

test("disabled without VAPID env: no-op, never touches the DB", async () => {
  configure(false); reset();
  subs = [{ id: 1, endpoint: "https://push.test/a", p256dh: "k", auth: "a" }];
  assert.strictEqual(push.isPushConfigured(), false);
  assert.strictEqual(push.getPublicKey(), null);
  assert.deepStrictEqual(await push.notifyUser(5, { title: "x" }), { sent: 0, removed: 0, failed: 0 });
  assert.deepStrictEqual(await push.notifyAdmins({ title: "x" }), { sent: 0, removed: 0, failed: 0 });
  assert.strictEqual(findManyArgs.length, 0);
  assert.strictEqual(sent.length, 0);
});

test("notifyUser sends the payload to every device of that user", async () => {
  configure(true); reset();
  subs = [
    { id: 1, endpoint: "https://push.test/a", p256dh: "p1", auth: "a1" },
    { id: 2, endpoint: "https://push.test/b", p256dh: "p2", auth: "a2" }
  ];
  const r = await push.notifyUser(5, { title: "Hello", body: "World", url: "account.html" });
  assert.deepStrictEqual(r, { sent: 2, removed: 0, failed: 0 });
  assert.deepStrictEqual(findManyArgs[0], { where: { userId: 5 } });
  assert.deepStrictEqual(sent.map(s => s.endpoint).sort(), ["https://push.test/a", "https://push.test/b"]);
  assert.deepStrictEqual(sent[0].payload, { title: "Hello", body: "World", url: "account.html" });
  assert.deepStrictEqual(sent.find(s => s.endpoint.endsWith("/a")).keys, { p256dh: "p1", auth: "a1" });
  assert.deepStrictEqual(fakeWebPush.vapid, { subject: VAPID.VAPID_SUBJECT, pub: "pub", priv: "priv" });
});

test("expired subscriptions (404/410) are pruned; other errors are counted, not thrown", async () => {
  configure(true); reset();
  subs = [
    { id: 1, endpoint: "https://push.test/ok", p256dh: "k", auth: "a" },
    { id: 2, endpoint: "https://push.test/gone", p256dh: "k", auth: "a" },
    { id: 3, endpoint: "https://push.test/missing", p256dh: "k", auth: "a" },
    { id: 4, endpoint: "https://push.test/flaky", p256dh: "k", auth: "a" }
  ];
  failFor = { "https://push.test/gone": 410, "https://push.test/missing": 404, "https://push.test/flaky": 500 };
  const r = await push.notifyUser(5, { title: "x" });
  assert.deepStrictEqual(r, { sent: 1, removed: 2, failed: 1 });
  assert.deepStrictEqual(deleted.sort(), [2, 3]);
});

test("a database failure is swallowed (callers fire-and-forget)", async () => {
  configure(true); reset();
  findManyThrows = true;
  const r = await push.notifyUser(5, { title: "x" });
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(r.failed, 1);
});

test("notifyAdmins targets ADMIN and OWNER accounts", async () => {
  configure(true); reset();
  subs = [{ id: 9, endpoint: "https://push.test/shop", p256dh: "k", auth: "a" }];
  await push.notifyAdmins({ title: "New order" });
  assert.deepStrictEqual(findManyArgs[0], { where: { user: { role: { in: ["ADMIN", "OWNER"] } } } });
  assert.strictEqual(sent.length, 1);
});

test("notifyUser with no user id does nothing", async () => {
  configure(true); reset();
  await push.notifyUser(undefined, { title: "x" });
  assert.strictEqual(findManyArgs.length, 0);
});

test("message builders", () => {
  const order = { id: 42, fullName: "Asha Kumari Sharma", totalAmount: 1250, paymentMethod: "COD",
    orderItems: [{ quantity: 2 }, { quantity: 1 }] };
  const shop = push.newOrderForShop(order);
  assert.strictEqual(shop.title, "🛍 New order #42");
  assert.match(shop.body, /^Asha ordered 3 items · ₹1,250 \(COD\)$/);
  assert.strictEqual(shop.url, "admin.html");
  assert.doesNotMatch(shop.body, /Kumari|Sharma/); // first name only

  const placed = push.orderPlacedForCustomer(order);
  assert.strictEqual(placed.title, "Order #42 placed ✓");
  assert.strictEqual(placed.url, "account.html");

  assert.match(push.statusChangeForCustomer({ id: 42, status: "Shipped" }).title, /#42 has shipped/);
  assert.match(push.statusChangeForCustomer({ id: 42, status: "Delivered" }).title, /#42 delivered/);
  assert.match(push.statusChangeForCustomer({ id: 42, status: "Cancelled" }).title, /#42 was cancelled/);
  assert.strictEqual(push.statusChangeForCustomer({ id: 42, status: "Pending" }), null);
  assert.match(push.statusChangeForCustomer({ id: 42, status: "Out for Delivery" }).title, /#42 is out for delivery/);
  assert.match(push.statusChangeForCustomer({ id: 42, status: "Attempted" }).title, /#42: delivery attempted/);
  assert.deepStrictEqual(push.NOTIFY_STATUSES, ["Shipped", "Out for Delivery", "Attempted", "Delivered", "Cancelled"]);

  assert.match(push.newOrderForShop({ id: 1, totalAmount: 5, orderItems: [{ quantity: 1 }] }).body, /^A customer ordered 1 item ·/);
});

test("notification links: relative by default, absolute with FRONTEND_URL", () => {
  delete process.env.FRONTEND_URL;
  assert.strictEqual(push.appLink("account.html"), "account.html");
  assert.strictEqual(push.orderPlacedForCustomer({ id: 1, totalAmount: 5 }).url, "account.html");

  process.env.FRONTEND_URL = "https://deveshsingh14.github.io/radha-e-commerce";   // no trailing slash
  assert.strictEqual(push.appLink("account.html"), "https://deveshsingh14.github.io/radha-e-commerce/account.html");
  assert.strictEqual(push.newOrderForShop({ id: 1, totalAmount: 5, orderItems: [] }).url, "https://deveshsingh14.github.io/radha-e-commerce/admin.html");
  assert.strictEqual(push.statusChangeForCustomer({ id: 1, status: "Shipped" }).url, "https://deveshsingh14.github.io/radha-e-commerce/account.html");

  process.env.FRONTEND_URL = "not a url";
  assert.strictEqual(push.appLink("account.html"), "account.html");
  delete process.env.FRONTEND_URL;
});
