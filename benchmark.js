const { performance } = require('perf_hooks');

// Mock data
const SIZE = 100000;
let WISHLIST = [];
for (let i = 0; i < SIZE; i++) {
  WISHLIST.push({ id: 1000000 + i, productId: i, product: { id: i } });
}

// Old method
function removeSaveOld(productId) {
  const row = WISHLIST.find(w => (w.productId ?? w.product?.id) === productId);
  return row ? row.id : null;
}

// New method setup
let savedProductIds = new Map(WISHLIST.map(w => [w.productId ?? w.product?.id, w.id]));

function removeSaveNew(productId) {
  const rowId = savedProductIds.get(productId);
  return rowId || null;
}

// Benchmark
const TEST_COUNT = 1000;
// generate some random product ids to search
const idsToSearch = [];
for (let i = 0; i < TEST_COUNT; i++) {
  idsToSearch.push(Math.floor(Math.random() * SIZE));
}

let start = performance.now();
for (let i = 0; i < TEST_COUNT; i++) {
  removeSaveOld(idsToSearch[i]);
}
let end = performance.now();
const oldTime = end - start;

start = performance.now();
for (let i = 0; i < TEST_COUNT; i++) {
  removeSaveNew(idsToSearch[i]);
}
end = performance.now();
const newTime = end - start;

console.log(`Baseline (O(N) search): ${oldTime.toFixed(2)} ms`);
console.log(`Optimized (O(1) Map): ${newTime.toFixed(2)} ms`);
console.log(`Improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(2)}% faster`);
