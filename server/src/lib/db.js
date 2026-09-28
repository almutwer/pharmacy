/**
 * طبقة الوصول لقاعدة البيانات (SQLite)
 * تعتمد على node:sqlite المدمج في Node.js (DatabaseSync)
 * وتوفّر واجهة مبسطة: get / all / run / tx
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'pharmacy.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const database = new DatabaseSync(DB_FILE);
database.exec('PRAGMA journal_mode = WAL;');
database.exec('PRAGMA foreign_keys = ON;');

/** تحويل القيم إلى أنواع يقبلها SQLite */
function normalize(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function bind(params = []) {
  return params.map(normalize);
}

/** تحويل صفوف null-prototype إلى كائنات عادية */
function plain(row) {
  return row ? { ...row } : row;
}

export const db = {
  raw: database,
  file: DB_FILE,

  exec(sql) {
    database.exec(sql);
  },

  all(sql, params = []) {
    return database.prepare(sql).all(...bind(params)).map(plain);
  },

  get(sql, params = []) {
    return plain(database.prepare(sql).get(...bind(params)));
  },

  /** إرجاع قيمة عمود واحد */
  value(sql, params = []) {
    const row = db.get(sql, params);
    if (!row) return null;
    return Object.values(row)[0];
  },

  run(sql, params = []) {
    const res = database.prepare(sql).run(...bind(params));
    return {
      changes: Number(res.changes),
      lastInsertRowid: Number(res.lastInsertRowid),
    };
  },

  /** إدراج سجل من كائن */
  insert(table, data) {
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return db.run(sql, keys.map((k) => data[k]));
  },

  /** تحديث سجل من كائن */
  update(table, data, where, whereParams = []) {
    const keys = Object.keys(data);
    if (!keys.length) return { changes: 0 };
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${where}`;
    return db.run(sql, [...keys.map((k) => data[k]), ...whereParams]);
  },

  /** تنفيذ ضمن معاملة (transaction) */
  tx(fn) {
    database.exec('BEGIN');
    try {
      const result = fn();
      database.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        database.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  },
};

export default db;
