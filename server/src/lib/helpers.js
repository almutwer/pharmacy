/**
 * أدوات مساعدة عامة
 */
import db from './db.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg);
export const forbidden = (msg = 'لا تملك صلاحية لهذا الإجراء') => new HttpError(403, msg);

/** تغليف المعالجات غير المتزامنة */
export const wrap = (fn) => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (err) {
    next(err);
  }
};

/** التحقق من المدخلات باستخدام zod */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw new HttpError(422, 'بيانات غير صحيحة', details);
  }
  return result.data;
}

/** قراءة إعداد */
export function getSetting(key, fallback = null) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export function getSettingNumber(key, fallback = 0) {
  const v = getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getAllSettings() {
  const rows = db.all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** توليد رقم مستند تسلسلي: PREFIX-YYYYMM-0001 */
export function nextDocNumber(table, column, prefix) {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const like = `${prefix}-${ym}-%`;
  const last = db.value(
    `SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
    [like],
  );
  let seq = 1;
  if (last) {
    const parts = String(last).split('-');
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  return `${prefix}-${ym}-${String(seq).padStart(4, '0')}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

/** تسجيل نشاط */
export function logActivity(userId, action, entity, entityId, details) {
  try {
    db.insert('activity_log', {
      user_id: userId || null,
      action,
      entity: entity || null,
      entity_id: entityId || null,
      details: typeof details === 'string' ? details : details ? JSON.stringify(details) : null,
    });
  } catch {
    /* تجاهل أخطاء السجل */
  }
}

/** بناء شرط الفترة الزمنية */
export function dateRange(query, column = 'date') {
  const clauses = [];
  const params = [];
  if (query.from) {
    clauses.push(`date(${column}) >= date(?)`);
    params.push(query.from);
  }
  if (query.to) {
    clauses.push(`date(${column}) <= date(?)`);
    params.push(query.to);
  }
  return { clauses, params };
}
