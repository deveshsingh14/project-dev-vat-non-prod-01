// The password-reset email must link to the storefront's reset page.
// Fake Prisma + fake email; no database, no mail sent.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const express = require("express");

function stub(modPath, exportsObj) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}
const sent = [];
stub(path.join(__dirname, "src/utils/email"), { sendEmail: async (m) => { sent.push(m); return true; } });
stub(path.join(__dirname, "src/config/db"), { user: {
  findUnique: async ({ where }) => (where.email === "asha@x.test" ? { id: 1, email: "asha@x.test" } : null),
  update: async () => ({})
} });

const authRoutes = require("./src/routes/authRoutes");
const { appLink } = require("./src/utils/siteUrl");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/auth", authRoutes);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/auth`;
});
test.after(() => server.close());

async function requestReset(email) {
  sent.length = 0;
  const r = await fetch(`${base}/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise(res => setTimeout(res, 10));
  return r.status;
}
const linkIn = html => (html.match(/href="([^"]+)"/) || [])[1];

test("reset email links to the storefront from FRONTEND_URL (not the API host)", async () => {
  process.env.FRONTEND_URL = "https://deveshsingh14.github.io/radha-e-commerce/";
  assert.strictEqual(await requestReset("asha@x.test"), 200);
  assert.strictEqual(sent.length, 1);
  const link = linkIn(sent[0].html);
  assert.match(link, /^https:\/\/deveshsingh14\.github\.io\/radha-e-commerce\/reset-password\.html\?token=[0-9a-f]{64}$/);
  assert.doesNotMatch(link, /127\.0\.0\.1|onrender/);
});

test("falls back to the live site when FRONTEND_URL is unset", async () => {
  delete process.env.FRONTEND_URL;
  await requestReset("asha@x.test");
  assert.match(linkIn(sent[0].html), /^https:\/\/deveshsingh14\.github\.io\/radha-e-commerce\/reset-password\.html\?token=/);
});

test("unknown email: same 200 response, no email", async () => {
  assert.strictEqual(await requestReset("nobody@x.test"), 200);
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(sent.length, 0);
});

test("appLink handles trailing slash, relative default and bad config", () => {
  process.env.FRONTEND_URL = "https://example.test/shop";
  assert.strictEqual(appLink("account.html"), "https://example.test/shop/account.html");
  delete process.env.FRONTEND_URL;
  assert.strictEqual(appLink("account.html"), "account.html");
  assert.strictEqual(appLink("account.html", { absolute: true }), "https://deveshsingh14.github.io/radha-e-commerce/account.html");
  process.env.FRONTEND_URL = "::not a url::";
  assert.strictEqual(appLink("account.html"), "account.html");
  delete process.env.FRONTEND_URL;
});
