// Guard for any test or script that WRITES to the database.
//
// Rajeshwari-Backend/.env usually points at the live Neon database, and
// both Prisma and dotenv pick it up automatically. A test that "resets"
// tables (e.g. user.deleteMany) would therefore wipe production data.
// Call assertSafeTestDb() as the very first thing — before creating a
// PrismaClient or requiring src/config/db — in every such file.
//
// Allowed: a database on this machine (localhost / 127.0.0.1 / ::1) or
// the CI service container host ("postgres"). Anything else aborts.
// Point tests at a local DB by overriding the env var, e.g.
//   DATABASE_URL="postgresql://user:pass@localhost:5432/radha_test" npm run test:db

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

function isSafeTestDbUrl(url) {
  if (!url) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SAFE_HOSTS.has(host);
}

function assertSafeTestDb() {
  // Load .env the same way the app does, so we check the URL Prisma will use.
  require("dotenv").config({ quiet: true });

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run database tests with NODE_ENV=production.");
  }
  if (!isSafeTestDbUrl(process.env.DATABASE_URL)) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not a local test database. " +
      "These tests modify data and must never run against Neon/production. " +
      "Override it, e.g. DATABASE_URL=\"postgresql://user:pass@localhost:5432/radha_test\" npm run test:db"
    );
  }
}

module.exports = { assertSafeTestDb, isSafeTestDbUrl, SAFE_HOSTS };
