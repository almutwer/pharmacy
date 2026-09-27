import path from 'node:path';
import { SQLiteService } from './database';
import { readTabularFile, sha256File } from './fileReaders';
import { AddStockInput, BulkInventoryResult } from '../types';

export class InventoryService {
  constructor(private readonly db: SQLiteService) {}

  findCatalogByBarcode(barcode: string): Record<string, unknown> | null {
    return this.db.one('SELECT * FROM medicines_catalog WHERE barcode = ? AND is_active = 1', [barcode.trim()]);
  }

  list(limit = 500): Record<string, unknown>[] {
    return this.db.all('SELECT * FROM v_inventory_status ORDER BY trade_name, expiry_date LIMIT ?', [limit]);
  }

  search(query: string, limit = 50): Record<string, unknown>[] {
    const cleaned = query.trim();
    const like = `%${cleaned}%`;
    return this.db.all(
      `SELECT * FROM v_inventory_status
       WHERE barcode = ? OR trade_name LIKE ? OR active_ingredient LIKE ? OR batch_number LIKE ?
       ORDER BY trade_name, expiry_date LIMIT ?`,
      [cleaned, like, like, like, limit],
    );
  }

  addStock(input: AddStockInput): { inventory_id: number; warnings: string[] } {
    const username = input.username || 'admin';
    const warnings = validateInventoryValues(input);
    let inventoryId = 0;
    this.db.transaction(username, 'inventory_add', () => {
      const catalog = this.db.one('SELECT id FROM medicines_catalog WHERE id = ? AND is_active = 1', [input.catalog_id]);
      if (!catalog) throw new Error('الدواء غير موجود في دليل الأدوية');
      this.db.run(
        `INSERT INTO pharmacy_inventory (
          catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price,
          expiry_date, storage_location, supplier_name, date_received, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.catalog_id,
          input.batch_number || null,
          Number(input.quantity),
          Number(input.min_stock_alert ?? 5),
          Number(input.purchase_price),
          Number(input.selling_price),
          input.expiry_date,
          input.storage_location || null,
          input.supplier_name || null,
          input.date_received || new Date().toISOString().slice(0, 10),
          username,
          username,
        ],
      );
      inventoryId = this.db.lastInsertId();
      this.db.run(
        `INSERT INTO stock_movements (
          inventory_id, catalog_id, movement_type, quantity_change, quantity_before,
          quantity_after, reference_number, reason, created_by
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          inventoryId,
          input.catalog_id,
          input.movement_type || 'receive',
          Number(input.quantity),
          Number(input.quantity),
          input.reference_number || null,
          input.movement_type === 'quick_add' ? 'Quick add' : 'Initial stock receipt',
          username,
        ],
      );
    });
    return { inventory_id: inventoryId, warnings };
  }

  adjustStock(inventoryId: number, newQuantity: number, reason: string, username = 'admin'): void {
    if (newQuantity < 0) throw new Error('لا يمكن أن تكون الكمية سالبة');
    this.db.transaction(username, 'inventory_adjust', () => {
      const row = this.db.one<{ id: number; catalog_id: number; quantity: number }>(
        'SELECT id, catalog_id, quantity FROM pharmacy_inventory WHERE id = ? AND is_active = 1',
        [inventoryId],
      );
      if (!row) throw new Error('سجل المخزون غير موجود');
      const oldQuantity = Number(row.quantity);
      const change = Number(newQuantity) - oldQuantity;
      if (change === 0) return;
      this.db.run(
        `UPDATE pharmacy_inventory SET quantity = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
        [newQuantity, username, inventoryId],
      );
      this.db.run(
        `INSERT INTO stock_movements (
          inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reason, created_by
        ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
        [inventoryId, row.catalog_id, change, oldQuantity, newQuantity, reason, username],
      );
    });
  }

  bulkImportSupplierInvoice(
    filePath: string,
    mapping: Record<string, string>,
    supplierName: string | null,
    invoiceNumber: string | null,
    username = 'admin',
  ): BulkInventoryResult {
    const { rows } = readTabularFile(filePath);
    const fileType = path.extname(filePath).replace('.', '').toLowerCase();
    const errors: string[] = [];
    let matchedRows = 0;
    let unmatchedRows = 0;
    let insertedRows = 0;
    let jobId = 0;

    this.db.transaction(username, 'inventory_bulk_import', () => {
      this.db.run(
        `INSERT INTO inventory_import_jobs (
          supplier_name, invoice_number, file_name, file_type, file_hash, mapping_json,
          total_rows, status, imported_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'validated', ?)`,
        [supplierName, invoiceNumber, path.basename(filePath), fileType, sha256File(filePath), JSON.stringify(mapping), rows.length, username],
      );
      jobId = this.db.lastInsertId();

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const barcode = value(row, mapping.barcode);
        try {
          if (!barcode) throw new Error('missing_barcode');
          const catalog = this.db.one<{ id: number; official_price: number | null }>(
            'SELECT id, official_price FROM medicines_catalog WHERE barcode = ? AND is_active = 1',
            [barcode],
          );
          if (!catalog) {
            unmatchedRows += 1;
            const message = `صف ${rowNumber}: الدواء غير موجود في الدليل: ${barcode}`;
            errors.push(message);
            this.db.run(
              `INSERT INTO inventory_import_errors (import_job_id, row_number, barcode, error_type, error_message, raw_row_json)
               VALUES (?, ?, ?, 'medicine_not_found_in_catalog', ?, ?)`,
              [jobId, rowNumber, barcode, message, JSON.stringify(row)],
            );
            return;
          }
          matchedRows += 1;
          const quantity = Number(value(row, mapping.quantity));
          const purchasePrice = Number(value(row, mapping.purchase_price).replace(',', '.'));
          const sellingRaw = value(row, mapping.selling_price);
          const sellingPrice = sellingRaw ? Number(sellingRaw.replace(',', '.')) : Number(catalog.official_price || 0);
          const expiryDate = value(row, mapping.expiry_date);
          const batchNumber = value(row, mapping.batch_number) || null;
          validateInventoryValues({
            quantity,
            purchase_price: purchasePrice,
            selling_price: sellingPrice,
            expiry_date: expiryDate,
          });
          this.db.run(
            `INSERT INTO pharmacy_inventory (
              catalog_id, batch_number, quantity, purchase_price, selling_price, expiry_date,
              supplier_name, date_received, source_import_id, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?)`,
            [catalog.id, batchNumber, quantity, purchasePrice, sellingPrice, expiryDate, supplierName, jobId, username, username],
          );
          const inventoryId = this.db.lastInsertId();
          this.db.run(
            `INSERT INTO stock_movements (
              inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after,
              reference_number, reason, created_by
            ) VALUES (?, ?, 'receive', ?, 0, ?, ?, 'Supplier invoice bulk import', ?)`,
            [inventoryId, catalog.id, quantity, quantity, invoiceNumber, username],
          );
          insertedRows += 1;
        } catch (error) {
          const message = `صف ${rowNumber}: ${(error as Error).message}`;
          errors.push(message);
          this.db.run(
            `INSERT INTO inventory_import_errors (import_job_id, row_number, barcode, error_type, error_message, raw_row_json)
             VALUES (?, ?, ?, 'unknown_error', ?, ?)`,
            [jobId, rowNumber, barcode, message, JSON.stringify(row)],
          );
        }
      });

      this.db.run(
        `UPDATE inventory_import_jobs
         SET matched_rows = ?, unmatched_rows = ?, inserted_inventory_rows = ?, status = ?, finished_at = datetime('now')
         WHERE id = ?`,
        [matchedRows, unmatchedRows, insertedRows, insertedRows ? 'imported' : 'failed', jobId],
      );
    });

    return { import_job_id: jobId, total_rows: rows.length, matched_rows: matchedRows, unmatched_rows: unmatchedRows, inserted_rows: insertedRows, errors };
  }
}

function value(row: Record<string, string>, key?: string): string {
  return key ? (row[key] || '').trim() : '';
}

function validateInventoryValues(input: Pick<AddStockInput, 'quantity' | 'purchase_price' | 'selling_price' | 'expiry_date' | 'min_stock_alert'>): string[] {
  const warnings: string[] = [];
  if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) < 0) throw new Error('لا يمكن أن تكون الكمية سالبة');
  if (Number(input.min_stock_alert ?? 0) < 0) throw new Error('حد التنبيه لا يمكن أن يكون سالباً');
  if (!Number.isFinite(Number(input.purchase_price)) || Number(input.purchase_price) < 0) throw new Error('سعر الشراء لا يمكن أن يكون سالباً');
  if (!Number.isFinite(Number(input.selling_price)) || Number(input.selling_price) < 0) throw new Error('سعر البيع لا يمكن أن يكون سالباً');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiry_date)) throw new Error('تاريخ الانتهاء يجب أن يكون بصيغة YYYY-MM-DD');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${input.expiry_date}T00:00:00`);
  if (Number.isNaN(expiry.getTime()) || expiry < today) throw new Error('لا يمكن إضافة دواء منتهي الصلاحية');
  if (Number(input.selling_price) < Number(input.purchase_price)) warnings.push('تحذير: سعر البيع أقل من سعر الشراء');
  return warnings;
}
