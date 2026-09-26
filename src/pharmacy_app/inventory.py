from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from .database import Database
from .file_readers import read_tabular_file


@dataclass(frozen=True)
class InventoryAddResult:
    inventory_id: int
    warnings: list[str]


@dataclass(frozen=True)
class BulkInventoryResult:
    import_job_id: int
    total_rows: int
    matched_rows: int
    unmatched_rows: int
    inserted_rows: int
    errors: list[str]


class InventoryService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def find_catalog_by_barcode(self, barcode: str) -> dict[str, Any] | None:
        row = self.db.query_one(
            "SELECT * FROM medicines_catalog WHERE barcode = ? AND is_active = 1",
            (barcode.strip(),),
        )
        return dict(row) if row else None

    def search_inventory(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        q = f"%{query.strip()}%"
        rows = self.db.query_all(
            """
            SELECT * FROM v_inventory_status
            WHERE barcode = ? OR trade_name LIKE ? OR active_ingredient LIKE ? OR batch_number LIKE ?
            ORDER BY trade_name, expiry_date
            LIMIT ?
            """,
            (query.strip(), q, q, q, limit),
        )
        return [dict(r) for r in rows]

    def list_inventory(self, limit: int = 500) -> list[dict[str, Any]]:
        rows = self.db.query_all(
            "SELECT * FROM v_inventory_status ORDER BY stock_status DESC, trade_name LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    def add_stock(
        self,
        catalog_id: int,
        quantity: int,
        purchase_price: float,
        selling_price: float,
        expiry_date: str,
        batch_number: str | None = None,
        min_stock_alert: int = 5,
        storage_location: str | None = None,
        supplier_name: str | None = None,
        date_received: str | None = None,
        username: str = "admin",
        movement_type: str = "receive",
        reference_number: str | None = None,
    ) -> InventoryAddResult:
        warnings = _validate_inventory_values(quantity, purchase_price, selling_price, expiry_date, min_stock_alert)
        received = date_received or date.today().isoformat()
        with self.db.transaction(username=username, screen="inventory_add") as conn:
            catalog = conn.execute("SELECT id FROM medicines_catalog WHERE id = ? AND is_active = 1", (catalog_id,)).fetchone()
            if not catalog:
                raise ValueError("الدواء غير موجود في دليل الأدوية")
            cur = conn.execute(
                """
                INSERT INTO pharmacy_inventory (
                    catalog_id, batch_number, quantity, min_stock_alert, purchase_price,
                    selling_price, expiry_date, storage_location, supplier_name,
                    date_received, created_by, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    catalog_id,
                    batch_number,
                    int(quantity),
                    int(min_stock_alert),
                    float(purchase_price),
                    float(selling_price),
                    expiry_date,
                    storage_location,
                    supplier_name,
                    received,
                    username,
                    username,
                ),
            )
            inventory_id = int(cur.lastrowid)
            conn.execute(
                """
                INSERT INTO stock_movements (
                    inventory_id, catalog_id, movement_type, quantity_change,
                    quantity_before, quantity_after, reference_number, reason, created_by
                ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
                """,
                (
                    inventory_id,
                    catalog_id,
                    movement_type,
                    int(quantity),
                    int(quantity),
                    reference_number,
                    "Initial stock receipt" if movement_type == "receive" else "Quick add",
                    username,
                ),
            )
        return InventoryAddResult(inventory_id=inventory_id, warnings=warnings)

    def adjust_stock(
        self,
        inventory_id: int,
        new_quantity: int,
        reason: str,
        username: str = "admin",
    ) -> None:
        if new_quantity < 0:
            raise ValueError("لا يمكن أن تكون الكمية سالبة")
        with self.db.transaction(username=username, screen="inventory_adjust") as conn:
            item = conn.execute(
                "SELECT id, catalog_id, quantity FROM pharmacy_inventory WHERE id = ? AND is_active = 1",
                (inventory_id,),
            ).fetchone()
            if not item:
                raise ValueError("سجل المخزون غير موجود")
            old_quantity = int(item["quantity"])
            change = int(new_quantity) - old_quantity
            if change == 0:
                return
            conn.execute(
                """
                UPDATE pharmacy_inventory
                SET quantity = ?, updated_by = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (int(new_quantity), username, inventory_id),
            )
            conn.execute(
                """
                INSERT INTO stock_movements (
                    inventory_id, catalog_id, movement_type, quantity_change,
                    quantity_before, quantity_after, reason, created_by
                ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)
                """,
                (inventory_id, int(item["catalog_id"]), change, old_quantity, int(new_quantity), reason, username),
            )

    def bulk_import_supplier_invoice(
        self,
        file_path: str | Path,
        column_mapping: dict[str, str],
        supplier_name: str | None = None,
        invoice_number: str | None = None,
        username: str = "admin",
    ) -> BulkInventoryResult:
        path = Path(file_path)
        headers, rows = read_tabular_file(path)
        file_type = path.suffix.lower().replace(".", "")
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        errors: list[str] = []
        matched = 0
        unmatched = 0
        inserted = 0

        with self.db.transaction(username=username, screen="inventory_bulk_import") as conn:
            cur = conn.execute(
                """
                INSERT INTO inventory_import_jobs (
                    supplier_name, invoice_number, file_name, file_type, file_hash,
                    mapping_json, total_rows, status, imported_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'validated', ?)
                """,
                (
                    supplier_name,
                    invoice_number,
                    path.name,
                    file_type,
                    file_hash,
                    json.dumps(column_mapping, ensure_ascii=False),
                    len(rows),
                    username,
                ),
            )
            job_id = int(cur.lastrowid)
            for row_number, row in enumerate(rows, start=2):
                try:
                    barcode = row.get(column_mapping.get("barcode", ""), "").strip()
                    if not barcode:
                        raise ValueError("missing_barcode")
                    catalog = conn.execute(
                        "SELECT * FROM medicines_catalog WHERE barcode = ? AND is_active = 1",
                        (barcode,),
                    ).fetchone()
                    if not catalog:
                        unmatched += 1
                        message = f"صف {row_number}: الدواء غير موجود في الدليل: {barcode}"
                        errors.append(message)
                        conn.execute(
                            """
                            INSERT INTO inventory_import_errors (import_job_id, row_number, barcode, error_type, error_message, raw_row_json)
                            VALUES (?, ?, ?, 'medicine_not_found_in_catalog', ?, ?)
                            """,
                            (job_id, row_number, barcode, message, json.dumps(row, ensure_ascii=False)),
                        )
                        continue
                    matched += 1
                    qty = int(float(row.get(column_mapping.get("quantity", ""), "0") or 0))
                    purchase = float(str(row.get(column_mapping.get("purchase_price", ""), "0") or 0).replace(",", "."))
                    selling_raw = row.get(column_mapping.get("selling_price", ""), "")
                    selling = float(str(selling_raw or catalog["official_price"] or 0).replace(",", "."))
                    expiry = row.get(column_mapping.get("expiry_date", ""), "").strip()
                    batch = row.get(column_mapping.get("batch_number", ""), "").strip() or None
                    _validate_inventory_values(qty, purchase, selling, expiry, 5)
                    cur2 = conn.execute(
                        """
                        INSERT INTO pharmacy_inventory (
                            catalog_id, batch_number, quantity, purchase_price, selling_price,
                            expiry_date, supplier_name, date_received, source_import_id,
                            created_by, updated_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?)
                        """,
                        (catalog["id"], batch, qty, purchase, selling, expiry, supplier_name, job_id, username, username),
                    )
                    inventory_id = int(cur2.lastrowid)
                    conn.execute(
                        """
                        INSERT INTO stock_movements (
                            inventory_id, catalog_id, movement_type, quantity_change,
                            quantity_before, quantity_after, reference_number, reason, created_by
                        ) VALUES (?, ?, 'receive', ?, 0, ?, ?, 'Supplier invoice bulk import', ?)
                        """,
                        (inventory_id, int(catalog["id"]), qty, qty, invoice_number, username),
                    )
                    inserted += 1
                except Exception as exc:
                    message = f"صف {row_number}: {exc}"
                    errors.append(message)
                    conn.execute(
                        """
                        INSERT INTO inventory_import_errors (import_job_id, row_number, barcode, error_type, error_message, raw_row_json)
                        VALUES (?, ?, ?, 'unknown_error', ?, ?)
                        """,
                        (
                            job_id,
                            row_number,
                            row.get(column_mapping.get("barcode", ""), ""),
                            message,
                            json.dumps(row, ensure_ascii=False),
                        ),
                    )
            conn.execute(
                """
                UPDATE inventory_import_jobs
                SET matched_rows = ?, unmatched_rows = ?, inserted_inventory_rows = ?,
                    status = ?, finished_at = datetime('now')
                WHERE id = ?
                """,
                (matched, unmatched, inserted, "imported" if inserted else "failed", job_id),
            )
        return BulkInventoryResult(job_id, len(rows), matched, unmatched, inserted, errors)


def _validate_inventory_values(
    quantity: int,
    purchase_price: float,
    selling_price: float,
    expiry_date: str,
    min_stock_alert: int,
) -> list[str]:
    warnings: list[str] = []
    if int(quantity) < 0:
        raise ValueError("لا يمكن أن تكون الكمية سالبة")
    if int(min_stock_alert) < 0:
        raise ValueError("حد التنبيه لا يمكن أن يكون سالباً")
    if float(purchase_price) < 0 or float(selling_price) < 0:
        raise ValueError("الأسعار لا يمكن أن تكون سالبة")
    try:
        exp = datetime.strptime(expiry_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("تاريخ الانتهاء يجب أن يكون بصيغة YYYY-MM-DD") from exc
    if exp < date.today():
        raise ValueError("لا يمكن إضافة دواء منتهي الصلاحية")
    if float(selling_price) < float(purchase_price):
        warnings.append("تحذير: سعر البيع أقل من سعر الشراء")
    return warnings
