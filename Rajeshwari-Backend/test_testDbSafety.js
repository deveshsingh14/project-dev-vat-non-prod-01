const test = require("node:test");
const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { isSafeTestDbUrl } = require("./scripts/testDbSafety");

test("isSafeTestDbUrl accepts only local / CI database hosts", () => {
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@localhost:5432/db"), true);
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@127.0.0.1:55432/db"), true);
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@[::1]:5432/db"), true);
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@postgres:5432/db"), true);

  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@ep-x.eu-west-2.aws.neon.tech/neondb?sslmode=require"), false);
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@localhost.evil.com/db"), false);
  assert.strictEqual(isSafeTestDbUrl("postgresql://u:p@10.0.0.5/db"), false);
  assert.strictEqual(isSafeTestDbUrl(""), false);
  assert.strictEqual(isSafeTestDbUrl(undefined), false);
  assert.strictEqual(isSafeTestDbUrl("not a url"), false);
});

// Runs the real destructive test file with a remote (unreachable) URL and
// checks it aborts at the guard, before any database call is attempted.
for (const file of ["test_forgotPasswordTiming.js", "test_rbac.js"]) {
  test(`${file} refuses to run against a non-local database`, () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://u:p@example-host.invalid.neon.tech/neondb",
        NODE_ENV: "test"
      },
      encoding: "utf8",
      timeout: 20000
    });
    const out = r.stdout + r.stderr;
    assert.notStrictEqual(r.status, 0, "should exit non-zero");
    assert.match(out, /Refusing to run: DATABASE_URL is not a local test database/);
    assert.doesNotMatch(out, /Setting up users|Server running/);
  });
}

test("guard refuses when NODE_ENV=production even with a local URL", () => {
  const r = spawnSync(process.execPath, ["-e", "require('./scripts/testDbSafety').assertSafeTestDb()"], {
    cwd: __dirname,
    env: { ...process.env, DATABASE_URL: "postgresql://u:p@localhost/db", NODE_ENV: "production" },
    encoding: "utf8"
  });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /NODE_ENV=production/);
});
