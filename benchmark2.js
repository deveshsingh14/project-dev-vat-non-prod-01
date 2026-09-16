const { performance } = require('perf_hooks');

// Mock data
const numItems = 100;
const orderItems = Array.from({ length: numItems }, (_, i) => ({
  productId: i + 1,
  quantity: 2
}));

const mockProducts = new Map(
  Array.from({ length: numItems }, (_, i) => [
    i + 1,
    { id: i + 1, title: `Product ${i + 1}`, stock: 10 }
  ])
);

// We need an asynchronous delay mechanism that scales appropriately
// to simulate the real cost of N database connections/queries.
const simulatedNetworkLatency = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const simulatedDBProcessing = (ms) => {
  let start = Date.now();
  while(Date.now() - start < ms) {} // spin wait
};

const tx = {
  product: {
    findUnique: async ({ where }) => {
      // Simulate real-world delay for an individual query over the network
      await simulatedNetworkLatency(5);
      return mockProducts.get(where.id);
    },
    findMany: async ({ where }) => {
      // One query, one network round trip, slightly longer db process
      await simulatedNetworkLatency(5 + Math.log2(where.id.in.length));
      return where.id.in.map(id => mockProducts.get(id)).filter(Boolean);
    }
  }
};

const order = { orderItems };

async function benchmarkOld() {
  const start = performance.now();

  await Promise.all(
    order.orderItems.map(async item => {
      const product = await tx.product.findUnique({
        where: { id: item.productId }
      });
      if (!product || product.stock < item.quantity) {
        throw { code: "RESTOCK_FAIL", title: product ? product.title : "A product" };
      }
    })
  );

  const end = performance.now();
  return end - start;
}

async function benchmarkNew() {
  const start = performance.now();

  const productIds = order.orderItems.map(item => item.productId);
  const products = await tx.product.findMany({
    where: { id: { in: productIds } }
  });

  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of order.orderItems) {
    const product = productMap.get(item.productId);
    if (!product || product.stock < item.quantity) {
      throw { code: "RESTOCK_FAIL", title: product ? product.title : "A product" };
    }
  }

  const end = performance.now();
  return end - start;
}

async function runBenchmarks() {
  console.log("Running benchmarks with more realistic simulation...");

  let oldTotal = 0;
  let newTotal = 0;
  const iterations = 5;

  for (let i = 0; i < iterations; i++) {
    oldTotal += await benchmarkOld();
    newTotal += await benchmarkNew();
  }

  console.log(`Old Implementation (N+1 Concurrent Queries): ${(oldTotal / iterations).toFixed(2)} ms`);
  console.log(`New Implementation (Single Batch Query): ${(newTotal / iterations).toFixed(2)} ms`);
}

runBenchmarks().catch(console.error);
