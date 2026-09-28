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
