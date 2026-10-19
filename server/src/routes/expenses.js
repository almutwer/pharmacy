/**
 * المصروفات التشغيلية
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, notFound, today, logActivity, round } from '../lib/helpers.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  date: z.string().optional(),
  category: z.string().min(1, 'التصنيف مطلوب'),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  payment_method: z.enum(['cash', 'card', 'transfer', 'credit']).default('cash'),
  reference: z.string().optional().nullable(),
});

router.get(
  '/categories',
  wrap((req, res) => {
    res.json({ data: db.all('SELECT * FROM expense_categories ORDER BY name') });
  }),
);

router.post(
  '/categories',
  requireRole('manager'),
  wrap((req, res) => {
    const { name } = parse(z.object({ name: z.string().min(1) }), req.body);
    db.run('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)', [name]);
    res.status(201).json({ ok: true });
  }),
);

router.delete(
  '/categories/:id',
  requireRole('manager'),
  wrap((req, res) => {
    db.run('DELETE FROM expense_categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }),
);

router.get(
  '/',
  wrap((req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const where = ['1=1'];
    const params = [];
    if (req.query.q) { where.push('(e.description LIKE ? OR e.reference LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.category) { where.push('e.category = ?'); params.push(req.query.category); }
    if (req.query.from) { where.push('date(e.date) >= date(?)'); params.push(req.query.from); }
    if (req.query.to) { where.push('date(e.date) <= date(?)'); params.push(req.query.to); }

    const whereSql = where.join(' AND ');
    const total = db.value(`SELECT COUNT(*) FROM expenses e WHERE ${whereSql}`, params);
    const sum = db.value(`SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE ${whereSql}`, params);
    const data = db.all(`
      SELECT e.*, u.full_name AS user_name FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${whereSql} ORDER BY date(e.date) DESC, e.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]);
    const byCategory = db.all(`
      SELECT e.category, COALESCE(SUM(e.amount),0) AS amount, COUNT(*) AS count
      FROM expenses e WHERE ${whereSql} GROUP BY e.category ORDER BY amount DESC`, params);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1, sum: round(sum), byCategory });
  }),
);

router.post(
  '/',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = parse(schema, req.body);
    const { lastInsertRowid } = db.insert('expenses', {
      ...data, date: data.date || today(), user_id: req.user.id,
    });
    db.run('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)', [data.category]);
    logActivity(req.user.id, 'create', 'expenses', lastInsertRowid, `${data.category} ${data.amount}`);
    res.status(201).json({ id: lastInsertRowid });
  }),
);

router.put(
  '/:id',
  requireRole('manager'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT id FROM expenses WHERE id = ?', [id])) throw notFound('المصروف غير موجود');
    db.update('expenses', parse(schema.partial(), req.body), 'id = ?', [id]);
    logActivity(req.user.id, 'update', 'expenses', id, null);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requireRole('manager'),
  wrap((req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    logActivity(req.user.id, 'delete', 'expenses', Number(req.params.id), null);
    res.json({ ok: true });
  }),
);

export default router;
