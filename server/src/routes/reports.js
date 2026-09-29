/**
 * التقارير: لوحة المعلومات، الأرباح، المبيعات، المشتريات، المخزون
 */
import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap, round, today, getSettingNumber } from '../lib/helpers.js';

const router = Router();
router.use(requireAuth);

function period(req) {
  const to = req.query.to || today();
  const from = req.query.from || today().slice(0, 8) + '01';
  return { from, to };
}

/** أرقام لوحة المعلومات */
router.get(
  '/dashboard',
  wrap((req, res) => {
    const day = today();
    const monthStart = day.slice(0, 8) + '01';
    const expiryDays = getSettingNumber('expiry_alert_days', 90);
    const lowLevel = getSettingNumber('low_stock_level', 10);

    const salesOf = (from, to) => db.get(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(profit),0) AS profit, COALESCE(SUM(cogs),0) AS cogs
      FROM sales WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]);
    const returnsOf = (from, to) => db.get(`
      SELECT COALESCE(SUM(total),0) AS total, COALESCE(SUM(cost_total),0) AS cost
      FROM sale_returns WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]);
    const expensesOf = (from, to) => db.value(`
      SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]) || 0;
    const purchasesOf = (from, to) => db.value(`
      SELECT COALESCE(SUM(total),0) FROM purchases WHERE status='posted' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || 0;

    const buildKpi = (from, to) => {
      const s = salesOf(from, to);
      const r = returnsOf(from, to);
      const e = expensesOf(from, to);
      const netSales = round(s.total - r.total);
      const grossProfit = round(s.profit - (r.total - r.cost));
      return {
        invoices: s.count,
        sales: netSales,
        returns: round(r.total),
        gross_profit: grossProfit,
        expenses: round(e),
        net_profit: round(grossProfit - e),
        purchases: round(purchasesOf(from, to)),
      };
    };

    const stock = db.get(`
      SELECT COALESCE(SUM(b.qty_available * b.cost_price),0) AS cost_value,
             COUNT(DISTINCT p.id) AS products
      FROM products p LEFT JOIN batches b ON b.product_id = p.id WHERE p.active = 1`);

    const salesTrend = db.all(`
      SELECT d.day AS date,
             COALESCE(SUM(s.total),0) AS sales,
             COALESCE(SUM(s.profit),0) AS profit
      FROM (SELECT date('now', 'localtime', '-' || n || ' day') AS day FROM
             (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
              UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13)) d
      LEFT JOIN sales s ON date(s.date) = d.day AND s.status = 'completed'
      GROUP BY d.day ORDER BY d.day`);

    const topProducts = db.all(`
      SELECT p.name, SUM(si.qty - si.returned_qty) AS qty,
             ROUND(SUM((si.qty - si.returned_qty) * si.unit_price),2) AS revenue,
             ROUND(SUM((si.qty - si.returned_qty) * (si.unit_price - si.unit_cost)),2) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE date(s.date) >= date(?) GROUP BY si.product_id
      HAVING qty > 0 ORDER BY revenue DESC LIMIT 8`, [monthStart]);

    const recentSales = db.all(`
      SELECT s.id, s.invoice_no, s.date, s.total, s.profit, s.status, c.name AS customer_name, u.full_name AS user_name
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.id DESC LIMIT 8`);

    const alerts = {
      low_stock: db.value(`
        SELECT COUNT(*) FROM (SELECT p.id, COALESCE(SUM(b.qty_available),0) AS q, p.reorder_level
          FROM products p LEFT JOIN batches b ON b.product_id = p.id WHERE p.active=1 GROUP BY p.id) t
        WHERE t.q > 0 AND t.q <= CASE WHEN t.reorder_level > 0 THEN t.reorder_level ELSE ? END`, [lowLevel]),
      out_of_stock: db.value(`
        SELECT COUNT(*) FROM (SELECT p.id, COALESCE(SUM(b.qty_available),0) AS q
          FROM products p LEFT JOIN batches b ON b.product_id = p.id WHERE p.active=1 GROUP BY p.id) t WHERE t.q <= 0`),
      expiring_soon: db.value(`
        SELECT COUNT(*) FROM batches WHERE qty_available > 0 AND expiry_date IS NOT NULL AND expiry_date <> ''
          AND date(expiry_date) BETWEEN date('now') AND date('now','+' || ? || ' day')`, [expiryDays]),
      expired: db.value(`
        SELECT COUNT(*) FROM batches WHERE qty_available > 0 AND expiry_date IS NOT NULL AND expiry_date <> ''
          AND date(expiry_date) < date('now')`),
      debts: round(db.value("SELECT COALESCE(SUM(total - paid),0) FROM sales WHERE status='completed' AND total > paid") || 0),
      supplier_debts: round(db.value("SELECT COALESCE(SUM(total - paid),0) FROM purchases WHERE status='posted' AND total > paid") || 0),
    };

    res.json({
      today: buildKpi(day, day),
      month: buildKpi(monthStart, day),
      stock: { cost_value: round(stock.cost_value), products: stock.products },
      catalog_count: db.value('SELECT COUNT(*) FROM drug_catalog'),
      sales_trend: salesTrend,
      top_products: topProducts,
      recent_sales: recentSales,
      alerts,
    });
  }),
);

/** تقرير الأرباح والخسائر */
router.get(
  '/profit',
  requireRole('manager'),
  wrap((req, res) => {
    const { from, to } = period(req);
    const groupBy = req.query.group === 'month' ? "strftime('%Y-%m', date)" : 'date(date)';

    const sales = db.get(`
      SELECT COUNT(*) AS invoices, COALESCE(SUM(total),0) AS total, COALESCE(SUM(tax),0) AS tax,
             COALESCE(SUM(discount),0) AS discount, COALESCE(SUM(cogs),0) AS cogs, COALESCE(SUM(profit),0) AS profit
      FROM sales WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]);

    const returns = db.get(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(cost_total),0) AS cost
      FROM sale_returns WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]);

    const expenses = db.get(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
      FROM expenses WHERE date(date) BETWEEN date(?) AND date(?)`, [from, to]);

    const losses = db.value(`
      SELECT COALESCE(SUM(ABS(qty) * unit_cost),0) FROM stock_movements
      WHERE type IN ('damage','expired') AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || 0;

    const purchases = db.get(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total
      FROM purchases WHERE status='posted' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]);

    const netSales = round(sales.total - returns.total);
    const netCogs = round(sales.cogs - returns.cost);
    const grossProfit = round(netSales - sales.tax - netCogs);
    const netProfit = round(grossProfit - expenses.total - losses);

    const series = db.all(`
      SELECT g AS period,
             COALESCE(SUM(sales_total),0) AS sales,
             COALESCE(SUM(cogs),0) AS cogs,
             COALESCE(SUM(returns_total),0) AS returns,
             COALESCE(SUM(expenses_total),0) AS expenses,
             COALESCE(SUM(profit),0) AS gross_profit
      FROM (
        SELECT ${groupBy} AS g, total AS sales_total, cogs AS cogs, profit AS profit, 0 AS returns_total, 0 AS expenses_total
        FROM sales WHERE date(date) BETWEEN date(?) AND date(?)
        UNION ALL
        SELECT ${groupBy} AS g, 0, -cost_total, -(total - cost_total), total, 0
        FROM sale_returns WHERE date(date) BETWEEN date(?) AND date(?)
        UNION ALL
        SELECT ${groupBy} AS g, 0, 0, 0, 0, amount
        FROM expenses WHERE date(date) BETWEEN date(?) AND date(?)
      ) GROUP BY g ORDER BY g`, [from, to, from, to, from, to]);

    const byCategory = db.all(`
      SELECT COALESCE(NULLIF(p.category,''),'غير مصنف') AS category,
             ROUND(SUM((si.qty - si.returned_qty) * si.unit_price),2) AS revenue,
             ROUND(SUM((si.qty - si.returned_qty) * si.unit_cost),2) AS cost,
             ROUND(SUM((si.qty - si.returned_qty) * (si.unit_price - si.unit_cost)),2) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE date(s.date) BETWEEN date(?) AND date(?)
      GROUP BY category ORDER BY profit DESC`, [from, to]);

    const expensesByCategory = db.all(`
      SELECT category, COALESCE(SUM(amount),0) AS amount FROM expenses
      WHERE date(date) BETWEEN date(?) AND date(?) GROUP BY category ORDER BY amount DESC`, [from, to]);

    res.json({
      from, to,
      summary: {
        gross_sales: round(sales.total),
        returns: round(returns.total),
        net_sales: netSales,
        tax: round(sales.tax),
        discount: round(sales.discount),
        cogs: netCogs,
        gross_profit: grossProfit,
        expenses: round(expenses.total),
        losses: round(losses),
        net_profit: netProfit,
        margin: netSales > 0 ? round((netProfit / netSales) * 100, 1) : 0,
        invoices: sales.invoices,
        purchases: round(purchases.total),
        purchases_count: purchases.count,
      },
      series: series.map((r) => ({
        ...r,
        net_profit: round(r.gross_profit - r.expenses),
      })),
      by_category: byCategory,
      expenses_by_category: expensesByCategory,
    });
  }),
);

/** تقرير المبيعات التفصيلي */
router.get(
  '/sales',
  wrap((req, res) => {
    const { from, to } = period(req);
    res.json({
      from, to,
      by_day: db.all(`
        SELECT date(date) AS day, COUNT(*) AS invoices, COALESCE(SUM(total),0) AS total,
               COALESCE(SUM(profit),0) AS profit
        FROM sales WHERE status='completed' AND date(date) BETWEEN date(?) AND date(?)
        GROUP BY day ORDER BY day`, [from, to]),
      by_payment: db.all(`
        SELECT payment_method, COUNT(*) AS invoices, COALESCE(SUM(total),0) AS total
        FROM sales WHERE status='completed' AND date(date) BETWEEN date(?) AND date(?)
        GROUP BY payment_method`, [from, to]),
      by_user: db.all(`
        SELECT u.full_name AS user_name, COUNT(*) AS invoices, COALESCE(SUM(s.total),0) AS total,
               COALESCE(SUM(s.profit),0) AS profit
        FROM sales s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status='completed' AND date(s.date) BETWEEN date(?) AND date(?)
        GROUP BY s.user_id ORDER BY total DESC`, [from, to]),
      top_products: db.all(`
        SELECT p.name, p.unit, SUM(si.qty - si.returned_qty) AS qty,
               ROUND(SUM((si.qty - si.returned_qty) * si.unit_price),2) AS revenue,
               ROUND(SUM((si.qty - si.returned_qty) * (si.unit_price - si.unit_cost)),2) AS profit
        FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
        WHERE date(s.date) BETWEEN date(?) AND date(?)
        GROUP BY si.product_id HAVING qty > 0 ORDER BY revenue DESC LIMIT 25`, [from, to]),
      top_customers: db.all(`
        SELECT c.name, COUNT(*) AS invoices, COALESCE(SUM(s.total),0) AS total
        FROM sales s JOIN customers c ON c.id = s.customer_id
        WHERE s.status='completed' AND date(s.date) BETWEEN date(?) AND date(?)
        GROUP BY s.customer_id ORDER BY total DESC LIMIT 10`, [from, to]),
    });
  }),
);

/** تقرير المشتريات */
router.get(
  '/purchases',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const { from, to } = period(req);
    res.json({
      from, to,
      summary: db.get(`
        SELECT COUNT(*) AS invoices, COALESCE(SUM(total),0) AS total,
               COALESCE(SUM(paid),0) AS paid, COALESCE(SUM(total - paid),0) AS due
        FROM purchases WHERE status='posted' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]),
      by_day: db.all(`
        SELECT date(date) AS day, COUNT(*) AS invoices, COALESCE(SUM(total),0) AS total
        FROM purchases WHERE status='posted' AND date(date) BETWEEN date(?) AND date(?)
        GROUP BY day ORDER BY day`, [from, to]),
      by_supplier: db.all(`
        SELECT COALESCE(s.name,'بدون مورد') AS supplier, COUNT(*) AS invoices,
               COALESCE(SUM(p.total),0) AS total, COALESCE(SUM(p.total - p.paid),0) AS due
        FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.status='posted' AND date(p.date) BETWEEN date(?) AND date(?)
        GROUP BY p.supplier_id ORDER BY total DESC`, [from, to]),
      top_products: db.all(`
        SELECT pr.name, SUM(pi.qty + pi.bonus_qty) AS qty, ROUND(SUM(pi.total),2) AS total
        FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id JOIN products pr ON pr.id = pi.product_id
        WHERE p.status='posted' AND date(p.date) BETWEEN date(?) AND date(?)
        GROUP BY pi.product_id ORDER BY total DESC LIMIT 25`, [from, to]),
    });
  }),
);

/** تقييم المخزون */
router.get(
  '/inventory-valuation',
  requireRole('manager', 'pharmacist'),
  wrap((req, res) => {
    const data = db.all(`
      SELECT p.id, p.name, p.unit, COALESCE(NULLIF(p.category,''),'غير مصنف') AS category,
             COALESCE(SUM(b.qty_available),0) AS qty,
             ROUND(COALESCE(SUM(b.qty_available * b.cost_price),0),2) AS cost_value,
             ROUND(COALESCE(SUM(b.qty_available * CASE WHEN b.sale_price > 0 THEN b.sale_price ELSE p.sale_price END),0),2) AS sale_value
      FROM products p LEFT JOIN batches b ON b.product_id = p.id
      WHERE p.active = 1 GROUP BY p.id HAVING qty > 0 ORDER BY cost_value DESC`);
    const byCategory = db.all(`
      SELECT COALESCE(NULLIF(p.category,''),'غير مصنف') AS category,
             ROUND(COALESCE(SUM(b.qty_available * b.cost_price),0),2) AS cost_value,
             COUNT(DISTINCT p.id) AS products
      FROM products p LEFT JOIN batches b ON b.product_id = p.id
      WHERE p.active = 1 GROUP BY category ORDER BY cost_value DESC`);
    const totals = data.reduce((acc, r) => ({
      cost_value: round(acc.cost_value + r.cost_value),
      sale_value: round(acc.sale_value + r.sale_value),
      qty: round(acc.qty + r.qty),
    }), { cost_value: 0, sale_value: 0, qty: 0 });
    res.json({ data, by_category: byCategory, totals: { ...totals, expected_profit: round(totals.sale_value - totals.cost_value) } });
  }),
);

export default router;
