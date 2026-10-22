const ORDERS = [];
for (let i = 0; i < 1000000; i++) {
  ORDERS.push({
    paymentStatus: ["Paid", "Pending", "Refunded", "Other"][i % 4],
    status: ["Delivered", "Cancelled", "Pending"][i % 3],
    paymentMethod: ["UPI", "COD"][i % 2],
    totalAmount: Math.random() * 1000
  });
}

function original() {
  const paid = ORDERS.filter(o => o.paymentStatus === "Paid");
  const awaiting = ORDERS.filter(o => o.paymentStatus === "Pending" && o.status !== "Cancelled");
  const refunded = ORDERS.filter(o => o.paymentStatus === "Refunded");
  const sum = list => list.reduce((s, o) => s + o.totalAmount, 0);

  return [
    { label: "Collected", value: sum(paid), foot: `${paid.length} paid orders`, cls: "" },
    { label: "Awaiting payment", value: sum(awaiting), foot: `${awaiting.length} unpaid (COD/UPI)`, cls: "" },
    { label: "Refunded", value: sum(refunded), foot: `${refunded.length} orders`, cls: refunded.length ? "alert" : "" },
    { label: "UPI share", value: sum(ORDERS.filter(o => o.paymentMethod === "UPI" && o.paymentStatus === "Paid")), foot: "collected via UPI", cls: "" }
  ];
}

function optimized() {
  const stats = ORDERS.reduce((acc, o) => {
    if (o.paymentStatus === "Paid") {
      acc.paid.count++;
      acc.paid.sum += o.totalAmount;
      if (o.paymentMethod === "UPI") acc.upiSum += o.totalAmount;
    } else if (o.paymentStatus === "Refunded") {
      acc.refunded.count++;
      acc.refunded.sum += o.totalAmount;
    } else if (o.paymentStatus === "Pending" && o.status !== "Cancelled") {
      acc.awaiting.count++;
      acc.awaiting.sum += o.totalAmount;
    }
    return acc;
  }, {
    paid: { count: 0, sum: 0 },
    awaiting: { count: 0, sum: 0 },
    refunded: { count: 0, sum: 0 },
    upiSum: 0
  });

  return [
    { label: "Collected", value: stats.paid.sum, foot: `${stats.paid.count} paid orders`, cls: "" },
    { label: "Awaiting payment", value: stats.awaiting.sum, foot: `${stats.awaiting.count} unpaid (COD/UPI)`, cls: "" },
    { label: "Refunded", value: stats.refunded.sum, foot: `${stats.refunded.count} orders`, cls: stats.refunded.count ? "alert" : "" },
    { label: "UPI share", value: stats.upiSum, foot: "collected via UPI", cls: "" }
  ];
}

// Warmup
for (let i = 0; i < 5; i++) { original(); optimized(); }

console.time("Original");
for(let i=0; i<10; i++) original();
console.timeEnd("Original");

console.time("Optimized");
for(let i=0; i<10; i++) optimized();
console.timeEnd("Optimized");
