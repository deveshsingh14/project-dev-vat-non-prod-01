function generateOrders(options = {}) {
  const { randomStatus = true, randomDate = true, includeOrderItems = false } = options;
  const orders = [];
  const fixedDate = new Date().toISOString();

  for (let i = 0; i < 100000; i++) {
    const order = {
      status: randomStatus ? (Math.random() > 0.1 ? 'Completed' : 'Cancelled') : 'Delivered',
      createdAt: randomDate ? new Date(Date.now() - Math.random() * 10000000000).toISOString() : fixedDate,
      totalAmount: Math.random() * 1000
    };
    if (includeOrderItems) {
      order.orderItems = [
        { quantity: Math.floor(Math.random() * 5) + 1 },
        { quantity: Math.floor(Math.random() * 5) + 1 },
        { quantity: Math.floor(Math.random() * 5) + 1 }
      ];
    }
    orders.push(order);
  }
  return orders;
}

module.exports = { generateOrders };