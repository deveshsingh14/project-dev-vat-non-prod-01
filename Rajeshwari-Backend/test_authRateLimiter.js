const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  uploadLimiter
} = require('./src/middleware/authRateLimiter');

test('authRateLimiter middleware', async (t) => {
  await t.test('exports all expected limiters as functions', () => {
    const limiters = [
      loginLimiter,
      registerLimiter,
      forgotPasswordLimiter,
      resetPasswordLimiter,
      uploadLimiter
    ];

    for (const limiter of limiters) {
      assert.strictEqual(typeof limiter, 'function');
      assert.strictEqual(typeof limiter.resetKey, 'function');
    }
  });

  const testLimiter = async (limiter, endpoint, maxRequests, expectedMessage) => {
    const app = express();
    // Trust proxy just in case, though it's local
    app.set('trust proxy', 1);
    app.post(endpoint, limiter, (req, res) => res.status(200).json({ ok: true }));

    const server = await new Promise((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });

    const port = server.address().port;

    let tooManyRequests = false;
    let finalBody = null;

    for (let i = 0; i < maxRequests + 2; i++) {
      const res = await fetch(`http://localhost:${port}${endpoint}`, { method: 'POST' });
      if (res.status === 429) {
        tooManyRequests = true;
        finalBody = await res.json();
        break;
      }
    }

    server.close();

    assert.strictEqual(tooManyRequests, true, `Should have hit rate limit after ${maxRequests} requests`);
    assert.strictEqual(finalBody.message, expectedMessage);
  };

  await t.test('loginLimiter correctly limits requests (max 10)', async () => {
    await testLimiter(loginLimiter, '/login', 10, 'Too many login attempts. Please try again later.');
  });

  await t.test('registerLimiter correctly limits requests (max 5)', async () => {
    await testLimiter(registerLimiter, '/register', 5, 'Too many accounts created from this IP. Please try again later.');
  });

  await t.test('forgotPasswordLimiter correctly limits requests (max 5)', async () => {
    await testLimiter(forgotPasswordLimiter, '/forgot', 5, 'Too many password reset requests. Please try again later.');
  });

  await t.test('resetPasswordLimiter correctly limits requests (max 5)', async () => {
    await testLimiter(resetPasswordLimiter, '/reset', 5, 'Too many password reset attempts. Please try again later.');
  });

  await t.test('uploadLimiter correctly limits requests (max 20)', async () => {
    await testLimiter(uploadLimiter, '/upload', 20, 'Too many upload attempts. Please try again later.');
  });
});
