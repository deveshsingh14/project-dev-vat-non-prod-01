const { performance } = require('perf_hooks');

// Generate mock data
const ORDERS = [];
for (let i = 0; i < 100000; i++) {
  ORDERS.push({
    createdAt: new Date().toISOString(),
    status: "Delivered",
    totalAmount: Math.random() * 1000,
    orderItems: [
      { quantity: Math.floor(Math.random() * 5) + 1 },
      { quantity: Math.floor(Math.random() * 5) + 1 },
      { quantity: Math.floor(Math.random() * 5) + 1 }
    ]
  });
}

const from = new Date(Date.now() - 1000000);
const to = new Date(Date.now() + 1000000);

const inRange = ORDERS.filter(o => {
  const d = new Date(o.createdAt);
  return d >= from && d <= to && o.status !== "Cancelled";
});

console.log(`inRange length: ${inRange.length}`);

// Baseline
function runBaseline() {
  const start = performance.now();
  const revenue = inRange.reduce((s, o) => s + o.totalAmount, 0);
  const units = inRange.reduce((s, o) => s + (o.orderItems || []).reduce((n, i) => n + i.quantity, 0), 0);
  const end = performance.now();
  return { revenue, units, time: end - start };
}

// Optimized
function runOptimized() {
  const start = performance.now();
  const { revenue, units } = inRange.reduce(
    (acc, o) => {
      acc.revenue += o.totalAmount;
      acc.units += (o.orderItems || []).reduce((n, i) => n + i.quantity, 0);
      return acc;
    },
    { revenue: 0, units: 0 }
  );
  const end = performance.now();
  return { revenue, units, time: end - start };
}

// Warmup
for(let i=0; i<10; i++) { runBaseline(); runOptimized(); }

let baselineTime = 0;
let optTime = 0;

for(let i=0; i<100; i++) {
  baselineTime += runBaseline().time;
  optTime += runOptimized().time;
}

console.log(`Baseline avg time: ${baselineTime / 100} ms`);
console.log(`Optimized avg time: ${optTime / 100} ms`);
