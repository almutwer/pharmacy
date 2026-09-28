/**
 * إعدادات النظام + سجل النشاط + النسخ الاحتياطي
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, getAllSettings, logActivity } from '../lib/helpers.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  wrap((req, res) => res.json({ data: getAllSettings() })),
);

router.put(
  '/',
  requireRole('manager'),
  wrap((req, res) => {
    const data = parse(z.record(z.string(), z.union([z.string(), z.number()])), req.body);
    db.tx(() => {
      for (const [key, value] of Object.entries(data)) {
        db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
      }
    });
    logActivity(req.user.id, 'update', 'settings', null, Object.keys(data).join(', '));
    res.json({ ok: true, data: getAllSettings() });
  }),
);

router.get(
  '/activity',
  requireRole('manager'),
  wrap((req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const data = db.all(`
      SELECT a.*, u.full_name AS user_name FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`, [limit]);
    res.json({ data });
  }),
);

/** نسخة احتياطية بصيغة JSON */
router.get(
  '/backup',
  requireRole('manager'),
  wrap((req, res) => {
    const tables = [
      'settings', 'users', 'drug_catalog', 'products', 'batches', 'suppliers', 'customers',
      'purchases', 'purchase_items', 'sales', 'sale_items', 'sale_returns', 'sale_return_items',
      'expense_categories', 'expenses', 'stock_movements',
    ];
    const backup = { generated_at: new Date().toISOString(), version: 1, tables: {} };
    for (const t of tables) {
      backup.tables[t] = db.all(`SELECT * FROM ${t}`);
      if (t === 'users') backup.tables[t] = backup.tables[t].map(({ password_hash, ...u }) => u);
    }
    res.setHeader('Content-Disposition', `attachment; filename="pharmacy-backup-${Date.now()}.json"`);
    res.json(backup);
  }),
);

export default router;
