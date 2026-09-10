const { performance } = require('perf_hooks');

const cartItems = Array.from({ length: 10000 }, (_, i) => ({
    product: { price: Math.random() * 100 },
    quantity: Math.floor(Math.random() * 5) + 1
}));

function calcForEach() {
    let totalAmount = 0;
    cartItems.forEach(item => {
        totalAmount += item.product.price * item.quantity;
    });
    return totalAmount;
}

function calcReduce() {
    return cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
}

// Warmup
for(let i=0; i<1000; i++) {
    calcForEach();
    calcReduce();
}

const runs = 10000;
let forEachTotal = 0;
let reduceTotal = 0;

let start = performance.now();
for(let i=0; i<runs; i++) calcForEach();
forEachTotal = performance.now() - start;

start = performance.now();
for(let i=0; i<runs; i++) calcReduce();
reduceTotal = performance.now() - start;

console.log(`forEach: ${forEachTotal.toFixed(2)} ms`);
console.log(`reduce: ${reduceTotal.toFixed(2)} ms`);
