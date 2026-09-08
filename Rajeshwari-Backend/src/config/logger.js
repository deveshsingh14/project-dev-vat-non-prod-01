const pino = require("pino");
const Sentry = require("@sentry/node");

// Render's log viewer is plain text, not a JSON-aware aggregator, so
// pino-pretty runs unconditionally (not just in dev) — colorize is off
// since ANSI codes don't render usefully there.
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: false,
      translateTime: "SYS:standard",
      ignore: "pid,hostname"
    }
  }
});

// Sentry is optional — SENTRY_DSN isn't in the required-env-vars list
// in index.js, so local dev without a DSN just skips error reporting
// rather than failing to boot. Every route already funnels its caught
// errors through logger.error(...), so wrapping it here reports to
// Sentry everywhere that already happens, with no changes needed in
// any route file.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });

  const logError = logger.error.bind(logger);
  logger.error = (...args) => {
    const err = args.find((a) => a instanceof Error);
    if (err) Sentry.captureException(err);
    return logError(...args);
  };
}

module.exports = logger;
