/**
 * خدمات المخزون: الدفعات، صرف FEFO (الأقرب انتهاءً أولاً)، وحركات المخزون
 */
import db from './db.js';
import { HttpError, round, nowStamp, getSetting } from './helpers.js';

/** الكمية المتاحة لصنف */
export function productStock(productId) {
  return round(db.value('SELECT COALESCE(SUM(qty_available),0) AS q FROM batches WHERE product_id = ?', [productId]) || 0, 3);
}

/** تسجيل حركة مخزون */
export function recordMovement({ productId, batchId, type, qty, unitCost = 0, refType, refId, note, userId, date }) {
  db.insert('stock_movements', {
    date: date || nowStamp(),
    product_id: productId,
    batch_id: batchId || null,
    type,
    qty,
    unit_cost: unitCost,
    ref_type: refType || null,
    ref_id: refId || null,
    note: note || null,
    user_id: userId || null,
  });
}

/** إضافة دفعة جديدة للمخزون */
export function addBatch({ productId, batchNo, expiryDate, qty, costPrice, salePrice, supplierId, purchaseId }) {
  const res = db.insert('batches', {
    product_id: productId,
    batch_no: batchNo || null,
    expiry_date: expiryDate || null,
    qty_in: qty,
    qty_available: qty,
    cost_price: costPrice || 0,
    sale_price: salePrice || 0,
    supplier_id: supplierId || null,
    purchase_id: purchaseId || null,
  });
  return res.lastInsertRowid;
}

/**
 * تخصيص كمية من الدفعات حسب الأقرب انتهاءً (FEFO)
 * يعيد قائمة بالتخصيصات دون تعديل المخزون
 */
export function allocateFEFO(productId, qty, preferredBatchId = null) {
  const allocations = [];
  let remaining = round(qty, 3);

  const batches = db.all(
    `SELECT * FROM batches
     WHERE product_id = ? AND qty_available > 0
     ORDER BY (id = ?) DESC,
              CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
              expiry_date ASC, id ASC`,
    [productId, preferredBatchId || -1],
  );

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qty_available, remaining);
    allocations.push({ batchId: b.id, qty: round(take, 3), costPrice: b.cost_price, expiry: b.expiry_date });
    remaining = round(remaining - take, 3);
  }

  if (remaining > 0) {
    const allowNegative = getSetting('allow_negative_stock', '0') === '1';
    const product = db.get('SELECT name FROM products WHERE id = ?', [productId]);
    if (!allowNegative) {
      throw new HttpError(
        400,
        `الكمية غير كافية في المخزون للصنف: ${product?.name || productId} (النقص: ${remaining})`,
      );
    }
    // سماح بالسالب: نخصمها من آخر دفعة أو ننشئ دفعة مفتوحة
    const last = batches[batches.length - 1];
    const avgCost = db.value('SELECT COALESCE(AVG(cost_price),0) FROM batches WHERE product_id = ?', [productId]) || 0;
    if (last) {
      allocations.push({ batchId: last.id, qty: remaining, costPrice: last.cost_price, expiry: last.expiry_date });
    } else {
      const bid = addBatch({ productId, batchNo: 'OPEN', qty: 0, costPrice: avgCost, salePrice: 0 });
      allocations.push({ batchId: bid, qty: remaining, costPrice: avgCost, expiry: null });
    }
  }

  return allocations;
}

/** خصم كمية من دفعة */
export function deductBatch(batchId, qty) {
  db.run('UPDATE batches SET qty_available = ROUND(qty_available - ?, 3) WHERE id = ?', [qty, batchId]);
}

/** إعادة كمية إلى دفعة */
export function restoreBatch(batchId, qty) {
  db.run('UPDATE batches SET qty_available = ROUND(qty_available + ?, 3) WHERE id = ?', [qty, batchId]);
}

/** ملخص المخزون لصنف (كمية، قيمة، أقرب انتهاء) */
export function productStockSummary(productId) {
  return db.get(
    `SELECT COALESCE(SUM(qty_available),0) AS qty,
            COALESCE(SUM(qty_available * cost_price),0) AS cost_value,
            COALESCE(SUM(qty_available * NULLIF(sale_price,0)),0) AS sale_value,
            MIN(CASE WHEN qty_available > 0 AND expiry_date IS NOT NULL AND expiry_date <> '' THEN expiry_date END) AS nearest_expiry
     FROM batches WHERE product_id = ?`,
    [productId],
  );
}
