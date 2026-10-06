const { performance } = require('perf_hooks');

const ORDERS = [];
for (let i = 0; i < 100000; i++) {
  ORDERS.push({
    status: Math.random() > 0.1 ? 'Completed' : 'Cancelled',
    createdAt: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
    totalAmount: Math.random() * 1000
  });
}

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
