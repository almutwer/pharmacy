/**
 * المبيعات — نقطة البيع، الفواتير، المرتجعات
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import {
  wrap, parse, notFound, HttpError, nextDocNumber, today, round, logActivity,
} from '../lib/helpers.js';
import { allocateFEFO, deductBatch, restoreBatch, recordMovement } from '../lib/stock.js';

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  batch_id: z.coerce.number().int().positive().optional().nullable(),
  qty: z.coerce.number().positive('الكمية مطلوبة'),
  unit_price: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  /** وحدة البيع: pack = الوحدة الكبرى (علبة)، sub = الوحدة الصغرى (شريط/قرص) */
  unit_mode: z.enum(['pack', 'sub']).default('pack'),
});

/**
 * تجهيز بند البيع حسب وحدة البيع المختارة
 * يعيد الكمية بالوحدة الكبرى (للمخزون) مع بيانات العرض والطباعة
 */
function resolveUnit(product, item) {
  const perPack = Number(product.units_per_pack) || 1;

  if (item.unit_mode !== 'sub') {
    return {
      mode: 'pack',
      label: product.unit || 'وحدة',
      perPack: 1,
      qtyUnits: round(item.qty, 3),
      packQty: round(item.qty, 4),
      priceDisplay: round(item.unit_price),
      pricePack: round(item.unit_price),
    };
  }

  if (!product.allow_sub_unit) {
    throw new HttpError(400, `الصنف «${product.name}» غير مفعّل للبيع بالتجزئة`);
  }
  if (perPack <= 1) {
    throw new HttpError(400, `حدد عدد الوحدات داخل ${product.unit || 'العبوة'} للصنف «${product.name}» قبل البيع بالتجزئة`);
  }
  if (!Number.isInteger(item.qty)) {
    throw new HttpError(400, `كمية ${product.sub_unit || 'الوحدة'} يجب أن تكون رقماً صحيحاً`);
  }

  return {
    mode: 'sub',
    label: product.sub_unit || 'وحدة',
    perPack,
    qtyUnits: item.qty,
    packQty: round(item.qty / perPack, 4),
    priceDisplay: round(item.unit_price),
    // السعر المكافئ للوحدة الكبرى حتى تبقى المعادلة: الكمية × السعر = الإجمالي
    pricePack: round(item.unit_price * perPack),
  };
}

const saleSchema = z.object({
  customer_id: z.coerce.number().int().positive().optional().nullable(),
  date: z.string().optional(),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  paid: z.coerce.number().min(0).default(0),
  payment_method: z.enum(['cash', 'card', 'transfer', 'credit']).default('cash'),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'أضف صنفاً واحداً على الأقل'),
});

router.get(
  '/',
  wrap((req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const where = ['1=1'];
    const params = [];
    if (req.query.q) {
      where.push('(s.invoice_no LIKE ? OR c.name LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    if (req.query.customer_id) { where.push('s.customer_id = ?'); params.push(Number(req.query.customer_id)); }
    if (req.query.user_id) { where.push('s.user_id = ?'); params.push(Number(req.query.user_id)); }
    if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
    if (req.query.payment_method) { where.push('s.payment_method = ?'); params.push(req.query.payment_method); }
    if (req.query.from) { where.push('date(s.date) >= date(?)'); params.push(req.query.from); }
    if (req.query.to) { where.push('date(s.date) <= date(?)'); params.push(req.query.to); }

    const whereSql = where.join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ${whereSql}`, params);
    const summary = db.get(`
      SELECT COALESCE(SUM(s.total),0) AS total_amount,
             COALESCE(SUM(s.profit),0) AS total_profit,
             COALESCE(SUM(s.total - s.paid),0) AS due_amount
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${whereSql} AND s.status = 'completed'`, params);
    const data = db.all(`
      SELECT s.*, c.name AS customer_name, u.full_name AS user_name,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count,
             (SELECT COALESCE(SUM(sr.total),0) FROM sale_returns sr WHERE sr.sale_id = s.id) AS returned_amount
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE ${whereSql} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1, summary });
  }),
);

router.get(
  '/:id',
  wrap((req, res) => {
    const sale = db.get(`
      SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.full_name AS user_name
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`, [req.params.id]);
    if (!sale) throw notFound('الفاتورة غير موجودة');
    const items = db.all(`
      SELECT si.*, p.name AS name, p.unit, b.batch_no, b.expiry_date
      FROM sale_items si JOIN products p ON p.id = si.product_id
      LEFT JOIN batches b ON b.id = si.batch_id WHERE si.sale_id = ?`, [req.params.id]);
    const returns = db.all('SELECT * FROM sale_returns WHERE sale_id = ? ORDER BY id DESC', [req.params.id]);
    res.json({ data: sale, items, returns });
  }),
);

router.post(
  '/',
  wrap((req, res) => {
    const data = parse(saleSchema, req.body);
    const date = data.date || today();

    const result = db.tx(() => {
      let subtotal = 0;
      let cogs = 0;
      const invoiceNo = nextDocNumber('sales', 'invoice_no', 'INV');

      const saleId = db.insert('sales', {
        invoice_no: invoiceNo,
        customer_id: data.customer_id || null,
        date,
        subtotal: 0, discount: data.discount, tax: data.tax, total: 0,
        paid: data.paid, cogs: 0, profit: 0,
        payment_method: data.payment_method,
        status: 'completed',
        notes: data.notes || null,
        user_id: req.user.id,
      }).lastInsertRowid;

      for (const item of data.items) {
        const product = db.get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (!product) throw new HttpError(404, 'الصنف غير موجود');

        const unit = resolveUnit(product, item);
        const allocations = allocateFEFO(product.id, unit.packQty, item.batch_id || null);
        const lineTotal = round(unit.qtyUnits * unit.priceDisplay - item.discount);
        subtotal = round(subtotal + lineTotal);

        // توزيع البند على الدفعات المستخدمة
        for (const alloc of allocations) {
          const ratio = alloc.qty / unit.packQty;
          const allocTotal = round(lineTotal * ratio);
          const allocCost = round(alloc.qty * alloc.costPrice);
          cogs = round(cogs + allocCost);

          db.insert('sale_items', {
            sale_id: saleId,
            product_id: product.id,
            batch_id: alloc.batchId,
            product_name: product.name,
            qty: alloc.qty,
            unit_mode: unit.mode,
            unit_label: unit.label,
            units_per_pack: unit.perPack,
            qty_units: round(unit.qtyUnits * ratio, 3),
            unit_price_display: unit.priceDisplay,
            unit_price: unit.pricePack,
            unit_cost: alloc.costPrice,
            discount: round(item.discount * ratio),
            total: allocTotal,
          });

          deductBatch(alloc.batchId, alloc.qty);
          recordMovement({
            productId: product.id, batchId: alloc.batchId, type: 'sale', qty: -alloc.qty,
            unitCost: alloc.costPrice, refType: 'sale', refId: saleId,
            note: `فاتورة بيع ${invoiceNo}`, userId: req.user.id, date,
          });
        }
      }

      const total = round(subtotal - data.discount + data.tax);
      const profit = round(total - data.tax - cogs);
      db.update('sales', {
        subtotal, total, cogs, profit,
        paid: data.payment_method === 'credit' ? data.paid : (data.paid || total),
      }, 'id = ?', [saleId]);

      return { id: saleId, invoice_no: invoiceNo, subtotal, total, cogs, profit };
    });

    logActivity(req.user.id, 'create', 'sales', result.id, result.invoice_no);
    res.status(201).json(result);
  }),
);

/** مرتجع جزئي أو كلي */
router.post(
  '/:id/return',
  requireRole('manager', 'pharmacist', 'cashier'),
  wrap((req, res) => {
    const saleId = Number(req.params.id);
    const sale = db.get('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale) throw notFound('الفاتورة غير موجودة');
    if (sale.status === 'cancelled') throw new HttpError(400, 'الفاتورة ملغاة');

    const data = parse(
      z.object({
        reason: z.string().optional().nullable(),
        items: z.array(z.object({
          sale_item_id: z.coerce.number().int().positive(),
          /** الكمية بالوحدة الكبرى (تُستخدم إن لم تُرسل qty_units) */
          qty: z.coerce.number().positive().optional(),
          /** الكمية بوحدة البيع الفعلية (شريط/قرص) — الأولوية لها */
          qty_units: z.coerce.number().positive().optional(),
        }).refine((v) => v.qty !== undefined || v.qty_units !== undefined, {
          message: 'حدد الكمية المرتجعة',
        })).min(1, 'حدد الأصناف المرتجعة'),
      }),
      req.body,
    );

    const result = db.tx(() => {
      const returnNo = nextDocNumber('sale_returns', 'return_no', 'RET');
      let total = 0;
      let costTotal = 0;

      const returnId = db.insert('sale_returns', {
        return_no: returnNo, sale_id: saleId, date: today(), total: 0, cost_total: 0,
        reason: data.reason || null, user_id: req.user.id,
      }).lastInsertRowid;

      for (const r of data.items) {
        const item = db.get('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [r.sale_item_id, saleId]);
        if (!item) throw new HttpError(404, 'بند الفاتورة غير موجود');

        const perPack = Number(item.units_per_pack) || 1;
        const isSub = item.unit_mode === 'sub' && perPack > 1;

        // تحويل الكمية المرتجعة إلى الوحدة الكبرى
        let qty;
        if (r.qty_units !== undefined) {
          if (isSub && !Number.isInteger(r.qty_units)) {
            throw new HttpError(400, `كمية ${item.unit_label || 'الوحدة'} المرتجعة يجب أن تكون رقماً صحيحاً`);
          }
          qty = round(isSub ? r.qty_units / perPack : r.qty_units, 4);
        } else {
          qty = round(r.qty, 4);
        }

        const remaining = round(item.qty - item.returned_qty, 3);
        if (qty > remaining + 0.0001) {
          const remainingLabel = isSub
            ? `${round(remaining * perPack, 3)} ${item.unit_label}`
            : `${remaining} ${item.unit_label || ''}`.trim();
          throw new HttpError(400, `الكمية المرتجعة أكبر من المتبقي (${remainingLabel})`);
        }

        const unitNet = item.qty > 0 ? round(item.total / item.qty, 4) : item.unit_price;
        const lineTotal = round(unitNet * qty);
        const lineCost = round(item.unit_cost * qty);
        total = round(total + lineTotal);
        costTotal = round(costTotal + lineCost);

        db.insert('sale_return_items', {
          return_id: returnId, sale_item_id: item.id, product_id: item.product_id,
          batch_id: item.batch_id, qty, unit_price: item.unit_price,
          unit_cost: item.unit_cost, total: lineTotal,
        });

        db.run('UPDATE sale_items SET returned_qty = ROUND(returned_qty + ?, 4) WHERE id = ?', [qty, item.id]);
        if (item.batch_id) restoreBatch(item.batch_id, qty);
        recordMovement({
          productId: item.product_id, batchId: item.batch_id, type: 'sale_return', qty,
          unitCost: item.unit_cost, refType: 'sale_return', refId: returnId,
          note: `مرتجع فاتورة ${sale.invoice_no}`, userId: req.user.id,
        });
      }

      db.update('sale_returns', { total, cost_total: costTotal }, 'id = ?', [returnId]);

      // تحديث صافي الفاتورة
      const fullyReturned = !db.value(
        'SELECT COUNT(*) FROM sale_items WHERE sale_id = ? AND ROUND(qty - returned_qty, 3) > 0', [saleId],
      );
      if (fullyReturned) db.update('sales', { status: 'cancelled' }, 'id = ?', [saleId]);

      return { id: returnId, return_no: returnNo, total, cost_total: costTotal };
    });

    logActivity(req.user.id, 'return', 'sales', saleId, result.return_no);
    res.status(201).json(result);
  }),
);

/** إلغاء فاتورة بيع بالكامل وإرجاع البضاعة للمخزون */
router.post(
  '/:id/cancel',
  requireRole('manager'),
  wrap((req, res) => {
    const saleId = Number(req.params.id);
    const sale = db.get('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale) throw notFound('الفاتورة غير موجودة');
    if (sale.status === 'cancelled') throw new HttpError(400, 'الفاتورة ملغاة مسبقاً');

    db.tx(() => {
      const items = db.all('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
      const returnNo = nextDocNumber('sale_returns', 'return_no', 'RET');
      const returnId = db.insert('sale_returns', {
        return_no: returnNo, sale_id: saleId, date: today(), total: 0, cost_total: 0,
        reason: req.body?.reason || 'إلغاء الفاتورة', user_id: req.user.id,
      }).lastInsertRowid;
      let total = 0;
      let costTotal = 0;

      for (const item of items) {
        const qty = round(item.qty - item.returned_qty, 3);
        if (qty <= 0) continue;
        const unitNet = item.qty > 0 ? round(item.total / item.qty, 4) : item.unit_price;
        const lineTotal = round(unitNet * qty);
        const lineCost = round(item.unit_cost * qty);
        total = round(total + lineTotal);
        costTotal = round(costTotal + lineCost);

        db.insert('sale_return_items', {
          return_id: returnId, sale_item_id: item.id, product_id: item.product_id,
          batch_id: item.batch_id, qty, unit_price: item.unit_price,
          unit_cost: item.unit_cost, total: lineTotal,
        });
        if (item.batch_id) restoreBatch(item.batch_id, qty);
        recordMovement({
          productId: item.product_id, batchId: item.batch_id, type: 'sale_return', qty,
          unitCost: item.unit_cost, refType: 'sale_cancel', refId: saleId,
          note: `إلغاء فاتورة ${sale.invoice_no}`, userId: req.user.id,
        });
        db.run('UPDATE sale_items SET returned_qty = qty WHERE id = ?', [item.id]);
      }

      db.update('sale_returns', { total, cost_total: costTotal }, 'id = ?', [returnId]);
      db.update('sales', { status: 'cancelled' }, 'id = ?', [saleId]);
    });

    logActivity(req.user.id, 'cancel', 'sales', saleId, sale.invoice_no);
    res.json({ ok: true });
  }),
);

/** قائمة المرتجعات */
router.get(
  '/returns/list',
  wrap((req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.from) { where.push('date(r.date) >= date(?)'); params.push(req.query.from); }
    if (req.query.to) { where.push('date(r.date) <= date(?)'); params.push(req.query.to); }
    const data = db.all(`
      SELECT r.*, s.invoice_no, u.full_name AS user_name,
             (SELECT COUNT(*) FROM sale_return_items ri WHERE ri.return_id = r.id) AS items_count
      FROM sale_returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN users u ON u.id = r.user_id
      WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT 200`, params);
    res.json({ data });
  }),
);

export default router;
