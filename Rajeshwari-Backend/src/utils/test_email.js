require('dotenv').config();
const { test, mock } = require('node:test');
const assert = require('node:assert');
const nodemailer = require('nodemailer');

let sendMailMock = async () => { return { messageId: "1234" }; };

mock.method(nodemailer, 'createTransport', () => {
  return {
    sendMail: async (opts) => sendMailMock(opts)
  };
});

const originalEmailUser = process.env.EMAIL_USER;
const originalEmailPass = process.env.EMAIL_PASS;

const { sendEmail } = require('./email');

test('sendEmail utility tests', async (t) => {

  await t.test('Missing credentials path', async (t) => {
    process.env.EMAIL_USER = "";
    process.env.EMAIL_PASS = "";

    const result = await sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>'
    });

    assert.strictEqual(result, false);
  });

  await t.test('Happy path', async (t) => {
    process.env.EMAIL_USER = "test@example.com";
    process.env.EMAIL_PASS = "password";

    sendMailMock = async () => { return { messageId: "1234" }; };

    const result = await sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>'
    });

    assert.strictEqual(result, true);
  });

  await t.test('Error path', async (t) => {
    process.env.EMAIL_USER = "test@example.com";
    process.env.EMAIL_PASS = "password";

    sendMailMock = async () => { throw new Error("Mock error"); };

    const result = await sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>'
    });

    assert.strictEqual(result, false);
  });

  process.env.EMAIL_USER = originalEmailUser;
  process.env.EMAIL_PASS = originalEmailPass;
});
