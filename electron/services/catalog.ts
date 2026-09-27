import path from 'node:path';
import { SQLiteService } from './database';
import { readTabularFile, sha256File } from './fileReaders';
import { CatalogImportResult } from '../types';

export const CATALOG_FIELDS = [
  'barcode',
  'trade_name',
  'active_ingredient',
  'dosage_form',
  'strength',
  'manufacturer',
  'official_price',
  'category',
  'requires_prescription',
  'is_active',
] as const;

type CatalogRecord = Record<(typeof CATALOG_FIELDS)[number], string | number | null>;

export class CatalogService {
  constructor(private readonly db: SQLiteService) {}

  search(query: string, limit = 50): Record<string, unknown>[] {
    const cleaned = query.trim();
    const like = `%${cleaned}%`;
    return this.db.all(
      `SELECT * FROM medicines_catalog
       WHERE is_active = 1 AND (barcode = ? OR trade_name LIKE ? OR active_ingredient LIKE ?)
       ORDER BY CASE WHEN barcode = ? THEN 0 ELSE 1 END, trade_name
       LIMIT ?`,
      [cleaned, like, like, cleaned, limit],
    );
  }

  importCatalog(filePath: string, mapping: Record<string, string>, username = 'admin'): CatalogImportResult {
    const { rows } = readTabularFile(filePath);
    const fileType = path.extname(filePath).replace('.', '').toLowerCase();
    const validRecords: CatalogRecord[] = [];
    const errors: Array<{ row_number: number; error_type: string; error_message: string }> = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const record: Partial<CatalogRecord> = {};
      CATALOG_FIELDS.forEach((field) => {
        const column = mapping[field];
        record[field] = column ? row[column]?.trim() || null : null;
      });
      if (!record.barcode) {
        errors.push({ row_number: rowNumber, error_type: 'missing_barcode', error_message: 'الباركود مفقود' });
        return;
      }
      if (!record.trade_name) {
        errors.push({ row_number: rowNumber, error_type: 'missing_trade_name', error_message: 'الاسم التجاري مفقود' });
        return;
      }
      const barcode = String(record.barcode).trim();
      if (seen.has(barcode)) {
        errors.push({ row_number: rowNumber, error_type: 'duplicate_barcode', error_message: `باركود مكرر داخل الملف: ${barcode}` });
        return;
      }
      seen.add(barcode);
      try {
        record.official_price = parseNullableNumber(record.official_price);
        record.requires_prescription = parseBoolean(record.requires_prescription, false);
        record.is_active = parseBoolean(record.is_active, true);
      } catch (error) {
        errors.push({ row_number: rowNumber, error_type: 'invalid_value', error_message: String((error as Error).message) });
        return;
      }
      validRecords.push(record as CatalogRecord);
    });

    let insertedRows = 0;
    let duplicateRows = errors.filter((e) => e.error_type === 'duplicate_barcode').length;
    const missingRequiredRows = errors.filter((e) => e.error_type === 'missing_barcode' || e.error_type === 'missing_trade_name').length;
    let jobId = 0;

    this.db.transaction(username, 'catalog_import', () => {
      this.db.setContext(username, 'catalog_import', true, `catalog_import:${path.basename(filePath)}`);
      this.db.run(
        `INSERT INTO catalog_import_jobs (
          file_name, file_type, file_hash, mapping_json, total_rows, valid_rows,
          duplicate_rows, missing_required_rows, status, imported_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?)`,
        [path.basename(filePath), fileType, sha256File(filePath), JSON.stringify(mapping), rows.length, validRecords.length, duplicateRows, missingRequiredRows, username],
      );
      jobId = this.db.lastInsertId();
      for (const error of errors) {
        const mappedType = ['missing_barcode', 'missing_trade_name', 'duplicate_barcode', 'invalid_price', 'invalid_boolean'].includes(error.error_type)
          ? error.error_type
          : 'unknown_error';
        this.db.run(
          `INSERT INTO catalog_import_errors (import_job_id, row_number, error_type, error_message, raw_row_json)
           VALUES (?, ?, ?, ?, ?)`,
          [jobId, error.row_number, mappedType, error.error_message, '{}'],
        );
      }
      for (const record of validRecords) {
        try {
          this.db.run(
            `INSERT INTO medicines_catalog (
              barcode, trade_name, active_ingredient, dosage_form, strength, manufacturer,
              official_price, category, requires_prescription, is_active, source_import_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              record.barcode,
              record.trade_name,
              record.active_ingredient,
              record.dosage_form,
              record.strength,
              record.manufacturer,
              record.official_price,
              record.category,
              record.requires_prescription,
              record.is_active,
              jobId,
            ],
          );
          insertedRows += 1;
        } catch (error) {
          duplicateRows += 1;
          this.db.run(
            `INSERT INTO catalog_import_errors (import_job_id, row_number, error_type, error_message, raw_row_json)
             VALUES (?, 0, 'duplicate_barcode', ?, ?)`,
            [jobId, `لم يتم إدخال الباركود ${record.barcode}: ${(error as Error).message}`, JSON.stringify(record)],
          );
        }
      }
      this.db.run(
        `UPDATE catalog_import_jobs SET inserted_rows = ?, duplicate_rows = ?, status = ?, finished_at = datetime('now') WHERE id = ?`,
        [insertedRows, duplicateRows, insertedRows ? 'imported' : 'failed', jobId],
      );
      this.db.setContext(username, 'catalog_import', false, null);
    });

    return {
      import_job_id: jobId,
      total_rows: rows.length,
      valid_rows: validRecords.length,
      inserted_rows: insertedRows,
      duplicate_rows: duplicateRows,
      missing_required_rows: missingRequiredRows,
      errors,
    };
  }
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('السعر الرسمي غير صحيح');
  return parsed;
}

function parseBoolean(value: unknown, defaultValue: boolean): number {
  if (value === null || value === undefined || String(value).trim() === '') return defaultValue ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'نعم', 'صح', 'مطلوب'].includes(normalized)) return 1;
  if (['0', 'false', 'no', 'n', 'لا', 'خطأ', 'غير مطلوب'].includes(normalized)) return 0;
  throw new Error('قيمة نعم/لا غير صحيحة');
}
