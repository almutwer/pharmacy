from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from .database import Database


@dataclass(frozen=True)
class CartItem:
    inventory_id: int | None
    catalog_id: int | None
    medicine_name: str
    quantity: int
    unit_price: float
    unit_cost: float = 0.0
    batch_number: str | None = None
    expiry_date: str | None = None
    is_one_off: bool = False
    one_off_barcode: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class SaleResult:
    sale_id: int
    invoice_number: str
    final_amount: float


class SalesService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def search_pos(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        """POS search queries catalog first, then joins actual inventory status.

        Result rows may be catalog-only.  UI must show a clear warning when no
        inventory_id is available.
        """
        cleaned = query.strip()
        q = f"%{cleaned}%"
        rows = self.db.query_all(
            """
            SELECT
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
            WHERE mc.is_active = 1
              AND (mc.barcode = ? OR mc.trade_name LIKE ? OR mc.active_ingredient LIKE ?)
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
            LIMIT ?
            """,
            (cleaned, q, q, cleaned, limit),
        )
        return [dict(r) for r in rows]

    def best_inventory_for_catalog(self, catalog_id: int, requested_quantity: int = 1) -> dict[str, Any] | None:
        rows = self.db.query_all(
            """
            SELECT * FROM v_inventory_status
            WHERE catalog_id = ? AND quantity >= ? AND date(expiry_date) >= date('now')
            ORDER BY expiry_date ASC, quantity DESC
            LIMIT 1
            """,
            (catalog_id, requested_quantity),
        )
        return dict(rows[0]) if rows else None

    def build_cart_item_from_inventory(self, inventory_id: int, quantity: int = 1) -> CartItem:
        row = self.db.query_one(
            """
            SELECT vi.*, mc.trade_name, mc.strength
            FROM v_inventory_status vi
            JOIN medicines_catalog mc ON mc.id = vi.catalog_id
            WHERE vi.inventory_id = ?
            """,
            (inventory_id,),
        )
        if not row:
            raise ValueError("الصنف غير موجود في المخزون")
        item = dict(row)
        _validate_inventory_sale_state(item, quantity)
        name = f"{item['trade_name']} {item.get('strength') or ''}".strip()
        return CartItem(
            inventory_id=inventory_id,
            catalog_id=int(item["catalog_id"]),
            medicine_name=name,
            quantity=quantity,
            unit_price=float(item["selling_price"]),
            unit_cost=float(item["purchase_price"]),
            batch_number=item.get("batch_number"),
            expiry_date=item.get("expiry_date"),
        )

    def complete_sale(
        self,
        cart_items: list[CartItem],
        discount_amount: float = 0.0,
        tax_rate: float = 0.14,
        payment_method: str = "cash",
        customer_name: str | None = None,
        customer_phone: str | None = None,
        notes: str | None = None,
        username: str = "admin",
        sale_datetime: datetime | None = None,
    ) -> SaleResult:
        if not cart_items:
            raise ValueError("لا يمكن إتمام فاتورة فارغة")
        if payment_method not in {"cash", "card", "insurance", "mixed"}:
            raise ValueError("طريقة الدفع غير صحيحة")
        total = round(sum(item.quantity * item.unit_price for item in cart_items), 2)
        if discount_amount < 0:
            raise ValueError("الخصم لا يمكن أن يكون سالباً")
        if discount_amount > total:
            raise ValueError("الخصم أكبر من قيمة الفاتورة")
        taxable = max(total - discount_amount, 0)
        tax = round(taxable * tax_rate, 2)
        final = round(taxable + tax, 2)
        sale_dt = sale_datetime or datetime.now()
        year = sale_dt.year

        with self.db.transaction(username=username, screen="pos") as conn:
            conn.execute(
                "INSERT INTO invoice_sequences (invoice_year, last_number) VALUES (?, 0) ON CONFLICT(invoice_year) DO NOTHING",
                (year,),
            )
            conn.execute(
                "UPDATE invoice_sequences SET last_number = last_number + 1, updated_at = datetime('now') WHERE invoice_year = ?",
                (year,),
            )
            seq_row = conn.execute(
                "SELECT last_number FROM invoice_sequences WHERE invoice_year = ?",
                (year,),
            ).fetchone()
            sequence = int(seq_row["last_number"])
            invoice_number = f"INV-{year}-{sequence:06d}"

            sale_cur = conn.execute(
                """
                INSERT INTO sales (
                    invoice_number, invoice_year, invoice_sequence, sale_date,
                    total_amount, discount_amount, tax_amount, final_amount,
                    payment_method, customer_name, customer_phone, notes, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    invoice_number,
                    year,
                    sequence,
                    sale_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    total,
                    float(discount_amount),
                    tax,
                    final,
                    payment_method,
                    customer_name,
                    customer_phone,
                    notes,
                    username,
                ),
            )
            sale_id = int(sale_cur.lastrowid)

            for item in cart_items:
                if item.quantity <= 0:
                    raise ValueError("كمية الصنف يجب أن تكون أكبر من صفر")
                if item.unit_price < 0 or item.unit_cost < 0:
                    raise ValueError("الأسعار لا يمكن أن تكون سالبة")
                if not item.is_one_off:
                    inventory = conn.execute(
                        "SELECT * FROM pharmacy_inventory WHERE id = ? AND is_active = 1",
                        (item.inventory_id,),
                    ).fetchone()
                    if not inventory:
                        raise ValueError(f"الصنف غير موجود بالمخزون: {item.medicine_name}")
                    if int(inventory["quantity"]) < item.quantity:
                        raise ValueError(f"الكمية غير كافية: {item.medicine_name}")
                    if datetime.strptime(str(inventory["expiry_date"]), "%Y-%m-%d").date() < date.today():
                        raise ValueError(f"الدواء منتهي الصلاحية: {item.medicine_name}")
                conn.execute(
                    """
                    INSERT INTO sale_items (
                        sale_id, inventory_id, catalog_id, medicine_name, quantity_sold,
                        unit_price, unit_cost, subtotal, batch_number, expiry_date,
                        is_one_off, one_off_barcode, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sale_id,
                        item.inventory_id,
                        item.catalog_id,
                        item.medicine_name,
                        item.quantity,
                        item.unit_price,
                        item.unit_cost,
                        round(item.quantity * item.unit_price, 2),
                        item.batch_number,
                        item.expiry_date,
                        1 if item.is_one_off else 0,
                        item.one_off_barcode,
                        item.notes,
                    ),
                )
        return SaleResult(sale_id=sale_id, invoice_number=invoice_number, final_amount=final)

    def get_sale_receipt(self, sale_id: int) -> dict[str, Any]:
        sale = self.db.query_one("SELECT * FROM sales WHERE id = ?", (sale_id,))
        if not sale:
            raise ValueError("الفاتورة غير موجودة")
        items = self.db.query_all("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id", (sale_id,))
        return {"sale": dict(sale), "items": [dict(i) for i in items]}


def _validate_inventory_sale_state(item: dict[str, Any], requested_quantity: int) -> list[str]:
    warnings: list[str] = []
    if int(item["quantity"]) <= 0:
        raise ValueError("❌ نفدت الكمية")
    if int(item["quantity"]) < requested_quantity:
        raise ValueError("❌ الكمية المطلوبة أكبر من المتاح")
    expiry = datetime.strptime(str(item["expiry_date"]), "%Y-%m-%d").date()
    if expiry < date.today():
        raise ValueError("🚫 الدواء منتهي الصلاحية")
    if expiry <= date.today() + timedelta(days=30):
        warnings.append("⚠️ تحذير: ينتهي خلال 30 يوم")
    return warnings
