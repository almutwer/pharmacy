import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../lib/db.js';
import { signToken, requireAuth } from '../lib/auth.js';
import { wrap, parse, HttpError, nowStamp, logActivity } from '../lib/helpers.js';

const router = Router();

/**
 * حماية بسيطة من محاولات التخمين — مهمة عند إتاحة النظام على الشبكة المحلية
 * 8 محاولات فاشلة خلال 10 دقائق ← إيقاف مؤقت 5 دقائق لنفس (المستخدم + الجهاز)
 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;
const attempts = new Map();

const attemptKey = (req, username) => `${String(username).toLowerCase()}@${req.ip || 'local'}`;

function checkThrottle(key) {
  const entry = attempts.get(key);
  if (!entry) return;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    throw new HttpError(429, `تم إيقاف المحاولات مؤقتاً بسبب تكرار كلمة مرور خاطئة. أعد المحاولة بعد ${minutes} دقيقة.`);
  }
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) attempts.delete(key);
}

function registerFailure(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS;
  attempts.set(key, entry);
}

// تنظيف دوري للذاكرة
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS && (!entry.lockedUntil || entry.lockedUntil < now)) attempts.delete(key);
  }
}, WINDOW_MS).unref?.();

router.post(
  '/login',
  wrap((req, res) => {
    const data = parse(
      z.object({ username: z.string().min(1), password: z.string().min(1) }),
      req.body,
    );
    const key = attemptKey(req, data.username);
    checkThrottle(key);

    const user = db.get('SELECT * FROM users WHERE lower(username) = lower(?)', [data.username]);
    if (!user || !bcrypt.compareSync(data.password, user.password_hash)) {
      registerFailure(key);
      throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.active) throw new HttpError(403, 'هذا الحساب موقوف، راجع مدير النظام');

    attempts.delete(key);
    db.update('users', { last_login: nowStamp() }, 'id = ?', [user.id]);
    logActivity(user.id, 'login', 'users', user.id, `تسجيل دخول من ${req.ip || 'الجهاز المحلي'}`);

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
