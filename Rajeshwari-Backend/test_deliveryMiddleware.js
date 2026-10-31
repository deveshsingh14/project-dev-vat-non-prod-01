// deliveryMiddleware: token role AND current DB role must allow delivery access.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const dbRoles = new Map();
let dbThrows = false;
const dbPath = require.resolve(path.join(__dirname, 'src/config/db'));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { user: { findUnique: async ({ where }) => {
    if (dbThrows) throw new Error('db down');
    return dbRoles.has(where.id) ? { role: dbRoles.get(where.id) } : null;
  } } }
};
const deliveryMiddleware = require('./src/middleware/deliveryMiddleware');

function run(user) {
  const res = { statusCode: undefined, body: undefined,
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let nextCalled = false;
  return deliveryMiddleware({ user }, res, () => { nextCalled = true; }).then(() => ({ res, nextCalled }));
}

test('allows DELIVERY_PARTNER, ADMIN and OWNER whose DB role still matches', async () => {
  for (const [id, role] of [[1, 'DELIVERY_PARTNER'], [2, 'ADMIN'], [3, 'OWNER']]) {
    dbRoles.set(id, role);
    const { res, nextCalled } = await run({ id, role });
    assert.strictEqual(nextCalled, true, role);
    assert.strictEqual(res.statusCode, undefined);
  }
});

test('rejects CUSTOMER tokens without touching the DB', async () => {
  const { res, nextCalled } = await run({ id: 99, role: 'CUSTOMER' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.message, 'Delivery access only');
});

test('rejects a partner who has since been demoted (stale token)', async () => {
  dbRoles.set(4, 'CUSTOMER');
  const { res, nextCalled } = await run({ id: 4, role: 'DELIVERY_PARTNER' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test('rejects a deleted user', async () => {
  const { res, nextCalled } = await run({ id: 12345, role: 'DELIVERY_PARTNER' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test('uses the current DB role from then on', async () => {
  dbRoles.set(5, 'ADMIN');
  const user = { id: 5, role: 'DELIVERY_PARTNER' };
  await run(user);
  assert.strictEqual(user.role, 'ADMIN');
});

test('fails closed (500, no next) when the DB check errors', async () => {
  dbRoles.set(6, 'DELIVERY_PARTNER');
  dbThrows = true;
  const { res, nextCalled } = await run({ id: 6, role: 'DELIVERY_PARTNER' });
  dbThrows = false;
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 500);
});
