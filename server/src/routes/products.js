/**
 * أصناف المخزون (الأدوية المتداولة فعلياً في الصيدلية)
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, notFound, HttpError, nowStamp, logActivity, getSettingNumber } from '../lib/helpers.js';
import { addBatch, recordMovement } from '../lib/stock.js';
import { createWorkbook, addSheet, addGuideSheet, sendWorkbook, readSheetRows, decodeUpload } from '../lib/excel.js';
import { PRODUCT_COLUMNS, exportColumns, templateColumns, writableColumns } from '../lib/io-columns.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  catalog_id: z.coerce.number().int().positive().optional().nullable(),
  name: z.string().min(1, 'اسم الصنف مطلوب'),
  generic_name: z.string().optional().nullable(),
  form: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  sub_unit: z.string().optional().nullable(),
  units_per_pack: z.coerce.number().min(1).default(1),
  sub_unit_price: z.coerce.number().min(0).default(0),
  allow_sub_unit: z.coerce.number().int().min(0).max(1).default(0),
  category: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  purchase_price: z.coerce.number().min(0).default(0),
  sale_price: z.coerce.number().min(0).default(0),
  reorder_level: z.coerce.number().min(0).default(10),
  location: z.string().optional().nullable(),
  requires_prescription: z.coerce.number().int().min(0).max(1).default(0),
  notes: z.string().optional().nullable(),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

const STOCK_SELECT = `
  p.*,
  COALESCE(s.qty, 0) AS stock_qty,
  COALESCE(s.cost_value, 0) AS stock_cost_value,
  s.nearest_expiry,
  cat.trade_name AS catalog_name
`;
const STOCK_JOIN = `
  LEFT JOIN (
    SELECT product_id,
           SUM(qty_available) AS qty,
           SUM(qty_available * cost_price) AS cost_value,
           MIN(CASE WHEN qty_available > 0 AND expiry_date IS NOT NULL AND expiry_date <> '' THEN expiry_date END) AS nearest_expiry
    FROM batches GROUP BY product_id
  ) s ON s.product_id = p.id
  LEFT JOIN drug_catalog cat ON cat.id = p.catalog_id
`;

router.get(
  '/meta',
  wrap((req, res) => {
    res.json({
      categories: db.all("SELECT DISTINCT category AS v FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY v").map((r) => r.v),
      forms: db.all("SELECT DISTINCT form AS v FROM products WHERE form IS NOT NULL AND form <> '' ORDER BY v").map((r) => r.v),
      units: db.all("SELECT DISTINCT unit AS v FROM products WHERE unit IS NOT NULL AND unit <> '' ORDER BY v").map((r) => r.v),
    });
  }),
);

router.get(
  '/',
  wrap((req, res) => {
    const { q, category, status } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Number(req.query.limit) || 25);
    const lowLevel = getSettingNumber('low_stock_level', 10);
    const expiryDays = getSettingNumber('expiry_alert_days', 90);

    const where = ['1=1'];
    const params = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode LIKE ? OR p.manufacturer LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) { where.push('p.category = ?'); params.push(category); }
    if (req.query.active !== undefined && req.query.active !== '') {
      where.push('p.active = ?'); params.push(Number(req.query.active));
    }

    const having = [];
    if (status === 'low') having.push(`COALESCE(s.qty,0) > 0 AND COALESCE(s.qty,0) <= CASE WHEN p.reorder_level > 0 THEN p.reorder_level ELSE ${lowLevel} END`);
    if (status === 'out') having.push('COALESCE(s.qty,0) <= 0');
    if (status === 'expiring') having.push(`s.nearest_expiry IS NOT NULL AND date(s.nearest_expiry) <= date('now', '+${expiryDays} day') AND date(s.nearest_expiry) >= date('now')`);
    if (status === 'expired') having.push("s.nearest_expiry IS NOT NULL AND date(s.nearest_expiry) < date('now')");

    const whereSql = [...where, ...having].join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM products p ${STOCK_JOIN} WHERE ${whereSql}`, params);
    const data = db.all(
      `SELECT ${STOCK_SELECT} FROM products p ${STOCK_JOIN} WHERE ${whereSql}
       ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  }),
);

/** بحث سريع لنقطة البيع */
router.get(
  '/search',
  wrap((req, res) => {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = db.all(
      `SELECT ${STOCK_SELECT} FROM products p ${STOCK_JOIN}
       WHERE p.active = 1 AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode = ?)
       ORDER BY (p.barcode = ?) DESC, p.name COLLATE NOCASE LIMIT 20`,
      [like, like, q, q],
    );
    res.json({ data: rows });
  }),
);

/* ==================== تصدير / استيراد Excel ==================== */

/** تصدير المخزون كملف Excel */
router.get(
  '/export',
  wrap(async (req, res) => {
    const { q, category, status } = req.query;
    const where = ['1=1'];
    const params = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (category) { where.push('p.category = ?'); params.push(category); }
    if (req.query.active !== undefined && req.query.active !== '') {
      where.push('p.active = ?'); params.push(Number(req.query.active));
    }
    const low = getSettingNumber('low_stock_level', 10);
    if (status === 'low') where.push(`COALESCE(s.qty, 0) > 0 AND COALESCE(s.qty, 0) <= COALESCE(NULLIF(p.reorder_level, 0), ${low})`);
    if (status === 'out') where.push('COALESCE(s.qty, 0) <= 0');

    const rows = db.all(
      `SELECT ${STOCK_SELECT} FROM products p ${STOCK_JOIN} WHERE ${where.join(' AND ')} ORDER BY p.name COLLATE NOCASE`,
      params,
    );

    const totalQty = rows.reduce((a, r) => a + Number(r.stock_qty || 0), 0);
    const totalCost = rows.reduce((a, r) => a + Number(r.stock_cost_value || 0), 0);

    const wb = createWorkbook();
    addSheet(wb, {
      name: 'المخزون',
      title: 'جرد أصناف المخزون',
      note: `عدد الأصناف: ${rows.length} — إجمالي الكميات: ${totalQty} — قيمة التكلفة: ${totalCost.toFixed(2)} — بتاريخ ${nowStamp()}`,
      columns: exportColumns(PRODUCT_COLUMNS),
      rows,
    });
    logActivity(req.user.id, 'export', 'products', null, `تصدير ${rows.length} صنف إلى Excel`);
    await sendWorkbook(res, wb, `المخزون-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }),
);

/** قالب Excel فارغ لاستيراد الأصناف */
router.get(
  '/template',
  wrap(async (req, res) => {
    const cols = templateColumns(PRODUCT_COLUMNS);
    const wb = createWorkbook();
    addSheet(wb, {
      name: 'المخزون',
      columns: cols,
      rows: [
        {
          name: 'سيتال 500 مجم', generic_name: 'باراسيتامول', form: 'أقراص', strength: '500 مجم',
          unit: 'علبة', category: 'مسكنات وخافضات الحرارة', manufacturer: 'EIPICO',
          purchase_price: 5, sale_price: 9, reorder_level: 10, location: 'رف A1',
          requires_prescription: 0, active: 1, opening_qty: 50, opening_batch_no: 'B-1001',
          opening_expiry: '2027-12-31',
        },
      ],
    });
    addGuideSheet(wb, {
      columns: cols,
      title: 'تعليمات استيراد أصناف المخزون',
      lines: [
        '١) اكتب الأصناف في ورقة «المخزون» تحت العناوين الملوّنة، ولا تغيّر أسماء الأعمدة.',
        '٢) احذف صف المثال قبل الرفع.',
        '٣) عمود «المعرف» فارغ = صنف جديد، وبرقم موجود = تحديث بيانات الصنف.',
        '٤) «رصيد افتتاحي» يُسجَّل كدفعة جديدة للأصناف الجديدة فقط، ويُتجاهل عند تحديث صنف موجود — لتعديل أرصدة صنف قائم استخدم «تسوية مخزنية».',
        '٥) الكميات والأسعار أرقام فقط، والتواريخ بصيغة YYYY-MM-DD.',
        '٦) يمكنك أيضاً رفع ملف CSV بنفس العناوين.',
      ],
    });
    await sendWorkbook(res, wb, 'قالب-المخزون.xlsx');
  }),
);

/** استيراد الأصناف من ملف Excel/CSV */
router.post(
  '/import-file',
  requireRole('manager', 'pharmacist'),
  wrap(async (req, res) => {
    const body = parse(z.object({
      file: z.string().min(1),
      filename: z.string().optional().default(''),
      mode: z.enum(['upsert', 'insert']).default('upsert'),
      dry_run: z.coerce.boolean().default(false),
    }), req.body);

    const buffer = decodeUpload(body.file);
    const { rows, unknown, matched } = await readSheetRows(buffer, PRODUCT_COLUMNS, body.filename);
    if (!rows.length) throw new HttpError(400, 'لا توجد صفوف بيانات في الملف');
    if (rows.length > 5000) throw new HttpError(400, 'الحد الأقصى 5000 صف في الملف الواحد');

    const writable = writableColumns(PRODUCT_COLUMNS)
      .filter((c) => !c.importOnly)
      .map((c) => c.key);

    const result = {
      total: rows.length, created: 0, updated: 0, skipped: 0, opening_units: 0, errors: [], matched, unknown,
    };

    const run = () => {
      for (const row of rows) {
        const label = row.name || `صف ${row.__row}`;
        try {
          let existing = null;
          if (row.id) {
            existing = db.get('SELECT * FROM products WHERE id = ?', [row.id]);
            if (!existing) throw new Error(`لا يوجد صنف بالمعرف ${row.id}`);
          } else if (row.barcode) {
            existing = db.get('SELECT * FROM products WHERE barcode = ?', [row.barcode]);
          }
          if (!existing && row.name) {
            existing = db.get('SELECT * FROM products WHERE lower(name) = lower(?)', [row.name]);
          }
          if (!existing && !row.name) throw new Error('اسم الصنف مطلوب');

          if (row.barcode) {
            const dup = db.get('SELECT id FROM products WHERE barcode = ? AND id <> ?', [row.barcode, existing?.id || 0]);
            if (dup) throw new Error(`الباركود ${row.barcode} مستخدم لصنف آخر`);
          }

          const payload = {};
          for (const key of writable) {
            if (row[key] !== undefined && row[key] !== null) payload[key] = row[key];
          }

          if (existing) {
            if (body.mode === 'insert') { result.skipped += 1; continue; }
            if (!Object.keys(payload).length) { result.skipped += 1; continue; }
            if (!body.dry_run) {
              db.update('products', { ...parse(schema.partial(), payload), updated_at: nowStamp() }, 'id = ?', [existing.id]);
            }
            result.updated += 1;
          } else {
            const data = parse(schema, payload);
            const opening = Number(row.opening_qty || 0);
            if (!body.dry_run) {
              const { lastInsertRowid } = db.insert('products', data);
              if (opening > 0) {
                const batchId = addBatch({
                  productId: lastInsertRowid,
                  batchNo: row.opening_batch_no || 'OPENING',
                  expiryDate: row.opening_expiry || null,
                  qty: opening,
                  costPrice: data.purchase_price,
                  salePrice: data.sale_price,
                });
                recordMovement({
                  productId: lastInsertRowid, batchId, type: 'adjust_in', qty: opening,
                  unitCost: data.purchase_price, refType: 'import', note: 'رصيد افتتاحي (استيراد Excel)',
                  userId: req.user.id,
                });
              }
            }
            if (opening > 0) result.opening_units += opening;
            result.created += 1;
          }
        } catch (err) {
          result.errors.push({ row: row.__row, name: label, message: err.message || 'خطأ غير معروف' });
          result.skipped += 1;
        }
      }
    };

    if (body.dry_run) run();
    else db.tx(run);

    if (!body.dry_run) {
      logActivity(
        req.user.id, 'import', 'products', null,
        `Excel: ${result.created} جديد، ${result.updated} محدّث، ${result.skipped} متجاهل`,
      );
    }
    res.json({ ok: true, dry_run: body.dry_run, ...result });
  }),
);

router.get(
  '/:id',
  wrap((req, res) => {
    const product = db.get(`SELECT ${STOCK_SELECT} FROM products p ${STOCK_JOIN} WHERE p.id = ?`, [req.params.id]);
    if (!product) throw notFound('الصنف غير موجود');
    const batches = db.all(
      'SELECT b.*, s.name AS supplier_name FROM batches b LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.product_id = ? ORDER BY (qty_available > 0) DESC, expiry_date',
      [req.params.id],
    );
    const movements = db.all(
      `SELECT m.*, u.full_name AS user_name, b.batch_no
       FROM stock_movements m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN batches b ON b.id = m.batch_id
       WHERE m.product_id = ? ORDER BY m.id DESC LIMIT 100`,
      [req.params.id],
    );
    res.json({ data: product, batches, movements });
  }),
);

router.post(
  '/',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = parse(schema, req.body);
    if (data.barcode) {
      const dup = db.get('SELECT id FROM products WHERE barcode = ?', [data.barcode]);
      if (dup) throw new HttpError(409, 'الباركود مستخدم لصنف آخر');
    }
    const { lastInsertRowid } = db.insert('products', data);

    // رصيد افتتاحي اختياري
    const opening = Number(req.body.opening_qty || 0);
    if (opening > 0) {
      const batchId = addBatch({
        productId: lastInsertRowid,
        batchNo: req.body.opening_batch_no || 'OPENING',
        expiryDate: req.body.opening_expiry || null,
        qty: opening,
        costPrice: data.purchase_price,
        salePrice: data.sale_price,
      });
      recordMovement({
        productId: lastInsertRowid, batchId, type: 'adjust_in', qty: opening,
        unitCost: data.purchase_price, refType: 'opening', note: 'رصيد افتتاحي', userId: req.user.id,
      });
    }

    logActivity(req.user.id, 'create', 'products', lastInsertRowid, data.name);
    res.status(201).json({ id: lastInsertRowid });
  }),
);

/** إضافة صنف للمخزون انطلاقاً من دليل الأدوية */
router.post(
  '/from-catalog/:catalogId',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const drug = db.get('SELECT * FROM drug_catalog WHERE id = ?', [req.params.catalogId]);
    if (!drug) throw notFound('الدواء غير موجود في الدليل');
    const existing = db.get('SELECT id FROM products WHERE catalog_id = ?', [drug.id]);
    if (existing) throw new HttpError(409, 'هذا الدواء مضاف بالفعل إلى المخزون');

    const data = parse(schema, {
      catalog_id: drug.id,
      name: drug.trade_name,
      generic_name: drug.generic_name,
      form: drug.form,
      strength: drug.strength,
      unit: drug.unit || 'علبة',
      category: drug.category,
      manufacturer: drug.manufacturer,
      barcode: drug.barcode,
      purchase_price: drug.default_purchase_price,
      sale_price: drug.default_sale_price,
      requires_prescription: drug.requires_prescription,
      ...req.body,
    });
    const { lastInsertRowid } = db.insert('products', data);

    // رصيد افتتاحي اختياري
    const opening = Number(req.body.opening_qty || 0);
    if (opening > 0) {
      const batchId = addBatch({
        productId: lastInsertRowid,
        batchNo: req.body.opening_batch_no || 'OPENING',
        expiryDate: req.body.opening_expiry || null,
        qty: opening,
        costPrice: data.purchase_price,
        salePrice: data.sale_price,
      });
      recordMovement({
        productId: lastInsertRowid, batchId, type: 'adjust_in', qty: opening,
        unitCost: data.purchase_price, refType: 'opening', note: 'رصيد افتتاحي', userId: req.user.id,
      });
    }

    logActivity(req.user.id, 'create', 'products', lastInsertRowid, `${data.name} (من الدليل)`);
    res.status(201).json({ id: lastInsertRowid });
  }),
);

router.put(
  '/:id',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT id FROM products WHERE id = ?', [id])) throw notFound('الصنف غير موجود');
    const data = parse(schema.partial(), req.body);
    db.update('products', { ...data, updated_at: nowStamp() }, 'id = ?', [id]);
    logActivity(req.user.id, 'update', 'products', id, data.name);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const hasSales = db.value('SELECT COUNT(*) FROM sale_items WHERE product_id = ?', [id]);
    const hasPurchases = db.value('SELECT COUNT(*) FROM purchase_items WHERE product_id = ?', [id]);
    if (hasSales || hasPurchases) {
      db.update('products', { active: 0 }, 'id = ?', [id]);
      return res.json({ ok: true, message: 'الصنف مرتبط بحركات، تم إيقافه بدل الحذف' });
    }
    db.run('DELETE FROM products WHERE id = ?', [id]);
    logActivity(req.user.id, 'delete', 'products', id, null);
    res.json({ ok: true });
  }),
);

export default router;
