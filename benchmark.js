const { performance } = require('perf_hooks');
const { generateOrders } = require('./benchmark-data');

const ORDERS = generateOrders({ randomStatus: true, randomDate: true, includeOrderItems: false });

function original() {
  const map = {};
  ORDERS.filter(o => o.status !== "Cancelled").forEach(o => {
    const key = String(o.createdAt).slice(0, 10);
    map[key] = (map[key] || 0) + o.totalAmount;
  });
  return map;
}

function optimized() {
  const map = {};
  for (let i = 0; i < ORDERS.length; i++) {
    const o = ORDERS[i];
    if (o.status !== "Cancelled") {
      const key = String(o.createdAt).slice(0, 10);
      map[key] = (map[key] || 0) + o.totalAmount;
    }
  }
  return map;
}

const t0 = performance.now();
for (let i = 0; i < 100; i++) original();
const t1 = performance.now();

const t2 = performance.now();
for (let i = 0; i < 100; i++) optimized();
const t3 = performance.now();

console.log(`Original: ${(t1 - t0).toFixed(2)}ms`);
console.log(`Optimized: ${(t3 - t2).toFixed(2)}ms`);
