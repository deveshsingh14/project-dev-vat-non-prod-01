const pino = require("pino");

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

module.exports = logger;
