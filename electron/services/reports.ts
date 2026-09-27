import { SQLiteService } from './database';

export class ReportsService {
  constructor(private readonly db: SQLiteService) {}

  dailySales(day = new Date().toISOString().slice(0, 10)): Record<string, unknown> {
    const row = this.db.one('SELECT * FROM v_daily_sales WHERE sale_day = ?', [day]);
    return row || {
      sale_day: day,
      invoices_count: 0,
      total_before_discount: 0,
      total_discount: 0,
      total_tax: 0,
      total_final_amount: 0,
      total_items_sold: 0,
      gross_profit: 0,
    };
  }

  inventoryStatus(): Record<string, unknown>[] {
    return this.db.all('SELECT * FROM v_inventory_status ORDER BY stock_status, trade_name');
  }

  lowStock(): Record<string, unknown>[] {
    return this.db.all('SELECT * FROM v_inventory_status WHERE quantity <= min_stock_alert ORDER BY quantity ASC, trade_name');
  }

  expiring(days = 30): Record<string, unknown>[] {
    return this.db.all(
      `SELECT * FROM v_inventory_status WHERE days_to_expiry BETWEEN 0 AND ? ORDER BY expiry_date ASC, trade_name`,
      [days],
    );
  }

  profit(startDate?: string, endDate?: string): Record<string, unknown> {
    const today = new Date();
    const start = startDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const end = endDate || today.toISOString().slice(0, 10);
    const row = this.db.one(
      `SELECT
          COALESCE(SUM(s.final_amount), 0) AS revenue,
          COALESCE(SUM(si.unit_cost * si.quantity_sold), 0) AS cost,
          COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity_sold), 0) AS gross_profit,
          COUNT(DISTINCT s.id) AS invoices_count
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE s.status = 'completed' AND s.is_active = 1 AND si.is_active = 1
         AND date(s.sale_date) BETWEEN ? AND ?`,
      [start, end],
    );
    return { ...(row || {}), start_date: start, end_date: end };
  }

  suppliers(startDate?: string, endDate?: string): Record<string, unknown>[] {
    const today = new Date();
    const end = endDate || today.toISOString().slice(0, 10);
    const start = startDate || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.db.all(
      `SELECT
          COALESCE(supplier_name, 'غير محدد') AS supplier_name,
          COUNT(*) AS batches_count,
          SUM(quantity) AS current_quantity,
          SUM(quantity * purchase_price) AS current_stock_cost
       FROM pharmacy_inventory
       WHERE is_active = 1 AND date(date_received) BETWEEN ? AND ?
       GROUP BY COALESCE(supplier_name, 'غير محدد')
       ORDER BY current_stock_cost DESC`,
      [start, end],
    );
  }

  stagnant(days = 90): Record<string, unknown>[] {
    return this.db.all(
      `SELECT * FROM v_stagnant_items
       WHERE last_sale_date IS NULL OR days_since_last_sale >= ?
       ORDER BY last_sale_date IS NULL DESC, days_since_last_sale DESC`,
      [days],
    );
  }
}
