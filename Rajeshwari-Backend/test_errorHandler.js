require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/config/logger');

test('errorHandler', async (t) => {
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

  const createMockReq = () => ({});
  const createMockNext = () => {};

  // Mock logger.error to prevent output during tests and assert it is called
  const originalLoggerError = logger.error;
  t.after(() => { logger.error = originalLoggerError; });
  let loggerErrorCalledWith = null;
  logger.error = (err) => {
    loggerErrorCalledWith = err;
  };

  await t.test('JSON parse failure', (t) => {
    const err = { type: 'entity.parse.failed' };
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    loggerErrorCalledWith = null;
    errorHandler(err, req, res, next);

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { message: 'Invalid JSON in request body' });
    assert.strictEqual(loggerErrorCalledWith, err);
  });

  await t.test('Custom exposed error with status', (t) => {
    const err = { status: 404, expose: true, message: 'Not Found Custom' };
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    loggerErrorCalledWith = null;
    errorHandler(err, req, res, next);

    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { message: 'Not Found Custom' });
    assert.strictEqual(loggerErrorCalledWith, err);
  });

  await t.test('Custom exposed error with statusCode', (t) => {
    const err = { statusCode: 403, expose: true, message: 'Forbidden Custom' };
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    loggerErrorCalledWith = null;
    errorHandler(err, req, res, next);

    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { message: 'Forbidden Custom' });
    assert.strictEqual(loggerErrorCalledWith, err);
  });

  await t.test('Error with custom statusCode but not exposed', (t) => {
    const err = { statusCode: 401, expose: false, message: 'Secret Error' };
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    loggerErrorCalledWith = null;
    errorHandler(err, req, res, next);

    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { message: 'Something went wrong' });
    assert.strictEqual(loggerErrorCalledWith, err);
  });

  await t.test('General internal server error (no status, no expose)', (t) => {
    const err = new Error('Database connection failed');
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    loggerErrorCalledWith = null;
    errorHandler(err, req, res, next);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { message: 'Something went wrong' });
    assert.strictEqual(loggerErrorCalledWith, err);
  });
});
