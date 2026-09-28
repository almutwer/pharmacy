/**
 * إنشاء جداول قاعدة البيانات (Schema)
 */
import db from './db.js';
import bcrypt from 'bcryptjs';
import { DRUG_CATALOG } from './drug-catalog.js';

/** توليد باركود EAN-13 صالح (12 رقماً + رقم تحقق) */
function ean13(base) {
  const body = String(base).padStart(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + ((10 - (sum % 10)) % 10);
}

export const DEFAULT_SETTINGS = {
  pharmacy_name: 'صيدلية الشفاء',
  pharmacy_phone: '',
  pharmacy_address: '',
  pharmacy_email: '',
  tax_number: '',
  currency: 'ر.س',
  tax_rate: '0',
  tax_included: '0',
  low_stock_level: '10',
  expiry_alert_days: '90',
  invoice_footer: 'شكراً لزيارتكم — نتمنى لكم دوام الصحة والعافية',
  allow_negative_stock: '0',
};

export function migrate() {
  db.exec(`
  -- ===== المستخدمون والصلاحيات =====
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'cashier', -- admin | manager | pharmacist | cashier
    phone         TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    last_login    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- ===== الإعدادات =====
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- ===== دليل الأدوية (مرجعي فقط — لا يظهر في المخزون) =====
  CREATE TABLE IF NOT EXISTS drug_catalog (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_name            TEXT NOT NULL,
    generic_name          TEXT,
    form                  TEXT,            -- شكل الدواء: أقراص، شراب ...
    strength              TEXT,            -- التركيز
    unit                  TEXT DEFAULT 'علبة',
    category              TEXT,            -- التصنيف الدوائي
    manufacturer          TEXT,
    country               TEXT,
    barcode               TEXT,
    atc_code              TEXT,
    default_purchase_price REAL DEFAULT 0,
    default_sale_price     REAL DEFAULT 0,
    requires_prescription  INTEGER NOT NULL DEFAULT 0,
    storage_conditions     TEXT,
    notes                  TEXT,
    active                 INTEGER NOT NULL DEFAULT 1,
    created_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at             TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_catalog_trade ON drug_catalog(trade_name);
  CREATE INDEX IF NOT EXISTS idx_catalog_generic ON drug_catalog(generic_name);

  -- ===== أصناف المخزون (الأصناف التي تتعامل بها الصيدلية فعلياً) =====
  CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id     INTEGER REFERENCES drug_catalog(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    generic_name   TEXT,
    form           TEXT,
    strength       TEXT,
    unit           TEXT DEFAULT 'علبة',
    category       TEXT,
    manufacturer   TEXT,
    barcode        TEXT,
    purchase_price REAL NOT NULL DEFAULT 0,
    sale_price     REAL NOT NULL DEFAULT 0,
    reorder_level  REAL NOT NULL DEFAULT 10,
    location       TEXT,                       -- موقع الرف
    requires_prescription INTEGER NOT NULL DEFAULT 0,
    notes          TEXT,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

  -- ===== الدفعات (التشغيلات) لكل صنف =====
  CREATE TABLE IF NOT EXISTS batches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_no      TEXT,
    expiry_date   TEXT,
    qty_in        REAL NOT NULL DEFAULT 0,
    qty_available REAL NOT NULL DEFAULT 0,
    cost_price    REAL NOT NULL DEFAULT 0,
    sale_price    REAL NOT NULL DEFAULT 0,
    supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_id   INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
  CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);

  -- ===== الموردون =====
  CREATE TABLE IF NOT EXISTS suppliers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    contact    TEXT,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    tax_number TEXT,
    notes      TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- ===== العملاء =====
  CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    notes      TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- ===== المشتريات =====
  CREATE TABLE IF NOT EXISTS purchases (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no     TEXT NOT NULL UNIQUE,
    supplier_invoice TEXT,
    supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    date           TEXT NOT NULL,
    subtotal       REAL NOT NULL DEFAULT 0,
    discount       REAL NOT NULL DEFAULT 0,
    tax            REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL DEFAULT 0,
    paid           REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',   -- cash | credit | transfer | card
    status         TEXT NOT NULL DEFAULT 'posted', -- posted | cancelled
    notes          TEXT,
    user_id        INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    batch_id    INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    batch_no    TEXT,
    expiry_date TEXT,
    qty         REAL NOT NULL,
    bonus_qty   REAL NOT NULL DEFAULT 0,
    unit_cost   REAL NOT NULL,
    sale_price  REAL NOT NULL DEFAULT 0,
    discount    REAL NOT NULL DEFAULT 0,
    total       REAL NOT NULL
  );

  -- ===== المبيعات =====
  CREATE TABLE IF NOT EXISTS sales (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no     TEXT NOT NULL UNIQUE,
    customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    date           TEXT NOT NULL,
    subtotal       REAL NOT NULL DEFAULT 0,
    discount       REAL NOT NULL DEFAULT 0,
    tax            REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL DEFAULT 0,
    paid           REAL NOT NULL DEFAULT 0,
    cogs           REAL NOT NULL DEFAULT 0,   -- تكلفة البضاعة المباعة
    profit         REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    status         TEXT NOT NULL DEFAULT 'completed', -- completed | cancelled
    notes          TEXT,
    user_id        INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);

  CREATE TABLE IF NOT EXISTS sale_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id),
    batch_id     INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    product_name TEXT,
    qty          REAL NOT NULL,
    returned_qty REAL NOT NULL DEFAULT 0,
    unit_price   REAL NOT NULL,
    unit_cost    REAL NOT NULL DEFAULT 0,
    discount     REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL
  );

  -- ===== مرتجع المبيعات =====
  CREATE TABLE IF NOT EXISTS sale_returns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    return_no  TEXT NOT NULL UNIQUE,
    sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    total      REAL NOT NULL DEFAULT 0,
    cost_total REAL NOT NULL DEFAULT 0,
    reason     TEXT,
    user_id    INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sale_return_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id    INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
    product_id   INTEGER NOT NULL REFERENCES products(id),
    batch_id     INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    qty          REAL NOT NULL,
    unit_price   REAL NOT NULL,
    unit_cost    REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL
  );

  -- ===== المصروفات =====
  CREATE TABLE IF NOT EXISTS expense_categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT,
    amount         REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    reference      TEXT,
    user_id        INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

  -- ===== حركات المخزون =====
  CREATE TABLE IF NOT EXISTS stock_movements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id   INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    type       TEXT NOT NULL,  -- purchase | sale | sale_return | purchase_cancel | adjust_in | adjust_out | damage | expired
    qty        REAL NOT NULL,  -- موجب = إدخال ، سالب = إخراج
    unit_cost  REAL NOT NULL DEFAULT 0,
    ref_type   TEXT,
    ref_id     INTEGER,
    note       TEXT,
    user_id    INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_moves_product ON stock_movements(product_id);
  CREATE INDEX IF NOT EXISTS idx_moves_date ON stock_movements(date);

  -- ===== سجل النشاط =====
  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    action     TEXT NOT NULL,
    entity     TEXT,
    entity_id  INTEGER,
    details    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `);

  // الإعدادات الافتراضية
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // تصنيفات المصروفات الافتراضية
  const defaultExpenseCats = [
    'إيجار', 'رواتب', 'كهرباء وماء', 'اتصالات وإنترنت', 'صيانة',
    'نقل وتوصيل', 'تسويق وإعلان', 'مستلزمات مكتبية', 'ضرائب ورسوم', 'أخرى',
  ];
  for (const name of defaultExpenseCats) {
    db.run('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)', [name]);
  }

  // مستخدم مدير افتراضي
  const count = db.value('SELECT COUNT(*) AS c FROM users');
  if (!count) {
    db.insert('users', {
      username: 'admin',
      full_name: 'مدير النظام',
      password_hash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      active: 1,
    });
  }

  // دليل الأدوية المرجعي — يُعبّأ مرة واحدة فقط عند التثبيت الجديد
  const catalogCount = db.value('SELECT COUNT(*) AS c FROM drug_catalog');
  if (!catalogCount) {
    db.tx(() => {
      let seq = 0;
      for (const [trade, generic, form, strength, category, manufacturer, country, cost, price] of DRUG_CATALOG) {
        seq += 1;
        db.insert('drug_catalog', {
          trade_name: trade,
          generic_name: generic === '-' ? null : generic,
          form,
          strength: strength === '-' ? null : strength,
          unit: form.includes('شراب') || form.includes('نقط') ? 'زجاجة' : 'علبة',
          category,
          manufacturer,
          country,
          barcode: ean13(628000000000 + seq),
          default_purchase_price: cost,
          default_sale_price: price,
          active: 1,
        });
      }
    });
  }
}

export default migrate;
