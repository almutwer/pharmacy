import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../lib/db.js';
import { signToken, requireAuth } from '../lib/auth.js';
import { wrap, parse, HttpError, nowStamp, logActivity } from '../lib/helpers.js';

const router = Router();

router.post(
  '/login',
  wrap((req, res) => {
    const data = parse(
      z.object({ username: z.string().min(1), password: z.string().min(1) }),
      req.body,
    );
    const user = db.get('SELECT * FROM users WHERE lower(username) = lower(?)', [data.username]);
    if (!user || !bcrypt.compareSync(data.password, user.password_hash)) {
      throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.active) throw new HttpError(403, 'هذا الحساب موقوف، راجع مدير النظام');

    db.update('users', { last_login: nowStamp() }, 'id = ?', [user.id]);
    logActivity(user.id, 'login', 'users', user.id, 'تسجيل دخول');

    res.json({
      token: signToken(user),
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  wrap((req, res) => res.json({ user: req.user })),
);

router.post(
  '/change-password',
  requireAuth,
  wrap((req, res) => {
    const data = parse(
      z.object({ current_password: z.string().min(1), new_password: z.string().min(4) }),
      req.body,
    );
    const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(data.current_password, user.password_hash)) {
      throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
    }
    db.update('users', { password_hash: bcrypt.hashSync(data.new_password, 10) }, 'id = ?', [user.id]);
    logActivity(user.id, 'change_password', 'users', user.id, 'تغيير كلمة المرور');
    res.json({ ok: true, message: 'تم تغيير كلمة المرور بنجاح' });
  }),
);

export default router;
