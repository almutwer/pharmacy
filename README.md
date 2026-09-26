# Local Pharmacy Management Desktop Application

نظام إدارة صيدلية محلي بالكامل بواجهة عربية RTL، يعمل على جهاز Windows واحد باستخدام Python + PyQt6 + SQLite.

## الميزات الأساسية

- فصل صارم بين:
  - `medicines_catalog`: دليل الأدوية العام.
  - `pharmacy_inventory`: المخزون الفعلي للصيدلية.
  - `sales` / `sale_items`: المبيعات والفواتير.
- استيراد دليل الأدوية من CSV / Excel / JSON مع معاينة ومطابقة أعمدة.
- إضافة مخزون بالباركود مع السعر والدفعة والصلاحية والمورد.
- POS بسيط باختصارات لوحة المفاتيح.
- منع البيع عند انتهاء الصلاحية أو نفاد المخزون.
- معاملات SQLite آمنة للفواتير.
- أرقام فواتير متسلسلة: `INV-YYYY-NNNNNN`.
- تقارير عملية.
- نسخ احتياطي محلي ونسخ إلى USB.
- حفظ/طباعة إيصالات حرارية.

## البدء السريع

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/load_sample_data.py   # اختياري
python scripts/run_desktop.py
```

## الملفات المهمة

- `db/schema.sql` — الجداول والقيود والـ triggers.
- `db/sample_data.sql` — 50 دواء، 10 سجلات مخزون، 5 فواتير.
- `docs/02_architecture.md` — مخطط المعمارية.
- `docs/03_wireframes.md` — Wireframes عربية.
- `docs/04_installation_windows.md` — دليل التثبيت على Windows.
- `docs/05_user_manual_ar.md` — دليل المستخدم العربي.

## تشغيل بدون واجهة لاختبار قاعدة البيانات

```bash
PYTHONPATH=src python -m pharmacy_app.main --init-db --db /tmp/pharmacy.db
PYTHONPATH=src python -m pharmacy_app.main --init-db --load-sample-data --db /tmp/pharmacy_sample.db
```

