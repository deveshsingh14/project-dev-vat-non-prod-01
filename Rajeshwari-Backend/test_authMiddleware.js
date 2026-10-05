require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./src/middleware/authMiddleware');

test('authMiddleware', async (t) => {

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

  await t.test('No token provided', (t) => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;
    authMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { message: "No token provided" });
    assert.strictEqual(nextCalled, false);
  });

  await t.test('Valid token', (t) => {
    const req = { headers: { authorization: "Bearer valid_token" } };
    const res = createMockRes();
    let nextCalled = false;

    // Mock jwt.verify safely using t.mock if available or manually
    const originalVerify = jwt.verify;
    t.after(() => { jwt.verify = originalVerify; });
    jwt.verify = (token, secret) => ({ id: 1, role: "USER" });

    authMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.user.id, 1);

    jwt.verify = originalVerify;
  });

  await t.test('Invalid token (Error path)', (t) => {
    const req = { headers: { authorization: "Bearer invalid_token" } };
    const res = createMockRes();
    let nextCalled = false;

    const originalVerify = jwt.verify;
    t.after(() => { jwt.verify = originalVerify; });
    jwt.verify = (token, secret) => { throw new Error("jwt malformed"); };

    authMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { message: "Unauthorized" });
    assert.strictEqual(nextCalled, false);

    jwt.verify = originalVerify;
  });

});
