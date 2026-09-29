/**
 * المصادقة والصلاحيات
 */
import jwt from 'jsonwebtoken';
import db from './db.js';
import { HttpError } from './helpers.js';

const SECRET = process.env.JWT_SECRET || 'pharmacy-secret-key-change-me';
const EXPIRES = process.env.JWT_EXPIRES || '12h';

export const ROLES = {
  admin: 'مدير النظام',
  manager: 'مدير الصيدلية',
  pharmacist: 'صيدلي',
  cashier: 'كاشير',
};

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.full_name },
    SECRET,
    { expiresIn: EXPIRES },
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'يجب تسجيل الدخول'));
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.get('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.active) return next(new HttpError(401, 'الحساب غير مفعل أو غير موجود'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'الجلسة منتهية، يرجى تسجيل الدخول مجدداً'));
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'يجب تسجيل الدخول'));
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(new HttpError(403, 'لا تملك صلاحية لهذا الإجراء'));
  };
}

export const requireManager = requireRole('manager');
