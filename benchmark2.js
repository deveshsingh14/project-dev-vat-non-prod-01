const { performance } = require('perf_hooks');
const { generateOrders } = require('./benchmark-data');

const ORDERS = generateOrders({ randomStatus: false, randomDate: false, includeOrderItems: true });
const inRange = ORDERS;

function runReduce() {
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

function runLoop() {
  const start = performance.now();
  let revenue = 0;
  let units = 0;
  for (let i = 0; i < inRange.length; i++) {
    const o = inRange[i];
    revenue += o.totalAmount;
    if (o.orderItems) {
      for (let j = 0; j < o.orderItems.length; j++) {
        units += o.orderItems[j].quantity;
      }
    }
  }
  const end = performance.now();
  return { revenue, units, time: end - start };
}

for(let i=0; i<10; i++) { runReduce(); runLoop(); }

let redTime = 0;
let loopTime = 0;

for(let i=0; i<100; i++) {
  redTime += runReduce().time;
  loopTime += runLoop().time;
}

console.log(`Reduce time: ${redTime / 100} ms`);
console.log(`Loop time: ${loopTime / 100} ms`);
