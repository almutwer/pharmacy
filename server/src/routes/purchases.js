/**
 * المشتريات — فواتير الشراء من الموردين (تُدخل البضاعة إلى المخزون كدفعات)
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import {
  wrap, parse, notFound, HttpError, nextDocNumber, today, round, logActivity, nowStamp,
} from '../lib/helpers.js';
import { addBatch, recordMovement } from '../lib/stock.js';

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive().optional().nullable(),
  catalog_id: z.coerce.number().int().positive().optional().nullable(),
  name: z.string().optional().nullable(),
  batch_no: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  qty: z.coerce.number().positive('الكمية مطلوبة'),
  bonus_qty: z.coerce.number().min(0).default(0),
  unit_cost: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
});

const purchaseSchema = z.object({
  supplier_id: z.coerce.number().int().positive().optional().nullable(),
  supplier_invoice: z.string().optional().nullable(),
  date: z.string().optional(),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  paid: z.coerce.number().min(0).default(0),
  payment_method: z.enum(['cash', 'credit', 'transfer', 'card']).default('cash'),
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
      where.push('(p.invoice_no LIKE ? OR p.supplier_invoice LIKE ? OR s.name LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }
    if (req.query.supplier_id) { where.push('p.supplier_id = ?'); params.push(Number(req.query.supplier_id)); }
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.from) { where.push('date(p.date) >= date(?)'); params.push(req.query.from); }
    if (req.query.to) { where.push('date(p.date) <= date(?)'); params.push(req.query.to); }

    const whereSql = where.join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE ${whereSql}`, params);
    const sums = db.get(`SELECT COALESCE(SUM(p.total),0) AS total_amount, COALESCE(SUM(p.total - p.paid),0) AS due_amount
                         FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE ${whereSql} AND p.status='posted'`, params);
    const data = db.all(`
      SELECT p.*, s.name AS supplier_name, u.full_name AS user_name,
             (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?
    `, [...params, limit, (page - 1) * limit]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1, summary: sums });
  }),
);

/* ==================== مسودة فاتورة الشراء ==================== */
/* تحفظ ما يكتبه المستخدم أولاً بأول، فلا يضيع الإدخال عند انقطاع التيار */

/** قراءة مسودة المستخدم الحالي */
router.get(
  '/draft/current',
  wrap((req, res) => {
    const row = db.get('SELECT * FROM purchase_drafts WHERE user_id = ?', [req.user.id]);
    if (!row) return res.json({ data: null });
    let data = null;
    try { data = JSON.parse(row.data); } catch { data = null; }
    return res.json({
      data,
      items_count: row.items_count,
      total: row.total,
      updated_at: row.updated_at,
    });
  }),
);

/** حفظ/تحديث المسودة (يُستدعى تلقائياً أثناء الإدخال) */
router.put(
  '/draft/current',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const body = parse(
      z.object({
        data: z.any(),
        items_count: z.coerce.number().int().min(0).default(0),
        total: z.coerce.number().default(0),
      }),
      req.body,
    );
    const payload = JSON.stringify(body.data ?? {});
    if (payload.length > 2_000_000) throw new HttpError(413, 'حجم المسودة كبير جداً');

    db.run(
      `INSERT INTO purchase_drafts (user_id, data, items_count, total, updated_at)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(user_id) DO UPDATE SET
         data = excluded.data,
         items_count = excluded.items_count,
         total = excluded.total,
         updated_at = excluded.updated_at`,
      [req.user.id, payload, body.items_count, body.total],
    );
    res.json({ ok: true, saved_at: nowStamp() });
  }),
);

/** حذف المسودة (بعد الحفظ النهائي أو عند التجاهل) */
router.delete(
  '/draft/current',
  wrap((req, res) => {
    db.run('DELETE FROM purchase_drafts WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  }),
);

router.get(
  '/:id',
  wrap((req, res) => {
    const purchase = db.get(`
      SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, u.full_name AS user_name
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ?`, [req.params.id]);
    if (!purchase) throw notFound('الفاتورة غير موجودة');
    const items = db.all(`
      SELECT pi.*, pr.name AS product_name, pr.unit
      FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id
      WHERE pi.purchase_id = ?`, [req.params.id]);
    res.json({ data: purchase, items });
  }),
);

router.post(
  '/',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = parse(purchaseSchema, req.body);
    const date = data.date || today();

    const result = db.tx(() => {
      // حساب الإجماليات
      let subtotal = 0;
      const prepared = data.items.map((item) => {
        let productId = item.product_id || null;

        // إدخال الصنف من دليل الأدوية إن لم يكن موجوداً في المخزون
        if (!productId && item.catalog_id) {
          const existing = db.get('SELECT id FROM products WHERE catalog_id = ?', [item.catalog_id]);
          if (existing) {
            productId = existing.id;
          } else {
            const drug = db.get('SELECT * FROM drug_catalog WHERE id = ?', [item.catalog_id]);
            if (!drug) throw new HttpError(404, 'الدواء غير موجود في الدليل');
            productId = db.insert('products', {
              catalog_id: drug.id,
              name: drug.trade_name,
              generic_name: drug.generic_name,
              form: drug.form,
              strength: drug.strength,
              unit: drug.unit || 'علبة',
              category: drug.category,
              manufacturer: drug.manufacturer,
              barcode: drug.barcode,
              purchase_price: item.unit_cost,
              sale_price: item.sale_price || drug.default_sale_price,
              reorder_level: 10,
              requires_prescription: drug.requires_prescription,
              active: 1,
            }).lastInsertRowid;
          }
        }

        if (!productId) throw new HttpError(422, 'يجب تحديد الصنف لكل بند');
        const product = db.get('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) throw new HttpError(404, 'الصنف غير موجود');

        const lineTotal = round(item.qty * item.unit_cost - item.discount);
        subtotal = round(subtotal + lineTotal);
        return { ...item, product_id: productId, total: lineTotal };
      });

      const total = round(subtotal - data.discount + data.tax);
      const invoiceNo = nextDocNumber('purchases', 'invoice_no', 'PUR');

      const purchaseId = db.insert('purchases', {
        invoice_no: invoiceNo,
        supplier_invoice: data.supplier_invoice || null,
        supplier_id: data.supplier_id || null,
        date,
        subtotal,
        discount: data.discount,
        tax: data.tax,
        total,
        paid: data.paid,
        payment_method: data.payment_method,
        status: 'posted',
        notes: data.notes || null,
        user_id: req.user.id,
      }).lastInsertRowid;

      for (const item of prepared) {
        const qtyTotal = round(item.qty + (item.bonus_qty || 0), 3);
        const effectiveCost = qtyTotal > 0 ? round(item.total / qtyTotal, 4) : item.unit_cost;

        const batchId = addBatch({
          productId: item.product_id,
          batchNo: item.batch_no || null,
          expiryDate: item.expiry_date || null,
          qty: qtyTotal,
          costPrice: effectiveCost,
          salePrice: item.sale_price || 0,
          supplierId: data.supplier_id || null,
          purchaseId,
        });

        db.insert('purchase_items', {
          purchase_id: purchaseId,
          product_id: item.product_id,
          batch_id: batchId,
          batch_no: item.batch_no || null,
          expiry_date: item.expiry_date || null,
          qty: item.qty,
          bonus_qty: item.bonus_qty || 0,
          unit_cost: item.unit_cost,
          sale_price: item.sale_price || 0,
          discount: item.discount || 0,
          total: item.total,
        });

        recordMovement({
          productId: item.product_id, batchId, type: 'purchase', qty: qtyTotal,
          unitCost: effectiveCost, refType: 'purchase', refId: purchaseId,
          note: `فاتورة شراء ${invoiceNo}`, userId: req.user.id, date,
        });

        // تحديث أسعار الصنف
        const update = { purchase_price: item.unit_cost };
        if (item.sale_price > 0) update.sale_price = item.sale_price;
        db.update('products', update, 'id = ?', [item.product_id]);
      }

      return { id: purchaseId, invoice_no: invoiceNo, total };
    });

    logActivity(req.user.id, 'create', 'purchases', result.id, result.invoice_no);
    res.status(201).json(result);
  }),
);

/** تسديد دفعة للمورد */
router.post(
  '/:id/pay',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const purchase = db.get('SELECT * FROM purchases WHERE id = ?', [id]);
    if (!purchase) throw notFound('الفاتورة غير موجودة');
    const { amount } = parse(z.object({ amount: z.coerce.number().positive() }), req.body);
    const paid = round(Math.min(purchase.total, purchase.paid + amount));
    db.update('purchases', { paid }, 'id = ?', [id]);
    logActivity(req.user.id, 'payment', 'purchases', id, `دفعة ${amount}`);
    res.json({ ok: true, paid, remaining: round(purchase.total - paid) });
  }),
);

/** إلغاء فاتورة شراء (يسحب الدفعات من المخزون إن لم تُصرف) */
router.post(
  '/:id/cancel',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const purchase = db.get('SELECT * FROM purchases WHERE id = ?', [id]);
    if (!purchase) throw notFound('الفاتورة غير موجودة');
    if (purchase.status === 'cancelled') throw new HttpError(400, 'الفاتورة ملغاة مسبقاً');

    db.tx(() => {
      const items = db.all('SELECT * FROM purchase_items WHERE purchase_id = ?', [id]);
      for (const item of items) {
        if (!item.batch_id) continue;
        const batch = db.get('SELECT * FROM batches WHERE id = ?', [item.batch_id]);
        if (!batch) continue;
        const qty = round(item.qty + item.bonus_qty, 3);
        if (batch.qty_available < qty) {
          const product = db.get('SELECT name FROM products WHERE id = ?', [item.product_id]);
          throw new HttpError(400, `لا يمكن الإلغاء: تم صرف جزء من دفعة الصنف «${product?.name}»`);
        }
        db.run('UPDATE batches SET qty_available = ROUND(qty_available - ?, 3), qty_in = ROUND(qty_in - ?, 3) WHERE id = ?', [qty, qty, item.batch_id]);
        recordMovement({
          productId: item.product_id, batchId: item.batch_id, type: 'purchase_cancel', qty: -qty,
          unitCost: item.unit_cost, refType: 'purchase', refId: id,
          note: `إلغاء فاتورة شراء ${purchase.invoice_no}`, userId: req.user.id,
        });
      }
      db.update('purchases', { status: 'cancelled' }, 'id = ?', [id]);
    });

    logActivity(req.user.id, 'cancel', 'purchases', id, purchase.invoice_no);
    res.json({ ok: true });
  }),
);

export default router;
