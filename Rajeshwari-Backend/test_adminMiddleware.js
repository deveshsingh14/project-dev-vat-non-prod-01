const { test } = require('node:test');
const assert = require('node:assert');
const adminMiddleware = require('./src/middleware/adminMiddleware');

test('adminMiddleware', async (t) => {

  const createMockRes = () => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  await t.test('Allows ADMIN role', (t) => {
    const req = { user: { role: 'ADMIN' } };
    const res = createMockRes();
    let nextCalled = false;

    adminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, undefined);
  });

  await t.test('Blocks USER role', (t) => {
    const req = { user: { role: 'USER' } };
    const res = createMockRes();
    let nextCalled = false;

    adminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { message: "Admin access only" });
  });

  await t.test('Blocks missing role', (t) => {
    const req = { user: {} };
    const res = createMockRes();
    let nextCalled = false;

    adminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { message: "Admin access only" });
  });

  await t.test('Blocks OWNER role', (t) => {
    const req = { user: { role: 'OWNER' } };
    const res = createMockRes();
    let nextCalled = false;

    adminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { message: "Admin access only" });
  });

});
