const { test } = require('node:test');
const assert = require('node:assert');
const { validateBody } = require('./src/middleware/validate');

test('validateBody middleware', async (t) => {

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

  await t.test('Successful validation replaces req.body and calls next', (t) => {
    const mockSchema = {
      safeParse: (body) => ({
        success: true,
        data: { name: 'Valid Name', sanitized: true }
      })
    };

    const middleware = validateBody(mockSchema);
    const req = { body: { name: '  Valid Name  ' } };
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.body, { name: 'Valid Name', sanitized: true });
    assert.strictEqual(res.statusCode, undefined);
  });

  await t.test('Failed validation returns 400 with formatted errors and does not call next', (t) => {
    const mockSchema = {
      safeParse: (body) => ({
        success: false,
        error: {
          issues: [
            { path: ['username'], message: 'String must contain at least 3 character(s)' },
            { path: ['address', 'zip'], message: 'Required' }
          ]
        }
      })
    };

    const middleware = validateBody(mockSchema);
    const req = { body: { username: 'ab' } };
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, {
      message: "Validation failed",
      errors: [
        { path: 'username', message: 'String must contain at least 3 character(s)' },
        { path: 'address.zip', message: 'Required' }
      ]
    });
  });
});
