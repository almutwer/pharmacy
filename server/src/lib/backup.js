/**
 * النسخ الاحتياطي والاستعادة ومسح بيانات النظام
 * يعمل مع أي محرك SQLite (node:sqlite أو better-sqlite3) لأنه يعتمد على SQL فقط
 */
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { HttpError, nowStamp } from './helpers.js';

/** ترتيب الجداول: الأب قبل الابن (الاستعادة بهذا الترتيب، والحذف بعكسه) */
export const BACKUP_TABLES = [
  'settings',
  'users',
  'drug_catalog',
  'products',
  'suppliers',
  'customers',
  'expense_categories',
  'purchases',
  'batches',
  'purchase_items',
  'sales',
  'sale_items',
  'sale_returns',
  'sale_return_items',
  'expenses',
  'stock_movements',
];

export const BACKUP_VERSION = 2;

const TABLE_LABELS = {
  settings: 'الإعدادات',
  users: 'المستخدمون',
  drug_catalog: 'دليل الأدوية',
  products: 'أصناف المخزون',
  suppliers: 'الموردون',
  customers: 'العملاء',
  expense_categories: 'تصنيفات المصروفات',
  purchases: 'فواتير الشراء',
  batches: 'الدفعات',
  purchase_items: 'بنود الشراء',
  sales: 'فواتير البيع',
  sale_items: 'بنود البيع',
  sale_returns: 'المرتجعات',
  sale_return_items: 'بنود المرتجعات',
  expenses: 'المصروفات',
  stock_movements: 'حركات المخزون',
  activity_log: 'سجل النشاط',
};

export const tableLabel = (t) => TABLE_LABELS[t] || t;

function tableColumns(table) {
  return db.all(`PRAGMA table_info(${table})`).map((c) => c.name);
}

function tableExists(table) {
  return !!db.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [table]);
}

/* ============================ إنشاء نسخة ============================ */

/**
 * توليد كائن النسخة الاحتياطية
 * @param {object} options
 * @param {boolean} options.includePasswords تضمين كلمات المرور المشفّرة (لازمة لاستعادة الحسابات)
 * @param {boolean} options.includeLog تضمين سجل النشاط
 */
export function createBackup({ includePasswords = true, includeLog = false } = {}) {
  const tables = [...BACKUP_TABLES, ...(includeLog ? ['activity_log'] : [])];
  const backup = {
    app: 'pharmacy-system',
    version: BACKUP_VERSION,
    generated_at: new Date().toISOString(),
    generated_at_local: nowStamp(),
    engine: db.driver,
    counts: {},
    tables: {},
  };

  for (const t of tables) {
    if (!tableExists(t)) continue;
    let rows = db.all(`SELECT * FROM ${t}`);
    if (t === 'users' && !includePasswords) {
      rows = rows.map(({ password_hash, ...rest }) => rest);
    }
    backup.tables[t] = rows;
    backup.counts[t] = rows.length;
  }
  return backup;
}

/* ====================== ملفات النسخ على الجهاز ====================== */

export function backupsDir() {
  const dir = path.join(db.dir, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** حفظ نسخة احتياطية كملف داخل مجلد البيانات */
export function saveBackupFile(label = 'manual', backup = null) {
  const data = backup || createBackup();
  const name = `backup-${label}-${stamp()}.json`;
  const file = path.join(backupsDir(), name);
  fs.writeFileSync(file, JSON.stringify(data));
  pruneBackups();
  return { name, size: fs.statSync(file).size, path: file };
}

/** الإبقاء على آخر 20 نسخة تلقائية فقط */
function pruneBackups(keep = 20) {
  try {
    const files = listBackupFiles();
    files.slice(keep).forEach((f) => fs.unlinkSync(path.join(backupsDir(), f.name)));
  } catch { /* تجاهل */ }
}

export function listBackupFiles() {
  const dir = backupsDir();
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function safeBackupPath(name) {
  if (!/^[\w.\-]+\.json$/.test(name)) throw new HttpError(400, 'اسم ملف غير صالح');
  const file = path.join(backupsDir(), name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'ملف النسخة غير موجود');
  return file;
}

/* ============================= الاستعادة ============================= */

/** فحص ملف النسخة قبل الاستعادة وإرجاع ملخص */
export function inspectBackup(backup) {
  if (!backup || typeof backup !== 'object' || !backup.tables || typeof backup.tables !== 'object') {
    throw new HttpError(400, 'الملف ليس نسخة احتياطية صالحة لهذا النظام');
  }
  const known = Object.keys(backup.tables).filter((t) => BACKUP_TABLES.includes(t) || t === 'activity_log');
  if (!known.length) throw new HttpError(400, 'النسخة الاحتياطية لا تحتوي على أي جدول معروف');

  const users = backup.tables.users || [];
  const withPasswords = users.filter((u) => u && u.password_hash).length;
  const admins = users.filter((u) => u && u.role === 'admin' && u.active !== 0).length;

  const counts = {};
  for (const t of known) counts[t] = (backup.tables[t] || []).length;

  return {
    version: backup.version || 1,
    generated_at: backup.generated_at || null,
    engine: backup.engine || null,
    tables: known,
    counts,
    total_rows: Object.values(counts).reduce((a, b) => a + b, 0),
    users_count: users.length,
    users_with_passwords: withPasswords,
    admins,
    can_restore_users: users.length > 0 && withPasswords === users.length && admins > 0,
    warnings: [
      ...(users.length && withPasswords < users.length
        ? ['النسخة لا تحتوي على كلمات المرور — سيتم الإبقاء على المستخدمين الحاليين كما هم.'] : []),
      ...(!users.length ? ['النسخة لا تحتوي على مستخدمين — سيتم الإبقاء على المستخدمين الحاليين.'] : []),
      ...(users.length && !admins ? ['لا يوجد مدير نظام نشط داخل النسخة — سيتم الإبقاء على المستخدمين الحاليين لتفادي فقدان الدخول.'] : []),
    ],
  };
}

/**
 * استعادة نسخة احتياطية (استبدال كامل للبيانات)
 * تُنشئ نسخة أمان تلقائية قبل التنفيذ
 */
export function restoreBackup(backup) {
  const info = inspectBackup(backup);
  const safety = saveBackupFile('before-restore');

  const restoreUsers = info.can_restore_users;
  const targets = BACKUP_TABLES.filter((t) => tableExists(t) && (t !== 'users' || restoreUsers));

  db.raw.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      // حذف البيانات الحالية (عكس ترتيب الاعتمادية)
      [...targets].reverse().forEach((t) => db.run(`DELETE FROM ${t}`));
      if (tableExists('activity_log') && backup.tables.activity_log) db.run('DELETE FROM activity_log');

      // إعادة الإدراج
      for (const t of targets) {
        const rows = backup.tables[t];
        if (!Array.isArray(rows) || !rows.length) continue;
        const cols = tableColumns(t);
        for (const row of rows) {
          const data = {};
          for (const c of cols) if (row[c] !== undefined) data[c] = row[c];
          if (Object.keys(data).length) db.insert(t, data);
        }
      }
      if (Array.isArray(backup.tables.activity_log) && tableExists('activity_log')) {
        const cols = tableColumns('activity_log');
        for (const row of backup.tables.activity_log) {
          const data = {};
          for (const c of cols) if (row[c] !== undefined) data[c] = row[c];
          if (Object.keys(data).length) db.insert('activity_log', data);
        }
      }
    });
  } finally {
    db.raw.exec('PRAGMA foreign_keys = ON');
  }

  const problems = db.all('PRAGMA foreign_key_check');
  const restored = {};
  for (const t of targets) restored[t] = db.value(`SELECT COUNT(*) FROM ${t}`);

  return {
    ok: true,
    users_restored: restoreUsers,
    safety_backup: safety.name,
    restored,
    integrity_issues: problems.length,
    warnings: info.warnings,
  };
}

/* ============================ مسح البيانات ============================ */

const TX_TABLES = [
  'sale_return_items', 'sale_returns', 'sale_items', 'sales',
  'purchase_items', 'purchases', 'expenses', 'stock_movements', 'batches',
];

export const WIPE_SCOPES = {
  transactions: {
    label: 'الحركات فقط',
    description: 'حذف المبيعات والمشتريات والمصروفات وحركات المخزون والدفعات (تصبح أرصدة الأصناف صفراً) مع الإبقاء على الأصناف والدليل والموردين والعملاء.',
    tables: TX_TABLES,
  },
  inventory: {
    label: 'الحركات وأصناف المخزون',
    description: 'كل ما سبق بالإضافة إلى حذف أصناف المخزون نفسها. يبقى دليل الأدوية والموردون والعملاء.',
    tables: [...TX_TABLES, 'products'],
  },
  all: {
    label: 'كل بيانات العمل',
    description: 'حذف كل البيانات التشغيلية (حركات، أصناف، موردون، عملاء) مع الإبقاء على المستخدمين والإعدادات.',
    tables: [...TX_TABLES, 'products', 'suppliers', 'customers'],
  },
};

/**
 * مسح بيانات النظام حسب النطاق المحدد
 * @param {object} options
 * @param {'transactions'|'inventory'|'all'} options.scope
 * @param {boolean} options.wipeCatalog حذف دليل الأدوية أيضاً
 * @param {boolean} options.wipeActivity حذف سجل النشاط
 */
export function wipeData({ scope = 'transactions', wipeCatalog = false, wipeActivity = false } = {}) {
  const config = WIPE_SCOPES[scope];
  if (!config) throw new HttpError(400, 'نطاق المسح غير معروف');

  const safety = saveBackupFile(`before-wipe-${scope}`);

  const tables = [...config.tables];
  if (wipeCatalog && scope !== 'transactions') tables.push('drug_catalog');
  if (wipeActivity) tables.push('activity_log');

  const before = {};
  tables.forEach((t) => { if (tableExists(t)) before[t] = db.value(`SELECT COUNT(*) FROM ${t}`); });

  db.raw.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      tables.forEach((t) => { if (tableExists(t)) db.run(`DELETE FROM ${t}`); });
      // تصفير العدادات التسلسلية للجداول المحذوفة
      try {
        tables.forEach((t) => db.run('DELETE FROM sqlite_sequence WHERE name = ?', [t]));
      } catch { /* الجدول غير موجود */ }
    });
  } finally {
    db.raw.exec('PRAGMA foreign_keys = ON');
  }

  try { db.raw.exec('VACUUM'); } catch { /* تجاهل */ }

  return {
    ok: true,
    scope,
    scope_label: config.label,
    safety_backup: safety.name,
    deleted: before,
    total_deleted: Object.values(before).reduce((a, b) => a + b, 0),
  };
}

export default { createBackup, restoreBackup, wipeData, saveBackupFile, listBackupFiles };
