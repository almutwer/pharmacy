/**
 * دليل الأدوية (مرجع الأدوية)
 * - لا يظهر ضمن المخزون ولا يملك أرصدة
 * - يُستخدم فقط كمرجع سريع لإدخال الأدوية إلى المخزون/المشتريات
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, notFound, nowStamp, logActivity, HttpError } from '../lib/helpers.js';
import { createWorkbook, addSheet, addGuideSheet, sendWorkbook, readSheetRows, decodeUpload } from '../lib/excel.js';
import { CATALOG_COLUMNS, exportColumns, templateColumns, writableColumns } from '../lib/io-columns.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  trade_name: z.string().min(1, 'الاسم التجاري مطلوب'),
  generic_name: z.string().optional().nullable(),
  form: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  atc_code: z.string().optional().nullable(),
  default_purchase_price: z.coerce.number().min(0).default(0),
  default_sale_price: z.coerce.number().min(0).default(0),
  requires_prescription: z.coerce.number().int().min(0).max(1).default(0),
  storage_conditions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

/** قوائم الفلاتر */
router.get(
  '/meta',
  wrap((req, res) => {
    res.json({
      categories: db.all("SELECT DISTINCT category AS v FROM drug_catalog WHERE category IS NOT NULL AND category <> '' ORDER BY v").map((r) => r.v),
      forms: db.all("SELECT DISTINCT form AS v FROM drug_catalog WHERE form IS NOT NULL AND form <> '' ORDER BY v").map((r) => r.v),
      manufacturers: db.all("SELECT DISTINCT manufacturer AS v FROM drug_catalog WHERE manufacturer IS NOT NULL AND manufacturer <> '' ORDER BY v").map((r) => r.v),
      total: db.value('SELECT COUNT(*) FROM drug_catalog'),
      linked: db.value('SELECT COUNT(DISTINCT catalog_id) FROM products WHERE catalog_id IS NOT NULL'),
    });
  }),
);

router.get(
  '/',
  wrap((req, res) => {
    const { q, category, form, manufacturer, only_unlinked } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const where = ['1=1'];
    const params = [];

    if (q) {
      where.push('(c.trade_name LIKE ? OR c.generic_name LIKE ? OR c.barcode LIKE ? OR c.manufacturer LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) { where.push('c.category = ?'); params.push(category); }
    if (form) { where.push('c.form = ?'); params.push(form); }
    if (manufacturer) { where.push('c.manufacturer = ?'); params.push(manufacturer); }
    if (req.query.active !== undefined && req.query.active !== '') {
      where.push('c.active = ?'); params.push(Number(req.query.active));
    }
    if (only_unlinked === '1') {
      where.push('NOT EXISTS (SELECT 1 FROM products p WHERE p.catalog_id = c.id)');
    }

    const whereSql = where.join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM drug_catalog c WHERE ${whereSql}`, params);
    const data = db.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.catalog_id = c.id) AS in_inventory
       FROM drug_catalog c
       WHERE ${whereSql}
       ORDER BY c.trade_name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  }),
);

/* ==================== تصدير / استيراد Excel ==================== */

/** تصدير الدليل كملف Excel (يحترم الفلاتر الحالية) */
router.get(
  '/export',
  wrap(async (req, res) => {
    const { q, category, form, manufacturer } = req.query;
    const where = ['1=1'];
    const params = [];
    if (q) {
      where.push('(c.trade_name LIKE ? OR c.generic_name LIKE ? OR c.barcode LIKE ? OR c.manufacturer LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) { where.push('c.category = ?'); params.push(category); }
    if (form) { where.push('c.form = ?'); params.push(form); }
    if (manufacturer) { where.push('c.manufacturer = ?'); params.push(manufacturer); }
    if (req.query.active !== undefined && req.query.active !== '') {
      where.push('c.active = ?'); params.push(Number(req.query.active));
    }

    const rows = db.all(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.catalog_id = c.id) AS in_inventory
       FROM drug_catalog c WHERE ${where.join(' AND ')} ORDER BY c.trade_name COLLATE NOCASE`,
      params,
    );

    const wb = createWorkbook();
    addSheet(wb, {
      name: 'دليل الأدوية',
      title: 'دليل الأدوية المرجعي',
      note: `عدد الأدوية: ${rows.length} — تم التصدير في ${nowStamp()}`,
      columns: exportColumns(CATALOG_COLUMNS),
      rows,
    });
    logActivity(req.user.id, 'export', 'drug_catalog', null, `تصدير ${rows.length} دواء إلى Excel`);
    await sendWorkbook(res, wb, `دليل-الأدوية-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }),
);

/** قالب Excel فارغ للاستيراد */
router.get(
  '/template',
  wrap(async (req, res) => {
    const cols = templateColumns(CATALOG_COLUMNS);
    const wb = createWorkbook();
    addSheet(wb, {
      name: 'دليل الأدوية',
      columns: cols,
      rows: [
        {
          trade_name: 'سيتال', generic_name: 'باراسيتامول', form: 'أقراص', strength: '500 مجم',
          unit: 'علبة', category: 'مسكنات وخافضات الحرارة', manufacturer: 'EIPICO', country: 'مصر',
          default_purchase_price: 5, default_sale_price: 9, requires_prescription: 0, active: 1,
        },
      ],
    });
    addGuideSheet(wb, {
      columns: cols,
      title: 'تعليمات استيراد دليل الأدوية',
      lines: [
        '١) اكتب بيانات الأدوية في ورقة «دليل الأدوية» تحت العناوين الملوّنة مباشرة، ولا تغيّر أسماء الأعمدة.',
        '٢) احذف صف المثال قبل الرفع.',
        '٣) عمود «المعرف» يُترك فارغاً للأدوية الجديدة. إن وضعت رقم معرف موجود سيتم تحديث بيانات ذلك الدواء.',
        '٤) إن لم تضع معرفاً وتطابق «الاسم التجاري + التركيز» مع دواء موجود، سيُحدَّث تلقائياً (أو يُتجاهل حسب الخيار الذي تختاره عند الرفع).',
        '٥) الأعمدة المنطقية تقبل: نعم / لا.',
        '٦) يمكنك أيضاً رفع ملف CSV بنفس العناوين.',
      ],
    });
    await sendWorkbook(res, wb, 'قالب-دليل-الأدوية.xlsx');
  }),
);

/** استيراد الدليل من ملف Excel/CSV */
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
    const { rows, unknown, matched } = await readSheetRows(buffer, CATALOG_COLUMNS, body.filename);
    if (!rows.length) throw new HttpError(400, 'لا توجد صفوف بيانات في الملف');
    if (rows.length > 5000) throw new HttpError(400, 'الحد الأقصى 5000 صف في الملف الواحد');

    const writable = writableColumns(CATALOG_COLUMNS).map((c) => c.key);
    const result = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], matched, unknown };

    const run = () => {
      for (const row of rows) {
        const label = row.trade_name || `صف ${row.__row}`;
        try {
          let existing = null;
          if (row.id) {
            existing = db.get('SELECT * FROM drug_catalog WHERE id = ?', [row.id]);
            if (!existing) throw new Error(`لا يوجد دواء بالمعرف ${row.id}`);
          } else if (row.trade_name) {
            existing = db.get(
              "SELECT * FROM drug_catalog WHERE lower(trade_name) = lower(?) AND IFNULL(strength,'') = IFNULL(?,'')",
              [row.trade_name, row.strength || ''],
            );
          }

          if (!existing && !row.trade_name) throw new Error('الاسم التجاري مطلوب');

          if (row.barcode) {
            const dup = db.get('SELECT id FROM drug_catalog WHERE barcode = ? AND id <> ?', [row.barcode, existing?.id || 0]);
            if (dup) throw new Error(`الباركود ${row.barcode} مستخدم لدواء آخر`);
          }

          const payload = {};
          for (const key of writable) {
            if (row[key] !== undefined && row[key] !== null) payload[key] = row[key];
          }

          if (existing) {
            if (body.mode === 'insert') { result.skipped += 1; continue; }
            if (!Object.keys(payload).length) { result.skipped += 1; continue; }
            if (!body.dry_run) {
              db.update('drug_catalog', { ...parse(schema.partial(), payload), updated_at: nowStamp() }, 'id = ?', [existing.id]);
            }
            result.updated += 1;
          } else {
            const data = parse(schema, payload);
            if (!body.dry_run) db.insert('drug_catalog', data);
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
        req.user.id, 'import', 'drug_catalog', null,
        `Excel: ${result.created} جديد، ${result.updated} محدّث، ${result.skipped} متجاهل`,
      );
    }
    res.json({ ok: true, dry_run: body.dry_run, ...result });
  }),
);

router.get(
  '/:id',
  wrap((req, res) => {
    const item = db.get('SELECT * FROM drug_catalog WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('الدواء غير موجود في الدليل');
    res.json({ data: item });
  }),
);

router.post(
  '/',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = parse(schema, req.body);
    const { lastInsertRowid } = db.insert('drug_catalog', data);
    logActivity(req.user.id, 'create', 'drug_catalog', lastInsertRowid, data.trade_name);
    res.status(201).json({ id: lastInsertRowid });
  }),
);

router.put(
  '/:id',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const item = db.get('SELECT id FROM drug_catalog WHERE id = ?', [id]);
    if (!item) throw notFound('الدواء غير موجود في الدليل');
    const data = parse(schema.partial(), req.body);
    db.update('drug_catalog', { ...data, updated_at: nowStamp() }, 'id = ?', [id]);
    logActivity(req.user.id, 'update', 'drug_catalog', id, data.trade_name);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    db.run('DELETE FROM drug_catalog WHERE id = ?', [id]);
    logActivity(req.user.id, 'delete', 'drug_catalog', id, null);
    res.json({ ok: true });
  }),
);

/** استيراد جماعي للدليل */
router.post(
  '/import',
  requireRole('manager'),
  wrap((req, res) => {
    const body = parse(z.object({ items: z.array(schema.partial({ trade_name: true })).min(1) }), req.body);
    let inserted = 0;
    let skipped = 0;
    db.tx(() => {
      for (const raw of body.items) {
        if (!raw.trade_name) { skipped++; continue; }
        const dup = db.get(
          'SELECT id FROM drug_catalog WHERE lower(trade_name) = lower(?) AND IFNULL(strength,\'\') = IFNULL(?,\'\')',
          [raw.trade_name, raw.strength || ''],
        );
        if (dup) { skipped++; continue; }
        db.insert('drug_catalog', parse(schema, raw));
        inserted++;
      }
    });
    logActivity(req.user.id, 'import', 'drug_catalog', null, `تم استيراد ${inserted} دواء`);
    res.json({ ok: true, inserted, skipped });
  }),
);

export default router;
