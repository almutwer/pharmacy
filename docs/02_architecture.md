# 02 - Application Architecture

التطبيق Desktop محلي بالكامل على جهاز Windows واحد، ولا يحتاج إلى إنترنت في العمليات الأساسية.

## التقنية المختارة

تم اختيار **Python + PyQt6 + SQLite** لأنها أبسط للتشغيل المحلي، وأسهل للنسخ الاحتياطي، ولا تحتاج إلى خادم أو Cloud.

## الرسم المعماري

```mermaid
flowchart RL
    User[الصيدلي] --> UI[PyQt6 Arabic RTL Desktop UI]
    Scanner[USB Barcode Scanner\nKeyboard Input] --> UI
    UI --> Services[Application Services]

    Services --> Catalog[CatalogImportService\nاستيراد دليل الأدوية]
    Services --> Inventory[InventoryService\nإدارة المخزون]
    Services --> Sales[SalesService\nنقطة البيع والفواتير]
    Services --> Reports[ReportsService\nالتقارير]
    Services --> Backup[BackupService\nالنسخ الاحتياطي]
    Services --> Printer[ReceiptPrinter\nESC/POS / Windows Print]

    Catalog --> SQLite[(SQLite pharmacy.db)]
    Inventory --> SQLite
    Sales --> SQLite
    Reports --> SQLite
    Backup --> BackupFolder[Backup Folder / USB]
    Printer --> Thermal[طابعة حرارية]

    SQLite --> TablesA[Layer A: medicines_catalog]
    SQLite --> TablesB[Layer B: pharmacy_inventory]
    SQLite --> TablesC[Layer C: sales + sale_items]
```

## المجلدات الرئيسية

```text
db/
  schema.sql              # قاعدة البيانات والجداول والـ triggers
  sample_data.sql          # بيانات تجريبية
src/pharmacy_app/
  database.py              # تهيئة SQLite والمعاملات
  catalog_import.py        # استيراد دليل الأدوية
  inventory.py             # إضافة وتعديل المخزون
  sales.py                 # POS والفواتير وخصم المخزون
  reports.py               # التقارير
  backup.py                # النسخ الاحتياطي والاسترجاع
  receipt_printer.py       # إيصالات حرارية أو ملف نصي
  ui/main_window.py        # واجهة عربية RTL
scripts/
  init_db.py
  load_sample_data.py
  run_desktop.py
docs/
  ملفات التوثيق ودليل المستخدم
```

## مسار البيانات على Windows

افتراضياً يتم حفظ قاعدة البيانات في:

```text
%APPDATA%\LocalPharmacy\pharmacy.db
```

والنسخ الاحتياطية في:

```text
%APPDATA%\LocalPharmacy\backups\
```

يمكن تغيير المسار بمتغيرات البيئة:

```text
PHARMACY_DB_PATH
PHARMACY_DATA_DIR
PHARMACY_BACKUP_DIR
```

## تدفق عملية البيع

```mermaid
sequenceDiagram
    participant UI as POS Screen
    participant Sales as SalesService
    participant DB as SQLite
    participant Printer as ReceiptPrinter

    UI->>Sales: complete_sale(cart)
    Sales->>DB: BEGIN IMMEDIATE
    Sales->>DB: increment invoice_sequences
    Sales->>DB: INSERT sales
    loop لكل صنف
        Sales->>DB: INSERT sale_items
        DB->>DB: Trigger validates stock/expiry
        DB->>DB: Trigger deducts pharmacy_inventory
        DB->>DB: Trigger inserts stock_movements/audit_log
    end
    Sales->>DB: COMMIT
    UI->>Printer: print/save receipt
```

## قواعد السلامة

- لا بيع بدون مخزون فعلي إلا `one_off` اختياري وموسوم بوضوح.
- لا بيع لدواء منتهي الصلاحية.
- لا كمية سالبة.
- لا حذف نهائي للجداول الأساسية.
- كل عملية بيع في Transaction واحدة.
- سجل تدقيق لكل العمليات الحساسة.

