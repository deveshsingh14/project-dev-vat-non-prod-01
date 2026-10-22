const fs = require('fs');

function revenueOfOld(orders) {
  return orders.filter(o => o.status !== "Cancelled")
    .reduce((s, o) => s + o.totalAmount, 0);
}

function revenueOfNew(orders) {
  let total = 0;
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].status !== "Cancelled") {
      total += orders[i].totalAmount;
    }
  }
  return total;
}

function revenueOfReduce(orders) {
  return orders.reduce((s, o) => o.status !== "Cancelled" ? s + o.totalAmount : s, 0);
}

const orders = [];
for (let i = 0; i < 1000000; i++) {
  orders.push({
    status: i % 4 === 0 ? "Cancelled" : "Completed",
    totalAmount: Math.random() * 1000
  });
}

console.log("Warming up...");
revenueOfOld(orders);
revenueOfNew(orders);
revenueOfReduce(orders);

console.log("Benchmarking Old...");
let start = process.hrtime.bigint();
for(let i=0; i<100; i++) revenueOfOld(orders);
let end = process.hrtime.bigint();
console.log(`Old: ${(end - start) / 1000000n} ms`);

console.log("Benchmarking Reduce...");
start = process.hrtime.bigint();
for(let i=0; i<100; i++) revenueOfReduce(orders);
end = process.hrtime.bigint();
console.log(`Reduce: ${(end - start) / 1000000n} ms`);


console.log("Benchmarking New (for loop)...");
start = process.hrtime.bigint();
for(let i=0; i<100; i++) revenueOfNew(orders);
end = process.hrtime.bigint();
console.log(`New: ${(end - start) / 1000000n} ms`);
