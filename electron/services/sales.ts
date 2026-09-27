import fs from 'node:fs';
import path from 'node:path';
import { SQLiteService } from './database';
import { CartItem, CompleteSaleInput, SaleResult } from '../types';

export class SalesService {
  constructor(private readonly db: SQLiteService) {}

  searchPOS(query: string, limit = 20): Record<string, unknown>[] {
    const cleaned = query.trim();
    const like = `%${cleaned}%`;
    return this.db.all(
      `SELECT
          mc.id AS catalog_id,
          mc.barcode,
          mc.trade_name,
          mc.active_ingredient,
          mc.dosage_form,
          mc.strength,
          mc.official_price,
          mc.requires_prescription,
          vi.inventory_id,
          vi.batch_number,
          vi.quantity,
          vi.selling_price,
          vi.purchase_price,
          vi.expiry_date,
          vi.days_to_expiry,
          vi.stock_status
       FROM medicines_catalog mc
       LEFT JOIN v_inventory_status vi ON vi.catalog_id = mc.id
       WHERE mc.is_active = 1 AND (mc.barcode = ? OR mc.trade_name LIKE ? OR mc.active_ingredient LIKE ?)
       ORDER BY
          CASE WHEN mc.barcode = ? THEN 0 ELSE 1 END,
          CASE vi.stock_status
            WHEN 'in_stock' THEN 0
            WHEN 'expiring_soon' THEN 1
            WHEN 'low_stock' THEN 2
            WHEN 'out_of_stock' THEN 3
            WHEN 'expired' THEN 4
            ELSE 5
          END,
          vi.expiry_date,
          mc.trade_name
       LIMIT ?`,
      [cleaned, like, like, cleaned, limit],
    );
  }

  buildCartItemFromInventory(inventoryId: number, quantity = 1): CartItem {
    const row = this.db.one<Record<string, any>>(
      `SELECT vi.*, mc.trade_name, mc.strength
       FROM v_inventory_status vi
       JOIN medicines_catalog mc ON mc.id = vi.catalog_id
       WHERE vi.inventory_id = ?`,
      [inventoryId],
    );
    if (!row) throw new Error('الصنف غير موجود في المخزون');
    validateInventorySaleState(row, quantity);
    return {
      inventory_id: inventoryId,
      catalog_id: Number(row.catalog_id),
      medicine_name: `${row.trade_name || ''} ${row.strength || ''}`.trim(),
      quantity,
      unit_price: Number(row.selling_price),
      unit_cost: Number(row.purchase_price),
      batch_number: row.batch_number || null,
      expiry_date: row.expiry_date || null,
    };
  }

  completeSale(input: CompleteSaleInput): SaleResult {
    const username = input.username || 'admin';
    const cart = input.cart_items || [];
    if (!cart.length) throw new Error('لا يمكن إتمام فاتورة فارغة');
    const discount = Number(input.discount_amount || 0);
    if (discount < 0) throw new Error('الخصم لا يمكن أن يكون سالباً');
    const taxRate = Number(input.tax_rate ?? 0.14);
    const total = round2(cart.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0));
    if (discount > total) throw new Error('الخصم أكبر من قيمة الفاتورة');
    const taxable = Math.max(total - discount, 0);
    const tax = round2(taxable * taxRate);
    const final = round2(taxable + tax);
    const now = new Date();
    const year = now.getFullYear();
    let saleId = 0;
    let invoiceNumber = '';

    this.db.transaction(username, 'pos', () => {
      this.db.run(
        `INSERT INTO invoice_sequences (invoice_year, last_number)
         VALUES (?, 0)
         ON CONFLICT(invoice_year) DO NOTHING`,
        [year],
      );
      this.db.run(
        `UPDATE invoice_sequences SET last_number = last_number + 1, updated_at = datetime('now') WHERE invoice_year = ?`,
        [year],
      );
      const seqRow = this.db.one<{ last_number: number }>('SELECT last_number FROM invoice_sequences WHERE invoice_year = ?', [year]);
      const sequence = Number(seqRow?.last_number || 0);
      invoiceNumber = `INV-${year}-${String(sequence).padStart(6, '0')}`;
      this.db.run(
        `INSERT INTO sales (
          invoice_number, invoice_year, invoice_sequence, sale_date,
          total_amount, discount_amount, tax_amount, final_amount,
          payment_method, customer_name, customer_phone, notes, created_by
        ) VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          year,
          sequence,
          total,
          discount,
          tax,
          final,
          input.payment_method,
          input.customer_name || null,
          input.customer_phone || null,
          input.notes || null,
          username,
        ],
      );
      saleId = this.db.lastInsertId();
      for (const item of cart) {
        if (Number(item.quantity) <= 0) throw new Error('كمية الصنف يجب أن تكون أكبر من صفر');
        if (Number(item.unit_price) < 0 || Number(item.unit_cost || 0) < 0) throw new Error('الأسعار لا يمكن أن تكون سالبة');
        if (!item.is_one_off) {
          const inventory = this.db.one<Record<string, any>>(
            'SELECT * FROM pharmacy_inventory WHERE id = ? AND is_active = 1',
            [item.inventory_id],
          );
          if (!inventory) throw new Error(`الصنف غير موجود بالمخزون: ${item.medicine_name}`);
          if (Number(inventory.quantity) < Number(item.quantity)) throw new Error(`الكمية غير كافية: ${item.medicine_name}`);
          if (new Date(`${inventory.expiry_date}T00:00:00`) < today()) throw new Error(`الدواء منتهي الصلاحية: ${item.medicine_name}`);
        }
        this.db.run(
          `INSERT INTO sale_items (
            sale_id, inventory_id, catalog_id, medicine_name, quantity_sold,
            unit_price, unit_cost, subtotal, batch_number, expiry_date,
            is_one_off, one_off_barcode, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            item.inventory_id || null,
            item.catalog_id || null,
            item.medicine_name,
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.unit_cost || 0),
            round2(Number(item.quantity) * Number(item.unit_price)),
            item.batch_number || null,
            item.expiry_date || null,
            item.is_one_off ? 1 : 0,
            item.one_off_barcode || null,
            item.notes || null,
          ],
        );
      }
    });

    const receiptPath = this.saveReceipt(saleId);
    return { sale_id: saleId, invoice_number: invoiceNumber, final_amount: final, receipt_path: receiptPath };
  }

  receipt(saleId: number): { sale: Record<string, unknown>; items: Record<string, unknown>[] } {
    const sale = this.db.one('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale) throw new Error('الفاتورة غير موجودة');
    const items = this.db.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [saleId]);
    return { sale, items };
  }

  private saveReceipt(saleId: number): string {
    const receipt = this.receipt(saleId);
    const sale = receipt.sale as any;
    const lines = [
      'صيدلية محلية'.padStart(24),
      '========================================',
      `فاتورة: ${sale.invoice_number}`,
      `التاريخ: ${sale.sale_date}`,
      `الدفع: ${paymentArabic(sale.payment_method)}`,
      '----------------------------------------',
      ...receipt.items.flatMap((item: any) => [
        String(item.medicine_name).slice(0, 40),
        `  ${item.quantity_sold} x ${Number(item.unit_price).toFixed(2)} = ${Number(item.subtotal).toFixed(2)}`,
      ]),
      '----------------------------------------',
      `المجموع: ${Number(sale.total_amount).toFixed(2)}`,
      `الخصم: ${Number(sale.discount_amount).toFixed(2)}`,
      `الضريبة: ${Number(sale.tax_amount).toFixed(2)}`,
      `الإجمالي: ${Number(sale.final_amount).toFixed(2)}`,
      '========================================',
      'شكراً لزيارتكم',
    ];
    const fileName = `receipt_${sale.invoice_number}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    const filePath = path.join(this.db.receiptDir, fileName);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return filePath;
  }
}

function validateInventorySaleState(item: Record<string, any>, requestedQuantity: number): void {
  if (Number(item.quantity) <= 0) throw new Error('❌ نفدت الكمية');
  if (Number(item.quantity) < requestedQuantity) throw new Error('❌ الكمية المطلوبة أكبر من المتاح');
  const expiry = new Date(`${item.expiry_date}T00:00:00`);
  if (expiry < today()) throw new Error('🚫 الدواء منتهي الصلاحية');
}

function today(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paymentArabic(method: string): string {
  return { cash: 'كاش', card: 'فيزا/بطاقة', insurance: 'تأمين', mixed: 'مختلط' }[method] || method;
}
