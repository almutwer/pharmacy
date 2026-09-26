from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .config import receipt_dir


class ReceiptPrinter:
    """Receipt output with a safe file fallback and optional Windows raw printing.

    Arabic thermal printing varies by printer firmware.  The app generates a
    readable text receipt and tries Windows printing when pywin32 is available;
    otherwise it saves the receipt in the local receipts folder.
    """

    def __init__(self, printer_name: str | None = None, paper_width: int = 42) -> None:
        self.printer_name = printer_name
        self.paper_width = paper_width

    def format_receipt(self, receipt: dict[str, Any], pharmacy_name: str = "صيدلية محلية") -> str:
        sale = receipt["sale"]
        items = receipt["items"]
        width = self.paper_width
        lines = [
            pharmacy_name.center(width),
            "=" * width,
            f"فاتورة: {sale['invoice_number']}",
            f"التاريخ: {sale['sale_date']}",
            f"الدفع: {_payment_ar(sale['payment_method'])}",
            "-" * width,
        ]
        for item in items:
            name = str(item["medicine_name"])
            qty = int(item["quantity_sold"])
            unit = float(item["unit_price"])
            subtotal = float(item["subtotal"])
            lines.append(name[:width])
            lines.append(f"  {qty} x {unit:.2f} = {subtotal:.2f}")
        lines.extend(
            [
                "-" * width,
                f"المجموع: {float(sale['total_amount']):.2f}",
                f"الخصم: {float(sale['discount_amount']):.2f}",
                f"الضريبة: {float(sale['tax_amount']):.2f}",
                f"الإجمالي: {float(sale['final_amount']):.2f}",
                "=" * width,
                "شكراً لزيارتكم".center(width),
                "",
                "",
            ]
        )
        return "\n".join(lines)

    def save_receipt(self, receipt_text: str, invoice_number: str) -> Path:
        safe_invoice = invoice_number.replace("/", "-")
        path = receipt_dir() / f"receipt_{safe_invoice}_{datetime.now().strftime('%H%M%S')}.txt"
        path.write_text(receipt_text, encoding="utf-8")
        return path

    def print_receipt(self, receipt: dict[str, Any], pharmacy_name: str = "صيدلية محلية") -> Path | None:
        text = self.format_receipt(receipt, pharmacy_name=pharmacy_name)
        invoice = receipt["sale"]["invoice_number"]
        saved = self.save_receipt(text, invoice)
        if self.printer_name:
            try:
                self._windows_raw_print(text)
            except Exception:
                # Keep file fallback. GUI can show saved path.
                return saved
        return saved

    def _windows_raw_print(self, text: str) -> None:
        try:
            import win32print  # type: ignore
        except ImportError as exc:
            raise RuntimeError("pywin32 is required for Windows raw printing") from exc
        printer = self.printer_name or win32print.GetDefaultPrinter()
        handle = win32print.OpenPrinter(printer)
        try:
            job = win32print.StartDocPrinter(handle, 1, ("Pharmacy Receipt", None, "RAW"))
            try:
                win32print.StartPagePrinter(handle)
                payload = text.encode("cp864", errors="replace") + b"\n\n\x1d\x56\x00"
                win32print.WritePrinter(handle, payload)
                win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
        finally:
            win32print.ClosePrinter(handle)


def _payment_ar(method: str) -> str:
    return {
        "cash": "كاش",
        "card": "فيزا/بطاقة",
        "insurance": "تأمين",
        "mixed": "مختلط",
    }.get(method, method)
