const { performance } = require('perf_hooks');

// Mock data
const CATEGORIES = Array.from({ length: 50 }, (_, i) => ({ name: `Category ${i}` }));

const PRODUCTS = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  categoryList: [`Category ${i % 50}`],
  image: `image_${i}.jpg`
}));

function imgSrc(img) {
  return img || 'default.jpg';
}

function esc(s) { return s; }
function categoryEmoji(s) { return "😃"; }

// BEFORE
function categoryCover_before(cat) {
  const p = PRODUCTS.find(pr => pr.categoryList.includes(cat.name));
  return p ? imgSrc(p.image) : "";
}

function renderStories_before() {
  const stories = [{ name: "", label: "For You" }].concat(
    CATEGORIES.map(c => ({ name: c.name, label: c.name }))
  );
  return stories.map(s => {
    let face;
    if (s.name === "") {
      face = `<div class="face">✨</div>`;
    } else {
      const cover = categoryCover_before(s);
      face = cover ? cover : categoryEmoji(s.name);
    }
    return face;
  });
}

// AFTER
let categoryCoverMap = null;
function buildCategoryCoverMap() {
  categoryCoverMap = new Map();
  for (const pr of PRODUCTS) {
    if (!pr.categoryList) continue;
    for (const catName of pr.categoryList) {
      if (!categoryCoverMap.has(catName)) {
        categoryCoverMap.set(catName, imgSrc(pr.image));
      }
    }
  }
}

function categoryCover_after(cat) {
  if (!categoryCoverMap) buildCategoryCoverMap();
  return categoryCoverMap.get(cat.name) || "";
}

function renderStories_after() {
  const stories = [{ name: "", label: "For You" }].concat(
    CATEGORIES.map(c => ({ name: c.name, label: c.name }))
  );
  return stories.map(s => {
    let face;
    if (s.name === "") {
      face = `<div class="face">✨</div>`;
    } else {
      const cover = categoryCover_after(s);
      face = cover ? cover : categoryEmoji(s.name);
    }
    return face;
  });
}

// Benchmark
const iterations = 1000;

const startBefore = performance.now();
for (let i = 0; i < iterations; i++) {
  renderStories_before();
}
const endBefore = performance.now();
console.log(`Before optimization: ${endBefore - startBefore} ms`);

const startAfter = performance.now();
buildCategoryCoverMap();
for (let i = 0; i < iterations; i++) {
  renderStories_after();
}
const endAfter = performance.now();
console.log(`After optimization: ${endAfter - startAfter} ms`);
