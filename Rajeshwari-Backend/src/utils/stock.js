const bulkUpdateProductStock = async (tx, items, operation) => {
  const map = {};
  for (const item of items) {
    // A line whose product has since been deleted has nothing to restock.
    if (item.productId === null || item.productId === undefined) continue;
    if (!map[item.quantity]) {
      map[item.quantity] = [];
    }
    map[item.quantity].push(item.productId);
  }

  await Promise.all(
    Object.entries(map).map(([quantity, ids]) =>
      tx.product.updateMany({
        where: { id: { in: ids } },
        data: { stock: { [operation]: parseInt(quantity, 10) } }
      })
    )
  );
};

module.exports = { bulkUpdateProductStock };
