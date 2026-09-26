from __future__ import annotations

from datetime import date
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QFont, QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QDialog,
    QDialogButtonBox,
    QInputDialog,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QDoubleSpinBox,
    QStackedWidget,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..backup import BackupService
from ..catalog_import import CATALOG_FIELDS, CatalogImportService
from ..database import Database
from ..file_readers import read_tabular_file
from ..inventory import InventoryService
from ..receipt_printer import ReceiptPrinter
from ..reports import ReportsService
from ..sales import CartItem, SalesService


class MainWindow(QMainWindow):
    def __init__(self, db: Database) -> None:
        super().__init__()
        self.db = db
        self.setWindowTitle("نظام إدارة الصيدلية المحلي")
        self.resize(1280, 820)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setFont(QFont("Arial", 13))

        self.catalog_service = CatalogImportService(db)
        self.inventory_service = InventoryService(db)
        self.sales_service = SalesService(db)
        self.reports_service = ReportsService(db)
        self.backup_service = BackupService(db)

        root = QWidget()
        layout = QVBoxLayout(root)
        self.warning_label = QLabel("")
        self.warning_label.setObjectName("backupWarning")
        self.warning_label.setVisible(False)
        layout.addWidget(self.warning_label)

        nav = QHBoxLayout()
        self.btn_pos = self._nav_button("💊 نقطة البيع", 0)
        self.btn_inventory = self._nav_button("📦 المخزون", 1)
        self.btn_reports = self._nav_button("📊 التقارير", 2)
        self.btn_settings = self._nav_button("⚙️ الإعدادات", 3)
        for btn in [self.btn_pos, self.btn_inventory, self.btn_reports, self.btn_settings]:
            nav.addWidget(btn)
        layout.addLayout(nav)

        self.stack = QStackedWidget()
        self.pos_page = POSPage(self.sales_service, self.inventory_service)
        self.inventory_page = InventoryPage(self.inventory_service)
        self.reports_page = ReportsPage(self.reports_service)
        self.settings_page = SettingsPage(self.catalog_service, self.backup_service, self.inventory_service)
        self.stack.addWidget(self.pos_page)
        self.stack.addWidget(self.inventory_page)
        self.stack.addWidget(self.reports_page)
        self.stack.addWidget(self.settings_page)
        layout.addWidget(self.stack)
        self.setCentralWidget(root)
        self._install_global_shortcuts()
        self._apply_style()
        self._check_backup_warning()

    def _nav_button(self, text: str, index: int) -> QPushButton:
        btn = QPushButton(text)
        btn.setMinimumHeight(68)
        btn.clicked.connect(lambda: self.stack.setCurrentIndex(index))
        return btn

    def _install_global_shortcuts(self) -> None:
        QShortcut(QKeySequence("F2"), self, activated=self.pos_page.focus_search)
        QShortcut(QKeySequence("F5"), self, activated=self.pos_page.new_invoice)
        QShortcut(QKeySequence("F8"), self, activated=self.pos_page.focus_discount)
        QShortcut(QKeySequence("F12"), self, activated=lambda: self.pos_page.complete_sale("cash"))
        QShortcut(QKeySequence("Esc"), self, activated=self.pos_page.cancel_invoice)
        QShortcut(QKeySequence("Delete"), self, activated=self.pos_page.remove_selected_item)

    def _check_backup_warning(self) -> None:
        if self.backup_service.needs_backup_warning():
            self.warning_label.setText("⚠️ لم يتم إنشاء نسخة احتياطية خلال آخر 3 أيام. الرجاء عمل نسخة احتياطية من الإعدادات.")
            self.warning_label.setVisible(True)

    def _apply_style(self) -> None:
        self.setStyleSheet(
            """
            QWidget { background: #ffffff; color: #111827; font-size: 16px; }
            QPushButton { font-size: 22px; font-weight: bold; padding: 14px; border-radius: 10px; background: #2563eb; color: white; }
            QPushButton:hover { background: #1d4ed8; }
            QLineEdit, QTextEdit, QComboBox, QSpinBox, QDoubleSpinBox { font-size: 18px; padding: 8px; border: 2px solid #94a3b8; border-radius: 8px; }
            QTableWidget { gridline-color: #cbd5e1; font-size: 16px; selection-background-color: #bfdbfe; }
            QHeaderView::section { background: #e2e8f0; color: #111827; font-size: 16px; font-weight: bold; padding: 8px; }
            QLabel#backupWarning { background: #fee2e2; color: #991b1b; font-size: 20px; padding: 12px; border-radius: 10px; }
            .danger { background: #dc2626; }
            """
        )


class POSPage(QWidget):
    def __init__(self, sales_service: SalesService, inventory_service: InventoryService) -> None:
        super().__init__()
        self.sales_service = sales_service
        self.inventory_service = inventory_service
        self.cart: list[CartItem] = []
        self._build_ui()
        self.new_invoice()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        top = QHBoxLayout()
        self.search = QLineEdit()
        self.search.setPlaceholderText("🔍 بحث بالاسم أو الباركود [F2]")
        self.search.returnPressed.connect(self.add_from_search)
        top.addWidget(self.search, 1)
        btn_add = QPushButton("إضافة")
        btn_add.clicked.connect(self.add_from_search)
        top.addWidget(btn_add)
        layout.addLayout(top)

        self.invoice_label = QLabel("الفاتورة الحالية")
        self.invoice_label.setStyleSheet("font-size: 22px; font-weight: bold;")
        layout.addWidget(self.invoice_label)

        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(["الصنف", "الكمية", "السعر", "الإجمالي", "الدفعة", "الصلاحية"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        layout.addWidget(self.table, 1)

        totals = QGridLayout()
        self.subtotal_label = QLabel("0.00")
        self.tax_label = QLabel("0.00")
        self.final_label = QLabel("0.00")
        self.discount = QDoubleSpinBox()
        self.discount.setMaximum(9999999)
        self.discount.setDecimals(2)
        self.discount.valueChanged.connect(self.refresh_cart)
        totals.addWidget(QLabel("المجموع:"), 0, 0)
        totals.addWidget(self.subtotal_label, 0, 1)
        totals.addWidget(QLabel("الخصم [F8]:"), 1, 0)
        totals.addWidget(self.discount, 1, 1)
        totals.addWidget(QLabel("الضريبة 14%:"), 2, 0)
        totals.addWidget(self.tax_label, 2, 1)
        totals.addWidget(QLabel("الإجمالي:"), 3, 0)
        self.final_label.setStyleSheet("font-size: 28px; font-weight: bold; color: #065f46;")
        totals.addWidget(self.final_label, 3, 1)
        layout.addLayout(totals)

        buttons = QHBoxLayout()
        for label, method in [("💵 كاش", "cash"), ("💳 فيزا", "card"), ("🏥 تأمين", "insurance")]:
            btn = QPushButton(label)
            btn.clicked.connect(lambda _=False, m=method: self.complete_sale(m))
            buttons.addWidget(btn)
        btn_print = QPushButton("🧾 إتمام وطباعة [F12]")
        btn_print.clicked.connect(lambda: self.complete_sale("cash"))
        buttons.addWidget(btn_print)
        layout.addLayout(buttons)

    def focus_search(self) -> None:
        self.search.setFocus()
        self.search.selectAll()

    def focus_discount(self) -> None:
        self.discount.setFocus()
        self.discount.selectAll()

    def new_invoice(self) -> None:
        self.cart = []
        self.discount.setValue(0)
        self.invoice_label.setText("الفاتورة الحالية: جديدة")
        self.refresh_cart()
        self.focus_search()

    def cancel_invoice(self) -> None:
        if self.cart and QMessageBox.question(self, "إلغاء", "هل تريد إلغاء الفاتورة الحالية؟") != QMessageBox.StandardButton.Yes:
            return
        self.new_invoice()

    def remove_selected_item(self) -> None:
        row = self.table.currentRow()
        if row >= 0 and row < len(self.cart):
            self.cart.pop(row)
            self.refresh_cart()

    def add_from_search(self) -> None:
        query = self.search.text().strip()
        if not query:
            return
        matches = self.sales_service.search_pos(query, limit=10)
        if not matches:
            self._offer_one_off_sale(query)
            return
        chosen = matches[0]
        if not chosen.get("inventory_id"):
            self._offer_quick_add_or_one_off(chosen)
            return
        if chosen.get("stock_status") == "expired":
            QMessageBox.critical(self, "منتهي الصلاحية", "🚫 الدواء منتهي الصلاحية ولا يمكن بيعه.")
            return
        if chosen.get("quantity", 0) <= 0:
            QMessageBox.critical(self, "نفدت الكمية", "❌ نفدت الكمية ولا يمكن البيع.")
            return
        if chosen.get("days_to_expiry") is not None and int(chosen["days_to_expiry"]) <= 30:
            QMessageBox.warning(self, "قرب انتهاء", "⚠️ تحذير: هذا الدواء ينتهي خلال 30 يوم.")
        try:
            item = self.sales_service.build_cart_item_from_inventory(int(chosen["inventory_id"]), 1)
        except Exception as exc:
            QMessageBox.critical(self, "خطأ", str(exc))
            return
        for idx, existing in enumerate(self.cart):
            if existing.inventory_id == item.inventory_id:
                self.cart[idx] = CartItem(
                    inventory_id=existing.inventory_id,
                    catalog_id=existing.catalog_id,
                    medicine_name=existing.medicine_name,
                    quantity=existing.quantity + 1,
                    unit_price=existing.unit_price,
                    unit_cost=existing.unit_cost,
                    batch_number=existing.batch_number,
                    expiry_date=existing.expiry_date,
                )
                break
        else:
            self.cart.append(item)
        self.search.clear()
        self.refresh_cart()


    def _offer_quick_add_or_one_off(self, catalog_row: dict) -> None:
        box = QMessageBox(self)
        box.setWindowTitle("غير موجود بالمخزون")
        box.setText("⚠️ الدواء مسجل في الدليل لكنه غير موجود بالمخزون")
        add_btn = box.addButton("إضافة للمخزون والبيع الآن", QMessageBox.ButtonRole.AcceptRole)
        one_off_btn = box.addButton("بيع بدون تسجيل مخزون", QMessageBox.ButtonRole.DestructiveRole)
        box.addButton("إلغاء", QMessageBox.ButtonRole.RejectRole)
        box.exec()
        clicked = box.clickedButton()
        if clicked == add_btn:
            dialog = QuickInventoryDialog(catalog_row, self)
            if dialog.exec() == QDialog.DialogCode.Accepted:
                try:
                    values = dialog.values()
                    result = self.inventory_service.add_stock(
                        catalog_id=int(catalog_row["catalog_id"]),
                        quantity=values["quantity"],
                        purchase_price=values["purchase_price"],
                        selling_price=values["selling_price"],
                        expiry_date=values["expiry_date"],
                        batch_number=values["batch_number"],
                        supplier_name=values["supplier_name"],
                        username="admin",
                        movement_type="quick_add",
                    )
                    item = self.sales_service.build_cart_item_from_inventory(result.inventory_id, 1)
                    self.cart.append(item)
                    self.search.clear()
                    self.refresh_cart()
                    QMessageBox.information(self, "تم", "تمت إضافة المخزون وإضافة صنف واحد للفاتورة")
                except Exception as exc:
                    QMessageBox.critical(self, "خطأ", str(exc))
        elif clicked == one_off_btn:
            self._add_one_off_from_catalog(catalog_row)

    def _offer_one_off_sale(self, barcode: str) -> None:
        box = QMessageBox(self)
        box.setWindowTitle("باركود غير معروف")
        box.setText("هذا الباركود غير موجود في دليل الأدوية ولا في المخزون. البيع بدون تسجيل مخزون غير موصى به.")
        one_off_btn = box.addButton("بيع بدون تسجيل مخزون", QMessageBox.ButtonRole.DestructiveRole)
        box.addButton("إلغاء", QMessageBox.ButtonRole.RejectRole)
        box.exec()
        if box.clickedButton() == one_off_btn:
            name, ok = QInputDialog.getText(self, "بيع استثنائي", "اسم الصنف:")
            if not ok or not name.strip():
                return
            price, ok = QInputDialog.getDouble(self, "بيع استثنائي", "سعر البيع:", 0.0, 0.0, 9999999.0, 2)
            if not ok:
                return
            self.cart.append(
                CartItem(
                    inventory_id=None,
                    catalog_id=None,
                    medicine_name=name.strip(),
                    quantity=1,
                    unit_price=float(price),
                    unit_cost=0.0,
                    is_one_off=True,
                    one_off_barcode=barcode,
                    notes="بيع استثنائي بدون تسجيل مخزون",
                )
            )
            self.search.clear()
            self.refresh_cart()

    def _add_one_off_from_catalog(self, catalog_row: dict) -> None:
        default_price = float(catalog_row.get("official_price") or 0)
        price, ok = QInputDialog.getDouble(self, "بيع بدون مخزون", "سعر البيع:", default_price, 0.0, 9999999.0, 2)
        if not ok:
            return
        name = f"{catalog_row.get('trade_name') or ''} {catalog_row.get('strength') or ''}".strip()
        self.cart.append(
            CartItem(
                inventory_id=None,
                catalog_id=int(catalog_row["catalog_id"]),
                medicine_name=name,
                quantity=1,
                unit_price=float(price),
                unit_cost=0.0,
                is_one_off=True,
                one_off_barcode=catalog_row.get("barcode"),
                notes="بيع استثنائي بدون تسجيل مخزون",
            )
        )
        self.search.clear()
        self.refresh_cart()

    def refresh_cart(self) -> None:
        self.table.setRowCount(len(self.cart))
        subtotal = 0.0
        for row, item in enumerate(self.cart):
            subtotal += item.quantity * item.unit_price
            values = [
                item.medicine_name,
                str(item.quantity),
                f"{item.unit_price:.2f}",
                f"{item.quantity * item.unit_price:.2f}",
                item.batch_number or "",
                item.expiry_date or "",
            ]
            for col, value in enumerate(values):
                self.table.setItem(row, col, QTableWidgetItem(value))
        discount = float(self.discount.value())
        tax = max(subtotal - discount, 0) * 0.14
        final = max(subtotal - discount, 0) + tax
        self.subtotal_label.setText(f"{subtotal:.2f}")
        self.tax_label.setText(f"{tax:.2f}")
        self.final_label.setText(f"{final:.2f}")

    def complete_sale(self, method: str) -> None:
        try:
            result = self.sales_service.complete_sale(
                self.cart,
                discount_amount=float(self.discount.value()),
                payment_method=method,
                username="admin",
            )
            receipt = self.sales_service.get_sale_receipt(result.sale_id)
            saved = ReceiptPrinter().print_receipt(receipt)
            QMessageBox.information(self, "تم البيع", f"تم حفظ الفاتورة {result.invoice_number}\nالإجمالي: {result.final_amount:.2f}\nتم حفظ الإيصال: {saved}")
            self.new_invoice()
        except Exception as exc:
            QMessageBox.critical(self, "تعذر إتمام البيع", str(exc))


class QuickInventoryDialog(QDialog):
    def __init__(self, catalog_row: dict, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("إضافة سريعة للمخزون")
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        layout = QFormLayout(self)
        info = QLabel(f"{catalog_row.get('trade_name')} - السعر الرسمي {catalog_row.get('official_price') or 0}")
        self.quantity = QSpinBox(); self.quantity.setMaximum(1000000); self.quantity.setValue(1)
        self.purchase = QDoubleSpinBox(); self.purchase.setMaximum(9999999); self.purchase.setDecimals(2)
        self.selling = QDoubleSpinBox(); self.selling.setMaximum(9999999); self.selling.setDecimals(2)
        self.selling.setValue(float(catalog_row.get("official_price") or 0))
        self.expiry = QLineEdit(); self.expiry.setPlaceholderText("YYYY-MM-DD")
        self.batch = QLineEdit()
        self.supplier = QLineEdit()
        layout.addRow("الدواء:", info)
        layout.addRow("الكمية المستلمة:", self.quantity)
        layout.addRow("سعر الشراء:", self.purchase)
        layout.addRow("سعر البيع:", self.selling)
        layout.addRow("تاريخ الانتهاء:", self.expiry)
        layout.addRow("رقم الدفعة:", self.batch)
        layout.addRow("المورد:", self.supplier)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

    def values(self) -> dict:
        return {
            "quantity": int(self.quantity.value()),
            "purchase_price": float(self.purchase.value()),
            "selling_price": float(self.selling.value()),
            "expiry_date": self.expiry.text().strip(),
            "batch_number": self.batch.text().strip() or None,
            "supplier_name": self.supplier.text().strip() or None,
        }


class InventoryPage(QWidget):
    def __init__(self, inventory_service: InventoryService) -> None:
        super().__init__()
        self.inventory_service = inventory_service
        self.current_catalog_id: int | None = None
        self._build_ui()
        self.refresh_table()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("إضافة مخزون جديد - ماسح الباركود")
        form = QFormLayout(group)
        self.barcode = QLineEdit()
        self.barcode.setPlaceholderText("امسح الباركود ثم اضغط Enter")
        self.barcode.returnPressed.connect(self.lookup_catalog)
        self.medicine_info = QLabel("لم يتم اختيار دواء")
        self.quantity = QSpinBox(); self.quantity.setMaximum(1000000); self.quantity.setValue(1)
        self.purchase = QDoubleSpinBox(); self.purchase.setMaximum(9999999); self.purchase.setDecimals(2)
        self.selling = QDoubleSpinBox(); self.selling.setMaximum(9999999); self.selling.setDecimals(2)
        self.expiry = QLineEdit(); self.expiry.setPlaceholderText("YYYY-MM-DD")
        self.batch = QLineEdit()
        self.supplier = QLineEdit()
        self.location = QLineEdit()
        form.addRow("الباركود:", self.barcode)
        form.addRow("بيانات الدواء:", self.medicine_info)
        form.addRow("الكمية:", self.quantity)
        form.addRow("سعر الشراء:", self.purchase)
        form.addRow("سعر البيع:", self.selling)
        form.addRow("تاريخ الانتهاء:", self.expiry)
        form.addRow("رقم الدفعة:", self.batch)
        form.addRow("المورد:", self.supplier)
        form.addRow("مكان التخزين:", self.location)
        btn_save = QPushButton("حفظ المخزون والعودة للباركود")
        btn_save.clicked.connect(self.save_stock)
        form.addRow(btn_save)
        layout.addWidget(group)

        bulk_row = QHBoxLayout()
        btn_bulk = QPushButton("استيراد فاتورة مورد Excel/CSV")
        btn_bulk.clicked.connect(self.bulk_import_supplier_invoice)
        bulk_row.addWidget(btn_bulk)
        layout.addLayout(bulk_row)

        self.table = QTableWidget(0, 8)
        self.table.setHorizontalHeaderLabels(["الدواء", "الباركود", "الدفعة", "الكمية", "سعر البيع", "الصلاحية", "الحالة", "المورد"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        layout.addWidget(self.table, 1)

    def lookup_catalog(self) -> None:
        catalog = self.inventory_service.find_catalog_by_barcode(self.barcode.text().strip())
        if not catalog:
            self.current_catalog_id = None
            QMessageBox.warning(self, "غير موجود", "الباركود غير موجود في دليل الأدوية. استورد دليل الأدوية أولاً.")
            return
        self.current_catalog_id = int(catalog["id"])
        self.medicine_info.setText(f"{catalog['trade_name']} - {catalog.get('strength') or ''} - السعر الرسمي {catalog.get('official_price') or 0}")
        if catalog.get("official_price") is not None:
            self.selling.setValue(float(catalog["official_price"]))
        self.quantity.setFocus()

    def save_stock(self) -> None:
        if not self.current_catalog_id:
            QMessageBox.warning(self, "اختر دواء", "امسح باركود صحيح أولاً")
            return
        try:
            result = self.inventory_service.add_stock(
                catalog_id=self.current_catalog_id,
                quantity=int(self.quantity.value()),
                purchase_price=float(self.purchase.value()),
                selling_price=float(self.selling.value()),
                expiry_date=self.expiry.text().strip(),
                batch_number=self.batch.text().strip() or None,
                supplier_name=self.supplier.text().strip() or None,
                storage_location=self.location.text().strip() or None,
                username="admin",
            )
            message = f"تمت إضافة المخزون بنجاح. رقم السجل: {result.inventory_id}"
            if result.warnings:
                message += "\n" + "\n".join(result.warnings)
            QMessageBox.information(self, "تم الحفظ", message)
            self.current_catalog_id = None
            self.barcode.clear(); self.medicine_info.setText("لم يتم اختيار دواء")
            self.quantity.setValue(1); self.purchase.setValue(0); self.selling.setValue(0)
            self.expiry.clear(); self.batch.clear(); self.supplier.clear(); self.location.clear()
            self.refresh_table(); self.barcode.setFocus()
        except Exception as exc:
            QMessageBox.critical(self, "خطأ", str(exc))


    def bulk_import_supplier_invoice(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "اختر ملف فاتورة المورد", "", "Data Files (*.xlsx *.xls *.csv *.json)")
        if not path:
            return
        try:
            headers, rows = read_tabular_file(path)
            mapping = _guess_inventory_mapping(headers)
            preview_lines = ["معاينة أول 5 صفوف:"]
            for row in rows[:5]:
                preview_lines.append(" | ".join(f"{h}: {row.get(h, '')}" for h in headers[:6]))
            preview_lines.append("")
            preview_lines.append("سيتم استخدام المطابقة التلقائية التالية:")
            for key, value in mapping.items():
                preview_lines.append(f"{key} -> {value}")
            if QMessageBox.question(self, "معاينة الاستيراد", "\n".join(preview_lines)) != QMessageBox.StandardButton.Yes:
                return
            supplier, ok = QInputDialog.getText(self, "المورد", "اسم المورد:")
            if not ok:
                return
            invoice, ok = QInputDialog.getText(self, "رقم الفاتورة", "رقم فاتورة المورد:")
            if not ok:
                return
            result = self.inventory_service.bulk_import_supplier_invoice(
                path,
                mapping,
                supplier_name=supplier.strip() or None,
                invoice_number=invoice.strip() or None,
                username="admin",
            )
            QMessageBox.information(
                self,
                "نتيجة الاستيراد",
                f"إجمالي الصفوف: {result.total_rows}\n"
                f"مطابقة: {result.matched_rows}\n"
                f"غير موجودة في الدليل: {result.unmatched_rows}\n"
                f"تمت إضافتها للمخزون: {result.inserted_rows}\n"
                f"أخطاء: {len(result.errors)}",
            )
            self.refresh_table()
        except Exception as exc:
            QMessageBox.critical(self, "فشل الاستيراد", str(exc))

    def refresh_table(self) -> None:
        rows = self.inventory_service.list_inventory()
        self.table.setRowCount(len(rows))
        for r, item in enumerate(rows):
            values = [
                item["trade_name"], item["barcode"], item.get("batch_number") or "",
                str(item["quantity"]), f"{float(item['selling_price']):.2f}", item["expiry_date"],
                _stock_status_ar(item["stock_status"]), item.get("supplier_name") or "",
            ]
            for c, value in enumerate(values):
                table_item = QTableWidgetItem(value)
                if item["stock_status"] in {"expired", "out_of_stock"}:
                    table_item.setBackground(Qt.GlobalColor.red)
                elif item["stock_status"] == "low_stock":
                    table_item.setBackground(Qt.GlobalColor.yellow)
                elif item["stock_status"] == "expiring_soon":
                    table_item.setBackground(Qt.GlobalColor.darkYellow)
                self.table.setItem(r, c, table_item)


class ReportsPage(QWidget):
    def __init__(self, reports_service: ReportsService) -> None:
        super().__init__()
        self.reports_service = reports_service
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        buttons = QHBoxLayout()
        for label, action in [
            ("تقرير المبيعات اليومي", self.show_daily),
            ("تقرير المخزون", self.show_inventory),
            ("تقرير الصلاحية 30/60/90", self.show_expiry),
            ("تقرير الأرباح", self.show_profit),
            ("تقرير الموردين", self.show_suppliers),
            ("الأصناف الراكدة", self.show_stagnant),
        ]:
            btn = QPushButton(label)
            btn.clicked.connect(action)
            buttons.addWidget(btn)
        layout.addLayout(buttons)
        self.output = QTextEdit()
        self.output.setReadOnly(True)
        layout.addWidget(self.output, 1)
        self.show_daily()

    def show_daily(self) -> None:
        report = self.reports_service.daily_sales()
        self.output.setPlainText(
            f"تقرير المبيعات اليومي: {report['sale_day']}\n"
            f"عدد الفواتير: {report['invoices_count']}\n"
            f"إجمالي البيع: {float(report['total_final_amount']):.2f}\n"
            f"إجمالي الأصناف: {report['total_items_sold']}\n"
            f"الربح الإجمالي: {float(report['gross_profit']):.2f}\n"
        )

    def show_inventory(self) -> None:
        lines = ["تقرير المخزون الحالي", "=" * 40]
        for item in self.reports_service.inventory_status():
            lines.append(f"{item['trade_name']} | كمية: {item['quantity']} | حالة: {_stock_status_ar(item['stock_status'])} | صلاحية: {item['expiry_date']}")
        self.output.setPlainText("\n".join(lines))

    def show_expiry(self) -> None:
        lines = ["تقرير الصلاحية", "=" * 40]
        for days in [30, 60, 90]:
            lines.append(f"\nينتهي خلال {days} يوم:")
            for item in self.reports_service.expiring(days):
                lines.append(f"- {item['trade_name']} | {item['quantity']} | {item['expiry_date']}")
        self.output.setPlainText("\n".join(lines))

    def show_profit(self) -> None:
        report = self.reports_service.profit()
        self.output.setPlainText(
            f"تقرير الأرباح من {report['start_date']} إلى {report['end_date']}\n"
            f"الإيراد: {float(report['revenue']):.2f}\n"
            f"التكلفة: {float(report['cost']):.2f}\n"
            f"صافي/مجمل الربح: {float(report['gross_profit']):.2f}\n"
            f"عدد الفواتير: {report['invoices_count']}"
        )

    def show_suppliers(self) -> None:
        lines = ["تقرير الموردين", "=" * 40]
        for item in self.reports_service.suppliers():
            lines.append(f"{item['supplier_name']} | دفعات: {item['batches_count']} | تكلفة المخزون الحالية: {float(item['current_stock_cost'] or 0):.2f}")
        self.output.setPlainText("\n".join(lines))

    def show_stagnant(self) -> None:
        lines = ["تقرير الأصناف الراكدة", "=" * 40]
        for item in self.reports_service.stagnant_items():
            last_sale = item.get("last_sale_date") or "لم يباع"
            lines.append(f"{item['trade_name']} | كمية: {item['quantity']} | آخر بيع: {last_sale}")
        self.output.setPlainText("\n".join(lines))


class SettingsPage(QWidget):
    def __init__(self, catalog_service: CatalogImportService, backup_service: BackupService, inventory_service: InventoryService) -> None:
        super().__init__()
        self.catalog_service = catalog_service
        self.backup_service = backup_service
        self.inventory_service = inventory_service
        self.catalog_file: Path | None = None
        self.catalog_rows: list[dict[str, str]] = []
        self._build_ui()

    def _build_ui(self) -> None:
        tabs = QTabWidget()
        tabs.addTab(self._catalog_import_tab(), "استيراد دليل الأدوية")
        tabs.addTab(self._backup_tab(), "النسخ الاحتياطي")
        layout = QVBoxLayout(self)
        layout.addWidget(tabs)

    def _catalog_import_tab(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        btn_file = QPushButton("استيراد دليل الأدوية - اختيار ملف")
        btn_file.clicked.connect(self.select_catalog_file)
        layout.addWidget(btn_file)
        self.preview_table = QTableWidget(0, 0)
        layout.addWidget(self.preview_table, 1)
        self.mapping_group = QGroupBox("مطابقة الأعمدة")
        self.mapping_layout = QFormLayout(self.mapping_group)
        self.mapping_boxes: dict[str, QComboBox] = {}
        for field in CATALOG_FIELDS:
            box = QComboBox()
            self.mapping_boxes[field] = box
            self.mapping_layout.addRow(_catalog_field_ar(field), box)
        layout.addWidget(self.mapping_group)
        btn_import = QPushButton("تأكيد الاستيراد")
        btn_import.clicked.connect(self.import_catalog)
        layout.addWidget(btn_import)
        return page

    def _backup_tab(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        btn_backup = QPushButton("إنشاء نسخة احتياطية الآن")
        btn_backup.clicked.connect(self.create_backup)
        layout.addWidget(btn_backup)
        btn_usb = QPushButton("نسخ إلى USB")
        btn_usb.clicked.connect(self.copy_usb)
        layout.addWidget(btn_usb)
        self.backup_output = QTextEdit(); self.backup_output.setReadOnly(True)
        layout.addWidget(self.backup_output, 1)
        self.refresh_backups()
        return page

    def select_catalog_file(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "اختر ملف دليل الأدوية", "", "Data Files (*.xlsx *.xls *.csv *.json)")
        if not path:
            return
        try:
            self.catalog_file = Path(path)
            preview = self.catalog_service.load_preview(path)
            _, rows = preview.headers, preview.rows
            self.catalog_rows = rows
            self.preview_table.setColumnCount(len(preview.headers))
            self.preview_table.setHorizontalHeaderLabels(preview.headers)
            self.preview_table.setRowCount(len(rows))
            for r, row in enumerate(rows):
                for c, header in enumerate(preview.headers):
                    self.preview_table.setItem(r, c, QTableWidgetItem(row.get(header, "")))
            for box in self.mapping_boxes.values():
                box.clear(); box.addItem("") ; box.addItems(preview.headers)
            self._guess_mapping(preview.headers)
            QMessageBox.information(self, "معاينة", f"تم تحميل المعاينة. إجمالي الصفوف: {preview.total_rows}")
        except Exception as exc:
            QMessageBox.critical(self, "خطأ في القراءة", str(exc))

    def _guess_mapping(self, headers: list[str]) -> None:
        guesses = {
            "barcode": ["barcode", "باركود", "الكود"],
            "trade_name": ["trade", "name", "اسم", "الاسم التجاري"],
            "active_ingredient": ["active", "ingredient", "مادة", "المادة الفعالة"],
            "official_price": ["price", "سعر", "السعر الرسمي"],
        }
        for field, patterns in guesses.items():
            box = self.mapping_boxes[field]
            for idx, header in enumerate(headers, start=1):
                if any(pattern.lower() in header.lower() for pattern in patterns):
                    box.setCurrentIndex(idx)
                    break

    def import_catalog(self) -> None:
        if not self.catalog_file:
            QMessageBox.warning(self, "لا يوجد ملف", "اختر ملفاً أولاً")
            return
        mapping = {field: box.currentText() for field, box in self.mapping_boxes.items() if box.currentText()}
        if "barcode" not in mapping or "trade_name" not in mapping:
            QMessageBox.warning(self, "مطابقة ناقصة", "يجب مطابقة الباركود والاسم التجاري")
            return
        try:
            result = self.catalog_service.import_catalog(self.catalog_file, mapping, username="admin")
            QMessageBox.information(
                self,
                "تم الاستيراد",
                f"تم استيراد {result.inserted_rows} دواء بنجاح\n"
                f"إجمالي الصفوف: {result.total_rows}\n"
                f"المكرر/المرفوض: {result.duplicate_rows}\n"
                f"ناقص بيانات: {result.missing_required_rows}",
            )
        except Exception as exc:
            QMessageBox.critical(self, "فشل الاستيراد", str(exc))

    def create_backup(self) -> None:
        try:
            path = self.backup_service.create_backup("manual", username="admin")
            QMessageBox.information(self, "تم", f"تم إنشاء النسخة الاحتياطية:\n{path}")
            self.refresh_backups()
        except Exception as exc:
            QMessageBox.critical(self, "خطأ", str(exc))

    def copy_usb(self) -> None:
        path = QFileDialog.getExistingDirectory(self, "اختر محرك USB أو مجلد النسخ")
        if not path:
            return
        try:
            copied = self.backup_service.copy_latest_to_usb(path, username="admin")
            QMessageBox.information(self, "تم", f"تم نسخ النسخة إلى:\n{copied}")
            self.refresh_backups()
        except Exception as exc:
            QMessageBox.critical(self, "خطأ", str(exc))

    def refresh_backups(self) -> None:
        if not hasattr(self, "backup_output"):
            return
        lines = ["النسخ الاحتياطية المتاحة:", "=" * 40]
        for item in self.backup_service.list_backups():
            lines.append(f"{item['backup_date']} | {item['backup_type']} | {item['backup_path']}")
        self.backup_output.setPlainText("\n".join(lines))


def _guess_inventory_mapping(headers: list[str]) -> dict[str, str]:
    patterns = {
        "barcode": ["barcode", "باركود", "الكود"],
        "quantity": ["quantity", "qty", "كمية", "الكمية"],
        "purchase_price": ["purchase", "cost", "شراء", "التكلفة"],
        "selling_price": ["selling", "sale", "بيع", "السعر"],
        "expiry_date": ["expiry", "expire", "انتهاء", "الصلاحية"],
        "batch_number": ["batch", "دفعة", "التشغيلة"],
    }
    mapping: dict[str, str] = {}
    lowered = [(header, header.lower()) for header in headers]
    for field, pats in patterns.items():
        for original, low in lowered:
            if any(p.lower() in low for p in pats):
                mapping[field] = original
                break
    required = {"barcode", "quantity", "purchase_price", "expiry_date"}
    missing = required - set(mapping)
    if missing:
        raise ValueError("تعذر مطابقة الأعمدة المطلوبة تلقائياً: " + ", ".join(sorted(missing)))
    return mapping


def _stock_status_ar(status: str) -> str:
    return {
        "in_stock": "متوفر",
        "low_stock": "كمية منخفضة",
        "out_of_stock": "نفد المخزون",
        "expired": "منتهي الصلاحية",
        "expiring_soon": "قرب الانتهاء",
    }.get(status, status)


def _catalog_field_ar(field: str) -> str:
    return {
        "barcode": "الباركود",
        "trade_name": "الاسم التجاري",
        "active_ingredient": "المادة الفعالة",
        "dosage_form": "الشكل الدوائي",
        "strength": "التركيز",
        "manufacturer": "الشركة المصنعة",
        "official_price": "السعر الرسمي",
        "category": "التصنيف",
        "requires_prescription": "يحتاج روشتة؟",
        "is_active": "نشط؟",
    }.get(field, field)


def run_app(db: Database) -> int:
    import sys

    app = QApplication(sys.argv)
    app.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
    window = MainWindow(db)
    window.show()
    return app.exec()
