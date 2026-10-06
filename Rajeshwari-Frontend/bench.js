const fs = require('fs');

// Generate 100,000 dummy orders
const ORDERS = [];
const statuses = ["Pending", "Shipped", "Delivered", "Cancelled"];
const baseDate = new Date();

for (let i = 0; i < 100000; i++) {
  const d = new Date(baseDate.getTime() - Math.random() * 10000000000);
  ORDERS.push({
    id: i,
    createdAt: d.toISOString(),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    totalAmount: Math.random() * 1000
  });
}

const from = new Date(baseDate.getTime() - 5000000000);
const to = new Date(baseDate.getTime() - 1000000000);

console.time('Baseline');
const inRange1 = ORDERS.filter(o => {
  const d = new Date(o.createdAt);
  return d >= from && d <= to && o.status !== "Cancelled";
});
console.timeEnd('Baseline');

const fromISO = from.toISOString();
const toISO = to.toISOString();

console.time('Optimized');
const inRange2 = ORDERS.filter(o => {
  return o.createdAt >= fromISO && o.createdAt <= toISO && o.status !== "Cancelled";
});
console.timeEnd('Optimized');

console.log("Results count baseline:", inRange1.length);
console.log("Results count optimized:", inRange2.length);
