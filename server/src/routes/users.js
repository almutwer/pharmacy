import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, parse, HttpError, notFound, logActivity } from '../lib/helpers.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const userSchema = z.object({
  username: z.string().min(3, 'اسم المستخدم 3 أحرف على الأقل'),
  full_name: z.string().min(2, 'الاسم مطلوب'),
  password: z.string().min(4, 'كلمة المرور 4 أحرف على الأقل').optional(),
  role: z.enum(['admin', 'manager', 'pharmacist', 'cashier']),
  phone: z.string().optional().nullable(),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

router.get(
  '/',
  wrap((req, res) => {
    res.json({
      data: db.all(
        'SELECT id, username, full_name, role, phone, active, last_login, created_at FROM users ORDER BY id',
      ),
    });
  }),
);

router.post(
  '/',
  wrap((req, res) => {
    const data = parse(userSchema, req.body);
    if (!data.password) throw new HttpError(422, 'كلمة المرور مطلوبة');
    const exists = db.get('SELECT id FROM users WHERE lower(username) = lower(?)', [data.username]);
    if (exists) throw new HttpError(409, 'اسم المستخدم مستخدم مسبقاً');
    const { lastInsertRowid } = db.insert('users', {
      username: data.username,
      full_name: data.full_name,
      password_hash: bcrypt.hashSync(data.password, 10),
      role: data.role,
      phone: data.phone || null,
      active: data.active,
    });
    logActivity(req.user.id, 'create', 'users', lastInsertRowid, data.username);
    res.status(201).json({ id: lastInsertRowid });
  }),
);

router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('المستخدم غير موجود');
    const data = parse(userSchema.partial(), req.body);

    const payload = {};
    for (const key of ['username', 'full_name', 'role', 'phone', 'active']) {
      if (data[key] !== undefined) payload[key] = data[key];
    }
    if (data.password) payload.password_hash = bcrypt.hashSync(data.password, 10);
    if (id === req.user.id && payload.active === 0) throw new HttpError(400, 'لا يمكنك إيقاف حسابك الخاص');

    db.update('users', payload, 'id = ?', [id]);
    logActivity(req.user.id, 'update', 'users', id, payload.username || user.username);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'لا يمكنك حذف حسابك الخاص');
    const used = db.value('SELECT COUNT(*) FROM sales WHERE user_id = ?', [id]);
    if (used) {
      db.update('users', { active: 0 }, 'id = ?', [id]);
      return res.json({ ok: true, message: 'المستخدم مرتبط بفواتير، تم إيقافه بدل الحذف' });
    }
    db.run('DELETE FROM users WHERE id = ?', [id]);
    logActivity(req.user.id, 'delete', 'users', id, null);
    res.json({ ok: true });
  }),
);

export default router;
