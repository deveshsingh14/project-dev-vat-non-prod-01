const { test } = require('node:test');
const assert = require('node:assert');
const { bulkUpdateProductStock } = require('./src/utils/stock');

test('bulkUpdateProductStock', async (t) => {
  await t.test('Empty items array', async () => {
    let callCount = 0;
    const tx = {
      product: {
        updateMany: async () => { callCount++; }
      }
    };

    await bulkUpdateProductStock(tx, [], 'increment');
    assert.strictEqual(callCount, 0);
  });

  await t.test('Groups items with same quantity', async () => {
    const calls = [];
    const tx = {
      product: {
        updateMany: async (args) => { calls.push(args); }
      }
    };

    const items = [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 2 },
    ];

    await bulkUpdateProductStock(tx, items, 'decrement');

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      where: { id: { in: [1, 2] } },
      data: { stock: { decrement: 2 } }
    });
  });

  await t.test('Handles items with different quantities', async () => {
    const calls = [];
    const tx = {
      product: {
        updateMany: async (args) => { calls.push(args); }
      }
    };

    const items = [
      { productId: 1, quantity: 2 },
      { productId: 3, quantity: 5 },
      { productId: 2, quantity: 2 },
    ];

    await bulkUpdateProductStock(tx, items, 'increment');

    assert.strictEqual(calls.length, 2);
    const callFor2 = calls.find(c => c.data.stock.increment === 2);
    const callFor5 = calls.find(c => c.data.stock.increment === 5);

    assert.ok(callFor2);
    assert.deepStrictEqual(callFor2.where.id.in, [1, 2]);

    assert.ok(callFor5);
    assert.deepStrictEqual(callFor5.where.id.in, [3]);
  });

  await t.test('Rejects if updateMany fails', async () => {
    const tx = {
      product: {
        updateMany: async () => { throw new Error('DB Error'); }
      }
    };

    const items = [
      { productId: 1, quantity: 2 },
    ];

    await assert.rejects(
      async () => bulkUpdateProductStock(tx, items, 'increment'),
      /DB Error/
    );
  });
});
