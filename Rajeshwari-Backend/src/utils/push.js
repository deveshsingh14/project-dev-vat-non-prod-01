// Web Push notifications (order placed / shipped / delivered / cancelled).
//
// Configuration (Render dashboard / local .env):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — generate once: npx web-push generate-vapid-keys
//   VAPID_SUBJECT                        — "mailto:you@example.com" (contact for push services)
// If any is missing, push is disabled: every function becomes a logged
// no-op, so the rest of the app keeps working.
//
// Delivery is best-effort and NEVER throws into the caller: callers fire
// these after a response/transaction has completed. Subscriptions the push
// service reports as gone (404/410) are deleted.

const webpush = require("web-push");
const prisma = require("../config/db");
const logger = require("../config/logger");

let configured = null; // null = not checked yet, true/false afterwards

function isPushConfigured() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    logger.warn("Push notifications disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set.");
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  } catch (error) {
    logger.error({ err: error.message }, "Push notifications disabled: invalid VAPID configuration.");
    configured = false;
  }
  return configured;
}

function getPublicKey() {
  return isPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}

// For tests only.
function _reset() { configured = null; }

function toWebPushSubscription(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

async function sendToSubscriptions(rows, payload) {
  if (!rows.length) return { sent: 0, removed: 0, failed: 0 };
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0;
  const gone = [];

  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification(toWebPushSubscription(row), body, { TTL: 24 * 60 * 60, urgency: "high" });
      sent++;
    } catch (error) {
      if (error && (error.statusCode === 404 || error.statusCode === 410)) {
        gone.push(row.id);
      } else {
        failed++;
        logger.warn({ status: error && error.statusCode, err: error && error.message }, "Push send failed");
      }
    }
  }));

  if (gone.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } }).catch(err =>
      logger.warn({ err: err.message }, "Couldn't prune expired push subscriptions"));
  }
  return { sent, removed: gone.length, failed };
}

async function notifyUser(userId, payload) {
  try {
    if (!isPushConfigured() || !userId) return { sent: 0, removed: 0, failed: 0 };
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    return await sendToSubscriptions(rows, payload);
  } catch (error) {
    logger.error({ err: error.message }, "notifyUser failed");
    return { sent: 0, removed: 0, failed: 1 };
  }
}

// Shop owner side: every ADMIN / OWNER account's devices.
async function notifyAdmins(payload) {
  try {
    if (!isPushConfigured()) return { sent: 0, removed: 0, failed: 0 };
    const rows = await prisma.pushSubscription.findMany({
      where: { user: { role: { in: ["ADMIN", "OWNER"] } } }
    });
    return await sendToSubscriptions(rows, payload);
  } catch (error) {
    logger.error({ err: error.message }, "notifyAdmins failed");
    return { sent: 0, removed: 0, failed: 1 };
  }
}

// ---------- message builders (no personal data beyond first name) ----------
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const firstName = s => String(s || "").trim().split(/\s+/)[0] || "A customer";

function newOrderForShop(order) {
  const items = (order.orderItems || []).reduce((n, i) => n + (i.quantity || 0), 0);
  return {
    title: `🛍 New order #${order.id}`,
    body: `${firstName(order.fullName)} ordered ${items} item${items === 1 ? "" : "s"} · ${inr(order.totalAmount)} (${order.paymentMethod || "COD"})`,
    url: "admin.html",
    tag: `order-${order.id}-new`
  };
}

function orderPlacedForCustomer(order) {
  return {
    title: `Order #${order.id} placed ✓`,
    body: `Thank you! ${inr(order.totalAmount)} · we'll let you know when it ships.`,
    url: "account.html",
    tag: `order-${order.id}`
  };
}

const STATUS_MESSAGES = {
  Shipped: o => ({ title: `📦 Order #${o.id} has shipped`, body: "Your order is on its way." }),
  "Out for Delivery": o => ({ title: `🚚 Order #${o.id} is out for delivery`, body: "It will reach you today. Please keep your phone handy." }),
  Attempted: o => ({ title: `Order #${o.id}: delivery attempted`, body: "We couldn't reach you — we'll try again soon." }),
  Delivered: o => ({ title: `✅ Order #${o.id} delivered`, body: "Enjoy! Thank you for shopping with Radha E-Commerce." }),
  Cancelled: o => ({ title: `Order #${o.id} was cancelled`, body: "Questions? Reply from your account page or contact the shop." })
};

// Returns a payload only for statuses customers are told about.
function statusChangeForCustomer(order) {
  const build = STATUS_MESSAGES[order.status];
  if (!build) return null;
  return { ...build(order), url: "account.html", tag: `order-${order.id}` };
}

module.exports = {
  isPushConfigured,
  getPublicKey,
  notifyUser,
  notifyAdmins,
  newOrderForShop,
  orderPlacedForCustomer,
  statusChangeForCustomer,
  NOTIFY_STATUSES: Object.keys(STATUS_MESSAGES),
  _reset
};
