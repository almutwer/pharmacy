/**
 * إعدادات النظام + سجل النشاط + النسخ الاحتياطي
 */
import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, getAllSettings, logActivity, HttpError } from '../lib/helpers.js';
import { migrate } from '../lib/schema.js';
import {
  createBackup, inspectBackup, restoreBackup, wipeData, WIPE_SCOPES,
  saveBackupFile, listBackupFiles, safeBackupPath, tableLabel,
} from '../lib/backup.js';

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

/* ============================ النسخ الاحتياطي ============================ */

/** تنزيل نسخة احتياطية كاملة بصيغة JSON */
router.get(
  '/backup',
  requireRole('manager'),
  wrap((req, res) => {
    const includePasswords = req.query.passwords !== '0';
    const backup = createBackup({ includePasswords, includeLog: req.query.log === '1' });
    const filename = `pharmacy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    logActivity(req.user.id, 'backup', 'system', null, `نسخة احتياطية (${Object.values(backup.counts).reduce((a, b) => a + b, 0)} سجل)`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(JSON.stringify(backup, null, 1));
  }),
);

/** النسخ المحفوظة داخل مجلد بيانات النظام */
router.get(
  '/backups',
  requireRole('manager'),
  wrap((req, res) => res.json({ data: listBackupFiles(), dir: `${db.dir}/backups` })),
);

/** إنشاء نسخة محفوظة على الجهاز */
router.post(
  '/backups',
  requireRole('manager'),
  wrap((req, res) => {
    const file = saveBackupFile('manual');
    logActivity(req.user.id, 'backup', 'system', null, file.name);
    res.status(201).json({ ok: true, ...file, path: undefined });
  }),
);

router.get(
  '/backups/:name',
  requireRole('manager'),
  wrap((req, res) => {
    const file = safeBackupPath(req.params.name);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    fs.createReadStream(file).pipe(res);
  }),
);

router.delete(
  '/backups/:name',
  requireRole('admin'),
  wrap((req, res) => {
    fs.unlinkSync(safeBackupPath(req.params.name));
    logActivity(req.user.id, 'delete', 'backup', null, req.params.name);
    res.json({ ok: true });
  }),
);

/* ============================== الاستعادة ============================== */

/** فحص ملف نسخة احتياطية قبل استعادته */
router.post(
  '/restore/inspect',
  requireRole('admin'),
  wrap((req, res) => {
    const body = parse(z.object({ data: z.any(), name: z.string().optional() }), req.body);
    const info = inspectBackup(body.data);
    res.json({
      ok: true,
      ...info,
      labels: Object.fromEntries(info.tables.map((t) => [t, tableLabel(t)])),
    });
  }),
);

/** استعادة نسخة احتياطية (يستبدل كل البيانات الحالية) */
router.post(
  '/restore',
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = parse(z.object({
      data: z.any().optional(),
      file: z.string().optional(),
      password: z.string().min(1, 'كلمة المرور مطلوبة للتأكيد'),
    }), req.body);

    await verifyPassword(req.user.id, body.password);

    let payload = body.data;
    if (!payload && body.file) payload = JSON.parse(fs.readFileSync(safeBackupPath(body.file), 'utf8'));
    if (!payload) throw new HttpError(400, 'لم يتم إرسال ملف النسخة الاحتياطية');

    const result = restoreBackup(payload);
    migrate({ seedCatalog: false });
    logActivity(
      req.user.id, 'restore', 'system', null,
      `استعادة نسخة احتياطية — المستخدمون ${result.users_restored ? 'مستعادون' : 'كما هم'}`,
    );
    res.json(result);
  }),
);

/* ============================ مسح البيانات ============================ */

router.get(
  '/wipe/scopes',
  requireRole('admin'),
  wrap((req, res) => {
    const counts = {
      sales: db.value('SELECT COUNT(*) FROM sales'),
      purchases: db.value('SELECT COUNT(*) FROM purchases'),
      expenses: db.value('SELECT COUNT(*) FROM expenses'),
      products: db.value('SELECT COUNT(*) FROM products'),
      drug_catalog: db.value('SELECT COUNT(*) FROM drug_catalog'),
      suppliers: db.value('SELECT COUNT(*) FROM suppliers'),
      customers: db.value('SELECT COUNT(*) FROM customers'),
      batches: db.value('SELECT COUNT(*) FROM batches'),
      stock_movements: db.value('SELECT COUNT(*) FROM stock_movements'),
    };
    res.json({
      data: Object.entries(WIPE_SCOPES).map(([value, v]) => ({ value, label: v.label, description: v.description })),
      counts,
    });
  }),
);

/** مسح بيانات النظام (مع نسخة أمان تلقائية قبل التنفيذ) */
router.post(
  '/wipe',
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = parse(z.object({
      scope: z.enum(['transactions', 'inventory', 'all']),
      wipe_catalog: z.coerce.boolean().default(false),
      wipe_activity: z.coerce.boolean().default(false),
      password: z.string().min(1, 'كلمة المرور مطلوبة للتأكيد'),
      confirm: z.string(),
    }), req.body);

    if (body.confirm.trim() !== 'مسح') throw new HttpError(400, 'اكتب كلمة «مسح» في خانة التأكيد للمتابعة');
    await verifyPassword(req.user.id, body.password);

    const result = wipeData({
      scope: body.scope,
      wipeCatalog: body.wipe_catalog,
      wipeActivity: body.wipe_activity,
    });
    migrate({ seedCatalog: false });
    logActivity(req.user.id, 'wipe', 'system', null, `${result.scope_label} — ${result.total_deleted} سجل`);
    res.json(result);
  }),
);

/** التحقق من كلمة مرور المستخدم الحالي قبل أي عملية خطرة */
async function verifyPassword(userId, password) {
  const row = db.get('SELECT password_hash FROM users WHERE id = ?', [userId]);
  const ok = row && await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new HttpError(403, 'كلمة المرور غير صحيحة');
  return true;
}

export default router;
