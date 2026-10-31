// HTTP-level tests for /notifications with fake Prisma + fake push config (no DB).
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "notification_routes_test_secret";

function stub(modPath, exportsObj) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

const calls = [];
let publicKey = "BPUBLICKEY";
stub(path.join(__dirname, "src/utils/push"), { getPublicKey: () => publicKey });
stub(path.join(__dirname, "src/config/db"), {
  pushSubscription: {
    upsert: async (args) => { calls.push(["upsert", args]); return {}; },
    deleteMany: async (args) => { calls.push(["deleteMany", args]); return { count: 1 }; }
  }
});

const routes = require("./src/routes/notificationRoutes");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/notifications", routes);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/notifications`;
});
test.after(() => server.close());

const token = (id, role = "CUSTOMER") => jwt.sign({ id, role }, process.env.JWT_SECRET);
async function call(method, url, { user, body } = {}) {
  const headers = { "Content-Type": "application/json", "User-Agent": "TestAgent/1.0" };
  if (user) headers.Authorization = `Bearer ${token(user)}`;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", expirationTime: null, keys: { p256dh: "BKEY", auth: "AUTH" } };

test("GET /vapid-public-key returns the key when configured", async () => {
  publicKey = "BPUBLICKEY";
  const r = await call("GET", "/vapid-public-key");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body, { enabled: true, publicKey: "BPUBLICKEY" });
});

test("GET /vapid-public-key is 503 when push isn't configured", async () => {
  publicKey = null;
  const r = await call("GET", "/vapid-public-key");
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.body.enabled, false);
  publicKey = "BPUBLICKEY";
});

test("POST /subscribe requires login", async () => {
  assert.strictEqual((await call("POST", "/subscribe", { body: SUB })).status, 401);
});

test("POST /subscribe upserts by endpoint and binds the device to the caller", async () => {
  calls.length = 0;
  const r = await call("POST", "/subscribe", { user: 12, body: SUB });
  assert.strictEqual(r.status, 201);
  const [, args] = calls[0];
  assert.deepStrictEqual(args.where, { endpoint: SUB.endpoint });
  assert.strictEqual(args.create.userId, 12);
  assert.strictEqual(args.update.userId, 12); // re-binds a shared device to the new account
  assert.strictEqual(args.create.p256dh, "BKEY");
  assert.strictEqual(args.create.auth, "AUTH");
  assert.strictEqual(args.create.userAgent, "TestAgent/1.0");
});

test("POST /subscribe validates the subscription", async () => {
  const bad = [
    {},
    { ...SUB, endpoint: "not-a-url" },
    { ...SUB, endpoint: "http://insecure.example/push" },
    { endpoint: SUB.endpoint },
    { ...SUB, keys: { p256dh: "", auth: "x" } }
  ];
  for (const body of bad) {
    assert.strictEqual((await call("POST", "/subscribe", { user: 12, body })).status, 400, JSON.stringify(body));
  }
});

test("DELETE /subscribe only removes the caller's own device", async () => {
  calls.length = 0;
  const r = await call("DELETE", "/subscribe", { user: 12, body: { endpoint: SUB.endpoint } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(calls[0], ["deleteMany", { where: { endpoint: SUB.endpoint, userId: 12 } }]);
  assert.strictEqual((await call("DELETE", "/subscribe", { body: { endpoint: SUB.endpoint } })).status, 401);
  assert.strictEqual((await call("DELETE", "/subscribe", { user: 12, body: {} })).status, 400);
});
