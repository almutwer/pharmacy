-- Local Pharmacy Management System - SQLite Schema
-- Architecture rule: medicines_catalog is a global read-only catalog; pharmacy_inventory is actual local stock.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pharmacist' CHECK (role IN ('admin', 'pharmacist', 'cashier')),
    pin_hash TEXT,
    password_hash TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (length(trim(username)) > 0),
    CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE IF NOT EXISTS app_context (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_username TEXT NOT NULL DEFAULT 'system',
    current_screen TEXT,
    catalog_write_enabled INTEGER NOT NULL DEFAULT 0 CHECK (catalog_write_enabled IN (0, 1)),
    catalog_write_reason TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_context (id, current_username) VALUES (1, 'system');

CREATE TABLE IF NOT EXISTS catalog_import_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('xlsx', 'xls', 'csv', 'json')),
    file_hash TEXT,
    mapping_json TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    inserted_rows INTEGER NOT NULL DEFAULT 0 CHECK (inserted_rows >= 0),
    duplicate_rows INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
    missing_required_rows INTEGER NOT NULL DEFAULT 0 CHECK (missing_required_rows >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'previewed', 'validated', 'imported', 'failed', 'cancelled')),
    imported_by TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS catalog_import_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_job_id INTEGER NOT NULL,
    row_number INTEGER NOT NULL,
    error_type TEXT NOT NULL CHECK (error_type IN (
        'missing_barcode', 'missing_trade_name', 'duplicate_barcode',
        'invalid_price', 'invalid_boolean', 'unknown_error'
    )),
    error_message TEXT NOT NULL,
    raw_row_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (import_job_id) REFERENCES catalog_import_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS medicines_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL UNIQUE,
    trade_name TEXT NOT NULL,
    active_ingredient TEXT,
    dosage_form TEXT,
    strength TEXT,
    manufacturer TEXT,
    official_price REAL CHECK (official_price IS NULL OR official_price >= 0),
    category TEXT,
    requires_prescription INTEGER NOT NULL DEFAULT 0 CHECK (requires_prescription IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_import_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (length(trim(barcode)) > 0),
    CHECK (length(trim(trade_name)) > 0),
    FOREIGN KEY (source_import_id) REFERENCES catalog_import_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_import_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT,
    invoice_number TEXT,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('xlsx', 'xls', 'csv', 'json')),
    file_hash TEXT,
    mapping_json TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    matched_rows INTEGER NOT NULL DEFAULT 0 CHECK (matched_rows >= 0),
    unmatched_rows INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_rows >= 0),
    inserted_inventory_rows INTEGER NOT NULL DEFAULT 0 CHECK (inserted_inventory_rows >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'previewed', 'validated', 'imported', 'failed', 'cancelled')),
    imported_by TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS inventory_import_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_job_id INTEGER NOT NULL,
    row_number INTEGER NOT NULL,
    barcode TEXT,
    error_type TEXT NOT NULL CHECK (error_type IN (
        'medicine_not_found_in_catalog', 'missing_barcode', 'missing_quantity',
        'invalid_quantity', 'invalid_price', 'invalid_expiry_date',
        'expired_medicine', 'unknown_error'
    )),
    error_message TEXT NOT NULL,
    raw_row_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (import_job_id) REFERENCES inventory_import_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id INTEGER NOT NULL,
    batch_number TEXT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_stock_alert INTEGER NOT NULL DEFAULT 5 CHECK (min_stock_alert >= 0),
    purchase_price REAL NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    expiry_date TEXT NOT NULL CHECK (expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    storage_location TEXT,
    supplier_name TEXT,
    date_received TEXT NOT NULL DEFAULT (date('now')) CHECK (date_received GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    source_import_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (catalog_id) REFERENCES medicines_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (source_import_id) REFERENCES inventory_import_jobs(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_sequences (
    invoice_year INTEGER PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (invoice_year >= 2000)
);

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    invoice_year INTEGER NOT NULL,
    invoice_sequence INTEGER NOT NULL,
    sale_date TEXT NOT NULL DEFAULT (datetime('now')),
    total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    final_amount REAL NOT NULL DEFAULT 0 CHECK (final_amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'insurance', 'mixed')),
    customer_name TEXT,
    customer_phone TEXT,
    notes TEXT,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
    voided_at TEXT,
    voided_by TEXT,
    void_reason TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (invoice_year, invoice_sequence),
    CHECK (invoice_number GLOB 'INV-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]')
);

CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    inventory_id INTEGER,
    catalog_id INTEGER,
    medicine_name TEXT NOT NULL,
    quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    subtotal REAL NOT NULL CHECK (subtotal >= 0),
    batch_number TEXT,
    expiry_date TEXT,
    is_one_off INTEGER NOT NULL DEFAULT 0 CHECK (is_one_off IN (0, 1)),
    one_off_barcode TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (length(trim(medicine_name)) > 0),
    CHECK (abs(subtotal - (quantity_sold * unit_price)) < 0.01),
    CHECK (
        (is_one_off = 0 AND inventory_id IS NOT NULL AND catalog_id IS NOT NULL)
        OR
        (is_one_off = 1)
    ),
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (inventory_id) REFERENCES pharmacy_inventory(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (catalog_id) REFERENCES medicines_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL,
    catalog_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'receive', 'sale', 'adjustment', 'return', 'void_sale', 'expired', 'quick_add'
    )),
    quantity_change INTEGER NOT NULL CHECK (quantity_change != 0),
    quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
    sale_id INTEGER,
    sale_item_id INTEGER,
    reference_number TEXT,
    reason TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    CHECK (quantity_after = quantity_before + quantity_change),
    FOREIGN KEY (inventory_id) REFERENCES pharmacy_inventory(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (catalog_id) REFERENCES medicines_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_time TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    source TEXT NOT NULL DEFAULT 'desktop_app',
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('auto', 'manual', 'usb', 'cloud', 'restore')),
    backup_file_name TEXT NOT NULL,
    backup_path TEXT NOT NULL,
    backup_date TEXT NOT NULL DEFAULT (datetime('now')),
    database_size_bytes INTEGER CHECK (database_size_bytes IS NULL OR database_size_bytes >= 0),
    checksum TEXT,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    created_by TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    setting_type TEXT NOT NULL DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    updated_by TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (length(trim(setting_key)) > 0)
);

CREATE TABLE IF NOT EXISTS receipt_printer_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_name TEXT,
    connection_type TEXT NOT NULL DEFAULT 'windows' CHECK (connection_type IN ('windows', 'usb', 'serial', 'network')),
    paper_width_mm INTEGER NOT NULL DEFAULT 80 CHECK (paper_width_mm IN (58, 80)),
    escpos_enabled INTEGER NOT NULL DEFAULT 1 CHECK (escpos_enabled IN (0, 1)),
    code_page TEXT DEFAULT 'CP864',
    is_default INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_catalog_barcode ON medicines_catalog (barcode);
CREATE INDEX IF NOT EXISTS idx_catalog_trade_name ON medicines_catalog (trade_name);
CREATE INDEX IF NOT EXISTS idx_catalog_active_ingredient ON medicines_catalog (active_ingredient);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON medicines_catalog (category);
CREATE INDEX IF NOT EXISTS idx_inventory_catalog ON pharmacy_inventory (catalog_id);
CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON pharmacy_inventory (quantity);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON pharmacy_inventory (expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON pharmacy_inventory (quantity, min_stock_alert);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON pharmacy_inventory (supplier_name);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales (invoice_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory ON sale_items (inventory_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_catalog ON sale_items (catalog_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory ON stock_movements (inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_catalog ON stock_movements (catalog_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log (event_time);
CREATE INDEX IF NOT EXISTS idx_backup_date ON backup_history (backup_date);

-- Catalog guard: the catalog is writable only during explicit catalog-import mode.
CREATE TRIGGER IF NOT EXISTS trg_catalog_guard_insert
BEFORE INSERT ON medicines_catalog
FOR EACH ROW
WHEN (SELECT catalog_write_enabled FROM app_context WHERE id = 1) != 1
BEGIN
    SELECT RAISE(ABORT, 'Catalog is read-only. Use Import Drug Catalog workflow.');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_guard_update
BEFORE UPDATE OF barcode, trade_name, active_ingredient, dosage_form, strength, manufacturer, official_price, category, requires_prescription, is_active
ON medicines_catalog
FOR EACH ROW
WHEN (SELECT catalog_write_enabled FROM app_context WHERE id = 1) != 1
BEGIN
    SELECT RAISE(ABORT, 'Catalog is read-only. Use Import Drug Catalog workflow.');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_prevent_expired_insert
BEFORE INSERT ON pharmacy_inventory
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN date(NEW.expiry_date) IS NULL OR date(NEW.expiry_date) < date('now')
        THEN RAISE(ABORT, 'Cannot add expired or invalid inventory item')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_prevent_expired_update
BEFORE UPDATE OF expiry_date ON pharmacy_inventory
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN date(NEW.expiry_date) IS NULL OR date(NEW.expiry_date) < date('now')
        THEN RAISE(ABORT, 'Cannot set inventory expiry date in the past')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_validate_stock
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN NEW.is_one_off = 0
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM pharmacy_inventory WHERE id = NEW.inventory_id AND is_active = 1
        )
        THEN RAISE(ABORT, 'Inventory item not found or inactive')
    END;

    SELECT CASE
        WHEN (SELECT quantity FROM pharmacy_inventory WHERE id = NEW.inventory_id) < NEW.quantity_sold
        THEN RAISE(ABORT, 'Insufficient stock quantity')
    END;

    SELECT CASE
        WHEN date((SELECT expiry_date FROM pharmacy_inventory WHERE id = NEW.inventory_id)) < date('now')
        THEN RAISE(ABORT, 'Expired medicine cannot be sold')
    END;

    SELECT CASE
        WHEN NEW.catalog_id != (SELECT catalog_id FROM pharmacy_inventory WHERE id = NEW.inventory_id)
        THEN RAISE(ABORT, 'Sale item catalog does not match inventory catalog')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_deduct_stock
AFTER INSERT ON sale_items
FOR EACH ROW
WHEN NEW.is_one_off = 0
BEGIN
    INSERT INTO stock_movements (
        inventory_id, catalog_id, movement_type, quantity_change,
        quantity_before, quantity_after, sale_id, sale_item_id,
        reference_number, reason, created_by
    )
    SELECT
        pi.id,
        pi.catalog_id,
        'sale',
        -NEW.quantity_sold,
        pi.quantity,
        pi.quantity - NEW.quantity_sold,
        NEW.sale_id,
        NEW.id,
        (SELECT invoice_number FROM sales WHERE id = NEW.sale_id),
        'Sale deduction',
        (SELECT current_username FROM app_context WHERE id = 1)
    FROM pharmacy_inventory pi
    WHERE pi.id = NEW.inventory_id;

    UPDATE pharmacy_inventory
    SET quantity = quantity - NEW.quantity_sold,
        updated_at = datetime('now'),
        updated_by = (SELECT current_username FROM app_context WHERE id = 1)
    WHERE id = NEW.inventory_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_prevent_invoice_number_update
BEFORE UPDATE OF invoice_number ON sales
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Invoice number cannot be changed');
END;

-- No hard delete triggers for core operational tables.
CREATE TRIGGER IF NOT EXISTS trg_no_delete_medicines_catalog BEFORE DELETE ON medicines_catalog FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Hard delete is not allowed. Use is_active = 0'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_pharmacy_inventory BEFORE DELETE ON pharmacy_inventory FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Hard delete is not allowed. Use is_active = 0'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_sales BEFORE DELETE ON sales FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Hard delete is not allowed. Use is_active = 0 or status = voided'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_sale_items BEFORE DELETE ON sale_items FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Hard delete is not allowed. Use is_active = 0'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_stock_movements BEFORE DELETE ON stock_movements FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Hard delete is not allowed'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_audit_log BEFORE DELETE ON audit_log FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Audit log cannot be deleted'); END;

-- Audit triggers.
CREATE TRIGGER IF NOT EXISTS trg_audit_catalog_insert
AFTER INSERT ON medicines_catalog
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value, notes)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'catalog_created',
        'medicines_catalog',
        NEW.id,
        NULL,
        json_object('barcode', NEW.barcode, 'trade_name', NEW.trade_name, 'official_price', NEW.official_price),
        (SELECT catalog_write_reason FROM app_context WHERE id = 1)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_inventory_insert
AFTER INSERT ON pharmacy_inventory
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'inventory_created',
        'pharmacy_inventory',
        NEW.id,
        NULL,
        json_object(
            'catalog_id', NEW.catalog_id,
            'batch_number', NEW.batch_number,
            'quantity', NEW.quantity,
            'purchase_price', NEW.purchase_price,
            'selling_price', NEW.selling_price,
            'expiry_date', NEW.expiry_date,
            'supplier_name', NEW.supplier_name
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_inventory_update
AFTER UPDATE OF quantity, purchase_price, selling_price, min_stock_alert, expiry_date, is_active
ON pharmacy_inventory
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'inventory_updated',
        'pharmacy_inventory',
        NEW.id,
        json_object(
            'quantity', OLD.quantity,
            'purchase_price', OLD.purchase_price,
            'selling_price', OLD.selling_price,
            'min_stock_alert', OLD.min_stock_alert,
            'expiry_date', OLD.expiry_date,
            'is_active', OLD.is_active
        ),
        json_object(
            'quantity', NEW.quantity,
            'purchase_price', NEW.purchase_price,
            'selling_price', NEW.selling_price,
            'min_stock_alert', NEW.min_stock_alert,
            'expiry_date', NEW.expiry_date,
            'is_active', NEW.is_active
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_inventory_price_below_cost_insert
AFTER INSERT ON pharmacy_inventory
FOR EACH ROW
WHEN NEW.selling_price < NEW.purchase_price
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, new_value, notes)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'warning_selling_below_purchase_price',
        'pharmacy_inventory',
        NEW.id,
        json_object('purchase_price', NEW.purchase_price, 'selling_price', NEW.selling_price),
        'Selling price is lower than purchase price'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_inventory_price_below_cost_update
AFTER UPDATE OF purchase_price, selling_price ON pharmacy_inventory
FOR EACH ROW
WHEN NEW.selling_price < NEW.purchase_price
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value, notes)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'warning_selling_below_purchase_price',
        'pharmacy_inventory',
        NEW.id,
        json_object('purchase_price', OLD.purchase_price, 'selling_price', OLD.selling_price),
        json_object('purchase_price', NEW.purchase_price, 'selling_price', NEW.selling_price),
        'Selling price is lower than purchase price'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_sales_insert
AFTER INSERT ON sales
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'sale_created',
        'sales',
        NEW.id,
        NULL,
        json_object(
            'invoice_number', NEW.invoice_number,
            'total_amount', NEW.total_amount,
            'discount_amount', NEW.discount_amount,
            'tax_amount', NEW.tax_amount,
            'final_amount', NEW.final_amount,
            'payment_method', NEW.payment_method
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_sale_item_insert
AFTER INSERT ON sale_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value, new_value)
    VALUES (
        (SELECT current_username FROM app_context WHERE id = 1),
        'sale_item_created',
        'sale_items',
        NEW.id,
        NULL,
        json_object(
            'sale_id', NEW.sale_id,
            'inventory_id', NEW.inventory_id,
            'catalog_id', NEW.catalog_id,
            'medicine_name', NEW.medicine_name,
            'quantity_sold', NEW.quantity_sold,
            'unit_price', NEW.unit_price,
            'subtotal', NEW.subtotal,
            'is_one_off', NEW.is_one_off
        )
    );
END;

CREATE VIEW IF NOT EXISTS v_inventory_status AS
SELECT
    pi.id AS inventory_id,
    mc.id AS catalog_id,
    mc.barcode,
    mc.trade_name,
    mc.active_ingredient,
    mc.dosage_form,
    mc.strength,
    mc.manufacturer,
    pi.batch_number,
    pi.quantity,
    pi.min_stock_alert,
    pi.purchase_price,
    pi.selling_price,
    pi.expiry_date,
    pi.storage_location,
    pi.supplier_name,
    CAST(julianday(pi.expiry_date) - julianday(date('now')) AS INTEGER) AS days_to_expiry,
    CASE
        WHEN date(pi.expiry_date) < date('now') THEN 'expired'
        WHEN pi.quantity = 0 THEN 'out_of_stock'
        WHEN pi.quantity <= pi.min_stock_alert THEN 'low_stock'
        WHEN julianday(pi.expiry_date) - julianday(date('now')) <= 30 THEN 'expiring_soon'
        ELSE 'in_stock'
    END AS stock_status
FROM pharmacy_inventory pi
JOIN medicines_catalog mc ON mc.id = pi.catalog_id
WHERE pi.is_active = 1 AND mc.is_active = 1;

CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT
    date(s.sale_date) AS sale_day,
    COUNT(DISTINCT s.id) AS invoices_count,
    SUM(s.total_amount) AS total_before_discount,
    SUM(s.discount_amount) AS total_discount,
    SUM(s.tax_amount) AS total_tax,
    SUM(s.final_amount) AS total_final_amount,
    SUM(si.quantity_sold) AS total_items_sold,
    SUM((si.unit_price - si.unit_cost) * si.quantity_sold) AS gross_profit
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
WHERE s.is_active = 1 AND si.is_active = 1 AND s.status = 'completed'
GROUP BY date(s.sale_date);

CREATE VIEW IF NOT EXISTS v_stagnant_items AS
SELECT
    pi.id AS inventory_id,
    mc.trade_name,
    mc.barcode,
    pi.batch_number,
    pi.quantity,
    pi.expiry_date,
    MAX(s.sale_date) AS last_sale_date,
    CASE
        WHEN MAX(s.sale_date) IS NULL THEN NULL
        ELSE CAST(julianday(date('now')) - julianday(MAX(s.sale_date)) AS INTEGER)
    END AS days_since_last_sale
FROM pharmacy_inventory pi
JOIN medicines_catalog mc ON mc.id = pi.catalog_id
LEFT JOIN sale_items si ON si.inventory_id = pi.id
LEFT JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
WHERE pi.is_active = 1 AND mc.is_active = 1
GROUP BY pi.id
HAVING last_sale_date IS NULL OR days_since_last_sale >= 90;

INSERT OR IGNORE INTO app_users (username, display_name, role) VALUES ('admin', 'مدير الصيدلية', 'admin');
INSERT OR IGNORE INTO app_settings (setting_key, setting_value, setting_type, description) VALUES
('tax_rate', '0.14', 'number', 'نسبة الضريبة الافتراضية'),
('closing_time', '22:00', 'string', 'وقت النسخ الاحتياطي اليومي'),
('pharmacy_name', 'صيدلية محلية', 'string', 'اسم الصيدلية على الإيصال'),
('backup_warning_days', '3', 'number', 'إظهار تحذير إذا لم توجد نسخة احتياطية خلال هذه الأيام');
INSERT OR IGNORE INTO receipt_printer_settings (id, printer_name, connection_type, paper_width_mm, escpos_enabled, code_page, is_default)
VALUES (1, NULL, 'windows', 80, 1, 'CP864', 1);
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, 'initial_production_schema');
