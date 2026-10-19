/**
 * الموردون والعملاء
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, notFound, logActivity } from '../lib/helpers.js';

const baseSchema = {
  name: z.string().min(1, 'الاسم مطلوب'),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.coerce.number().int().min(0).max(1).default(1),
};

const supplierSchema = z.object({
  ...baseSchema,
  contact: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
});

const customerSchema = z.object(baseSchema);

function buildRouter({ table, schema, statsSql, label }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    wrap((req, res) => {
      const where = ['1=1'];
      const params = [];
      if (req.query.q) {
        where.push('(t.name LIKE ? OR t.phone LIKE ?)');
        params.push(`%${req.query.q}%`, `%${req.query.q}%`);
      }
      if (req.query.active !== undefined && req.query.active !== '') {
        where.push('t.active = ?'); params.push(Number(req.query.active));
      }
      const data = db.all(
        `SELECT t.*, ${statsSql} FROM ${table} t WHERE ${where.join(' AND ')} ORDER BY t.name COLLATE NOCASE`,
        params,
      );
      res.json({ data });
    }),
  );

  router.get(
    '/:id',
    wrap((req, res) => {
      const item = db.get(`SELECT t.*, ${statsSql} FROM ${table} t WHERE t.id = ?`, [req.params.id]);
      if (!item) throw notFound(`${label} غير موجود`);
      const invoices = table === 'suppliers'
        ? db.all('SELECT id, invoice_no, date, total, paid, status FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 50', [req.params.id])
        : db.all('SELECT id, invoice_no, date, total, paid, status FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 50', [req.params.id]);
      res.json({ data: item, invoices });
    }),
  );

  router.post(
    '/',
    requireRole('manager', 'pharmacist', 'cashier'),
    wrap((req, res) => {
      const data = parse(schema, req.body);
      const { lastInsertRowid } = db.insert(table, data);
      logActivity(req.user.id, 'create', table, lastInsertRowid, data.name);
      res.status(201).json({ id: lastInsertRowid });
    }),
  );

  router.put(
    '/:id',
    requireRole('manager', 'pharmacist'),
    wrap((req, res) => {
      const id = Number(req.params.id);
      if (!db.get(`SELECT id FROM ${table} WHERE id = ?`, [id])) throw notFound(`${label} غير موجود`);
      db.update(table, parse(schema.partial(), req.body), 'id = ?', [id]);
      logActivity(req.user.id, 'update', table, id, null);
      res.json({ ok: true });
    }),
  );

  router.delete(
    '/:id',
    requireRole('manager'),
    wrap((req, res) => {
      const id = Number(req.params.id);
      const used = table === 'suppliers'
        ? db.value('SELECT COUNT(*) FROM purchases WHERE supplier_id = ?', [id])
        : db.value('SELECT COUNT(*) FROM sales WHERE customer_id = ?', [id]);
      if (used) {
        db.update(table, { active: 0 }, 'id = ?', [id]);
        return res.json({ ok: true, message: `${label} مرتبط بفواتير، تم إيقافه بدل الحذف` });
      }
      db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      logActivity(req.user.id, 'delete', table, id, null);
      res.json({ ok: true });
    }),
  );

  return router;
}

export const suppliersRouter = buildRouter({
  table: 'suppliers',
  schema: supplierSchema,
  label: 'المورد',
  statsSql: `
    (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = t.id AND pu.status = 'posted') AS invoices_count,
    (SELECT COALESCE(SUM(pu.total),0) FROM purchases pu WHERE pu.supplier_id = t.id AND pu.status = 'posted') AS total_purchases,
    (SELECT COALESCE(SUM(pu.total - pu.paid),0) FROM purchases pu WHERE pu.supplier_id = t.id AND pu.status = 'posted') AS balance
  `,
});

export const customersRouter = buildRouter({
  table: 'customers',
  schema: customerSchema,
  label: 'العميل',
  statsSql: `
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = t.id AND s.status = 'completed') AS invoices_count,
    (SELECT COALESCE(SUM(s.total),0) FROM sales s WHERE s.customer_id = t.id AND s.status = 'completed') AS total_sales,
    (SELECT COALESCE(SUM(s.total - s.paid),0) FROM sales s WHERE s.customer_id = t.id AND s.status = 'completed') AS balance
  `,
});
