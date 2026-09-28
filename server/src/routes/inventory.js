/**
 * المخزون: التسويات، الدفعات، الحركات، الصلاحيات والتنبيهات
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, notFound, HttpError, logActivity, getSettingNumber, round } from '../lib/helpers.js';
import { addBatch, recordMovement, allocateFEFO, deductBatch, restoreBatch } from '../lib/stock.js';

const router = Router();
router.use(requireAuth);

/** ملخص عام للمخزون */
router.get(
  '/summary',
  wrap((req, res) => {
    const lowLevel = getSettingNumber('low_stock_level', 10);
    const days = getSettingNumber('expiry_alert_days', 90);

    const totals = db.get(`
      SELECT COUNT(DISTINCT p.id) AS products,
             COALESCE(SUM(b.qty_available), 0) AS units,
             COALESCE(SUM(b.qty_available * b.cost_price), 0) AS cost_value,
             COALESCE(SUM(b.qty_available * CASE WHEN b.sale_price > 0 THEN b.sale_price ELSE p.sale_price END), 0) AS sale_value
      FROM products p LEFT JOIN batches b ON b.product_id = p.id
      WHERE p.active = 1
    `);

    const lowStock = db.value(`
      SELECT COUNT(*) FROM (
        SELECT p.id, COALESCE(SUM(b.qty_available),0) AS q, p.reorder_level
        FROM products p LEFT JOIN batches b ON b.product_id = p.id
        WHERE p.active = 1 GROUP BY p.id
      ) t WHERE t.q > 0 AND t.q <= CASE WHEN t.reorder_level > 0 THEN t.reorder_level ELSE ? END
    `, [lowLevel]);

    const outOfStock = db.value(`
      SELECT COUNT(*) FROM (
        SELECT p.id, COALESCE(SUM(b.qty_available),0) AS q FROM products p
        LEFT JOIN batches b ON b.product_id = p.id WHERE p.active = 1 GROUP BY p.id
      ) t WHERE t.q <= 0
    `);

    const expiringSoon = db.value(`
      SELECT COUNT(*) FROM batches b JOIN products p ON p.id = b.product_id
      WHERE b.qty_available > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <> ''
        AND date(b.expiry_date) BETWEEN date('now') AND date('now', '+' || ? || ' day')
    `, [days]);

    const expired = db.get(`
      SELECT COUNT(*) AS c, COALESCE(SUM(b.qty_available * b.cost_price),0) AS value
      FROM batches b WHERE b.qty_available > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <> ''
        AND date(b.expiry_date) < date('now')
    `);

    res.json({
      products: totals.products,
      units: round(totals.units),
      cost_value: round(totals.cost_value),
      sale_value: round(totals.sale_value),
      expected_profit: round(totals.sale_value - totals.cost_value),
      low_stock: lowStock,
      out_of_stock: outOfStock,
      expiring_soon: expiringSoon,
      expired: expired.c,
      expired_value: round(expired.value),
    });
  }),
);

/** الأصناف منخفضة المخزون */
router.get(
  '/low-stock',
  wrap((req, res) => {
    const lowLevel = getSettingNumber('low_stock_level', 10);
    const data = db.all(`
      SELECT p.id, p.name, p.unit, p.category, p.reorder_level, p.purchase_price, p.sale_price,
             COALESCE(SUM(b.qty_available),0) AS stock_qty
      FROM products p LEFT JOIN batches b ON b.product_id = p.id
      WHERE p.active = 1
      GROUP BY p.id
      HAVING stock_qty <= CASE WHEN p.reorder_level > 0 THEN p.reorder_level ELSE ? END
      ORDER BY stock_qty ASC, p.name LIMIT 200
    `, [lowLevel]);
    res.json({ data });
  }),
);

/** الدفعات القريبة من الانتهاء / المنتهية */
router.get(
  '/expiry',
  wrap((req, res) => {
    const days = Number(req.query.days) || getSettingNumber('expiry_alert_days', 90);
    const mode = req.query.mode || 'soon'; // soon | expired | all
    let cond = "date(b.expiry_date) BETWEEN date('now') AND date('now', '+' || ? || ' day')";
    const params = [days];
    if (mode === 'expired') { cond = "date(b.expiry_date) < date('now')"; params.length = 0; }
    if (mode === 'all') { cond = "date(b.expiry_date) <= date('now', '+' || ? || ' day')"; }

    const data = db.all(`
      SELECT b.*, p.name AS product_name, p.unit, p.category,
             ROUND(julianday(b.expiry_date) - julianday('now')) AS days_left,
             b.qty_available * b.cost_price AS value
      FROM batches b JOIN products p ON p.id = b.product_id
      WHERE b.qty_available > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <> '' AND ${cond}
      ORDER BY b.expiry_date ASC LIMIT 500
    `, params);
    res.json({ data });
  }),
);

/** حركات المخزون */
router.get(
  '/movements',
  wrap((req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const where = ['1=1'];
    const params = [];
    if (req.query.product_id) { where.push('m.product_id = ?'); params.push(Number(req.query.product_id)); }
    if (req.query.type) { where.push('m.type = ?'); params.push(req.query.type); }
    if (req.query.from) { where.push('date(m.date) >= date(?)'); params.push(req.query.from); }
    if (req.query.to) { where.push('date(m.date) <= date(?)'); params.push(req.query.to); }
    if (req.query.q) { where.push('p.name LIKE ?'); params.push(`%${req.query.q}%`); }

    const whereSql = where.join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE ${whereSql}`, params);
    const data = db.all(`
      SELECT m.*, p.name AS product_name, p.unit, u.full_name AS user_name, b.batch_no
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN batches b ON b.id = m.batch_id
      WHERE ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?
    `, [...params, limit, (page - 1) * limit]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  }),
);

/** تسوية مخزنية (إدخال / إخراج / تالف / منتهي) */
const adjustSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  batch_id: z.coerce.number().int().positive().optional().nullable(),
  type: z.enum(['adjust_in', 'adjust_out', 'damage', 'expired']),
  qty: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  cost_price: z.coerce.number().min(0).optional(),
  sale_price: z.coerce.number().min(0).optional(),
  batch_no: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

router.post(
  '/adjust',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = parse(adjustSchema, req.body);
    const product = db.get('SELECT * FROM products WHERE id = ?', [data.product_id]);
    if (!product) throw notFound('الصنف غير موجود');

    const result = db.tx(() => {
      if (data.type === 'adjust_in') {
        let batchId = data.batch_id;
        if (batchId) {
          restoreBatch(batchId, data.qty);
          db.run('UPDATE batches SET qty_in = qty_in + ? WHERE id = ?', [data.qty, batchId]);
        } else {
          batchId = addBatch({
            productId: product.id,
            batchNo: data.batch_no || null,
            expiryDate: data.expiry_date || null,
            qty: data.qty,
            costPrice: data.cost_price ?? product.purchase_price,
            salePrice: data.sale_price ?? product.sale_price,
          });
        }
        recordMovement({
          productId: product.id, batchId, type: 'adjust_in', qty: data.qty,
          unitCost: data.cost_price ?? product.purchase_price, refType: 'adjustment',
          note: data.note, userId: req.user.id,
        });
        return { batchId };
      }

      // إخراج
      const allocations = data.batch_id
        ? [{ batchId: data.batch_id, qty: data.qty, costPrice: db.value('SELECT cost_price FROM batches WHERE id = ?', [data.batch_id]) || 0 }]
        : allocateFEFO(product.id, data.qty);

      if (data.batch_id) {
        const avail = db.value('SELECT qty_available FROM batches WHERE id = ?', [data.batch_id]) || 0;
        if (avail < data.qty) throw new HttpError(400, `الكمية المتاحة في الدفعة (${avail}) أقل من المطلوب`);
      }

      for (const a of allocations) {
        deductBatch(a.batchId, a.qty);
        recordMovement({
          productId: product.id, batchId: a.batchId, type: data.type, qty: -a.qty,
          unitCost: a.costPrice, refType: 'adjustment', note: data.note, userId: req.user.id,
        });
      }
      return { allocations: allocations.length };
    });

    logActivity(req.user.id, 'adjust', 'inventory', product.id, `${data.type} ${data.qty} ${product.name}`);
    res.json({ ok: true, ...result });
  }),
);

/** تعديل بيانات دفعة */
router.put(
  '/batches/:id',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const batch = db.get('SELECT * FROM batches WHERE id = ?', [id]);
    if (!batch) throw notFound('الدفعة غير موجودة');
    const data = parse(
      z.object({
        batch_no: z.string().optional().nullable(),
        expiry_date: z.string().optional().nullable(),
        cost_price: z.coerce.number().min(0).optional(),
        sale_price: z.coerce.number().min(0).optional(),
      }),
      req.body,
    );
    db.update('batches', data, 'id = ?', [id]);
    logActivity(req.user.id, 'update', 'batches', id, null);
    res.json({ ok: true });
  }),
);

/** إتلاف الدفعات المنتهية دفعة واحدة */
router.post(
  '/dispose-expired',
  requireRole('manager'),
  wrap((req, res) => {
    const expired = db.all(`
      SELECT b.*, p.name FROM batches b JOIN products p ON p.id = b.product_id
      WHERE b.qty_available > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <> '' AND date(b.expiry_date) < date('now')
    `);
    let count = 0;
    let value = 0;
    db.tx(() => {
      for (const b of expired) {
        recordMovement({
          productId: b.product_id, batchId: b.id, type: 'expired', qty: -b.qty_available,
          unitCost: b.cost_price, refType: 'disposal', note: 'إتلاف دفعة منتهية الصلاحية', userId: req.user.id,
        });
        value += b.qty_available * b.cost_price;
        db.run('UPDATE batches SET qty_available = 0 WHERE id = ?', [b.id]);
        count++;
      }
    });
    logActivity(req.user.id, 'dispose', 'inventory', null, `إتلاف ${count} دفعة`);
    res.json({ ok: true, count, value: round(value) });
  }),
);

export default router;
