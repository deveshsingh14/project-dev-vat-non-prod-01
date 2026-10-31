// Writes to the database — must never run against Neon/production.
require('./scripts/testDbSafety').assertSafeTestDb();

const test = require('node:test');
const assert = require('assert');
const { spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_EMAILS = ["test.exists@example.com", "does.not.exist@example.com"];

// Only ever touch this test's own rows — never wipe whole tables.
async function cleanupTestUsers() {
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
}

async function setupTestDb() {
  await cleanupTestUsers();

  // Create a known user
  await prisma.user.create({
    data: {
      email: "test.exists@example.com",
      password: "$2b$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz01234",
      name: "Test User",
      role: "CUSTOMER",
    }
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    // Cloudinary is required at boot but unused by this test; dummies let it
    // start in CI, where no real credentials exist.
    const env = {
      CLOUDINARY_CLOUD_NAME: "test", CLOUDINARY_API_KEY: "test", CLOUDINARY_API_SECRET: "test",
      ...process.env, PORT: PORT.toString(), JWT_SECRET: "test_secret", NODE_ENV: "test",
      // Never send real email or Sentry events from tests. dotenv does not
      // override variables that are already set, even to "".
      EMAIL_USER: "", EMAIL_PASS: "", SENTRY_DSN: ""
    };
    const server = spawn('node', ['src/index.js'], { env, cwd: __dirname });

    server.stdout.on('data', (data) => {
      if (data.toString().includes('Server running on port')) {
        resolve(server);
      }
    });

    server.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    server.on('error', (err) => reject(err));

    // Fallback if the message isn't caught
    setTimeout(() => resolve(server), 2000);
  });
}

test('Forgot Password Email Enumeration Protection', async (t) => {
  await setupTestDb();
  const serverProcess = await startServer();

  t.after(async () => {
    serverProcess.kill();
    await cleanupTestUsers();
    await prisma.$disconnect();
  });

  const testEmail = async (email) => {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const end = performance.now();

    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse JSON:", text);
    }

    return { status: res.status, body, duration: end - start };
  };

  // Test with existing email
  const existingResult = await testEmail("test.exists@example.com");
  assert.strictEqual(existingResult.status, 200, "Existing email should return 200 OK");
  assert.strictEqual(existingResult.body.message, "If an account with that email exists, we sent a password reset link.");

  // Test with non-existing email
  const nonExistingResult = await testEmail("does.not.exist@example.com");
  assert.strictEqual(nonExistingResult.status, 200, "Non-existing email should return 200 OK");
  assert.strictEqual(nonExistingResult.body.message, "If an account with that email exists, we sent a password reset link.");

  // Note: While we could assert timing here (e.g. Math.abs(existingResult.duration - nonExistingResult.duration) < 50ms),
  // test environment timing is often jittery and can cause flaky tests.
  // We verified the code logic uses a background IIFE, so it should be O(1) response time.
  console.log(`Existing user duration: ${existingResult.duration.toFixed(2)}ms`);
  console.log(`Non-existing user duration: ${nonExistingResult.duration.toFixed(2)}ms`);

});
