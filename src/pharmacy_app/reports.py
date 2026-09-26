from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .database import Database


class ReportsService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def daily_sales(self, day: str | None = None) -> dict[str, Any]:
        day = day or date.today().isoformat()
        row = self.db.query_one("SELECT * FROM v_daily_sales WHERE sale_day = ?", (day,))
        if not row:
            return {
                "sale_day": day,
                "invoices_count": 0,
                "total_before_discount": 0.0,
                "total_discount": 0.0,
                "total_tax": 0.0,
                "total_final_amount": 0.0,
                "total_items_sold": 0,
                "gross_profit": 0.0,
            }
        return dict(row)

    def inventory_status(self) -> list[dict[str, Any]]:
        rows = self.db.query_all("SELECT * FROM v_inventory_status ORDER BY stock_status, trade_name")
        return [dict(r) for r in rows]

    def low_stock(self) -> list[dict[str, Any]]:
        rows = self.db.query_all(
            "SELECT * FROM v_inventory_status WHERE quantity <= min_stock_alert ORDER BY quantity ASC, trade_name"
        )
        return [dict(r) for r in rows]

    def expiring(self, days: int = 30) -> list[dict[str, Any]]:
        rows = self.db.query_all(
            """
            SELECT * FROM v_inventory_status
            WHERE days_to_expiry BETWEEN 0 AND ?
            ORDER BY expiry_date ASC, trade_name
            """,
            (days,),
        )
        return [dict(r) for r in rows]

    def profit(self, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
        start_date = start_date or date.today().replace(day=1).isoformat()
        end_date = end_date or date.today().isoformat()
        row = self.db.query_one(
            """
            SELECT
                COALESCE(SUM(s.final_amount), 0) AS revenue,
                COALESCE(SUM(si.unit_cost * si.quantity_sold), 0) AS cost,
                COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity_sold), 0) AS gross_profit,
                COUNT(DISTINCT s.id) AS invoices_count
            FROM sales s
            JOIN sale_items si ON si.sale_id = s.id
            WHERE s.status = 'completed'
              AND s.is_active = 1
              AND si.is_active = 1
              AND date(s.sale_date) BETWEEN ? AND ?
            """,
            (start_date, end_date),
        )
        result = dict(row) if row else {}
        result["start_date"] = start_date
        result["end_date"] = end_date
        return result

    def suppliers(self, start_date: str | None = None, end_date: str | None = None) -> list[dict[str, Any]]:
        start_date = start_date or (date.today() - timedelta(days=30)).isoformat()
        end_date = end_date or date.today().isoformat()
        rows = self.db.query_all(
            """
            SELECT
                COALESCE(supplier_name, 'غير محدد') AS supplier_name,
                COUNT(*) AS batches_count,
                SUM(quantity) AS current_quantity,
                SUM(quantity * purchase_price) AS current_stock_cost
            FROM pharmacy_inventory
            WHERE is_active = 1 AND date(date_received) BETWEEN ? AND ?
            GROUP BY COALESCE(supplier_name, 'غير محدد')
            ORDER BY current_stock_cost DESC
            """,
            (start_date, end_date),
        )
        return [dict(r) for r in rows]

    def stagnant_items(self, days: int = 90) -> list[dict[str, Any]]:
        rows = self.db.query_all(
            """
            SELECT * FROM v_stagnant_items
            WHERE last_sale_date IS NULL OR days_since_last_sale >= ?
            ORDER BY last_sale_date IS NULL DESC, days_since_last_sale DESC
            """,
            (days,),
        )
        return [dict(r) for r in rows]
