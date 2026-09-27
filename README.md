# Local Pharmacy Management Desktop Application

نظام إدارة صيدلية محلي بالكامل بواجهة عربية RTL. النسخة الأساسية الآن تعمل بواسطة:

```text
Electron + React + SQLite file via sql.js
```

لا يحتاج التطبيق إلى Cloud أو خادم أو إنترنت أثناء العمليات اليومية.

## الميزات الأساسية

- فصل صارم بين:
  - `medicines_catalog`: دليل الأدوية العام.
  - `pharmacy_inventory`: المخزون الفعلي للصيدلية.
  - `sales` / `sale_items`: المبيعات والفواتير.
- استيراد دليل الأدوية من CSV / Excel / JSON مع معاينة ومطابقة أعمدة.
- إضافة مخزون بالباركود مع السعر والدفعة والصلاحية والمورد.
- نقطة بيع POS بواجهة عربية كبيرة وواضحة.
- منع البيع عند انتهاء الصلاحية أو نفاد المخزون.
- معاملات SQLite آمنة للفواتير.
- أرقام فواتير متسلسلة: `INV-YYYY-NNNNNN`.
- تقارير عملية.
- نسخ احتياطي محلي ونسخ إلى USB.
- حفظ إيصالات نصية قابلة للطباعة.

## تشغيل نسخة Electron على Windows

ثبّت Node.js LTS من:

```text
https://nodejs.org
```

ثم داخل مجلد المشروع:

```cmd
npm install
npm run desktop
```

إذا أردت وضع التطوير مع Vite استخدم:

```cmd
npm run dev
```

لبناء ملف EXE:

```cmd
npm run dist
```

ستظهر ملفات Windows داخل:

```text
release\
```

## ملفات Electron المهمة

```text
package.json              # أوامر npm والبناء
index.html                # مدخل واجهة React
vite.config.ts            # إعداد Vite
electron/main.ts          # Electron main process
electron/preload.ts       # API آمن بين الواجهة وقاعدة البيانات
electron/services/        # خدمات SQLite والاستيراد والمبيعات والتقارير والنسخ
renderer/                 # واجهة React العربية RTL
```

## قاعدة البيانات

- `db/schema.sql` — الجداول والقيود والـ triggers.
- `db/sample_data.sql` — 50 دواء، 10 سجلات مخزون، 5 فواتير.

## التوثيق

- `docs/01_database_schema.md` — تصميم قاعدة البيانات.
- `docs/02_architecture.md` — مخطط المعمارية.
- `docs/03_wireframes.md` — Wireframes عربية.
- `docs/04_installation_windows.md` — دليل النسخة القديمة Python/PyQt6.
- `docs/05_user_manual_ar.md` — دليل المستخدم العربي.
- `docs/06_electron_windows.md` — دليل تشغيل Electron على Windows.
- `docs/07_troubleshooting_electron.md` — حل مشاكل شاشة بيضاء أو عدم فتح Electron.

## النسخة القديمة Python

تم الإبقاء على ملفات Python/PyQt6 كمرجع وبديل، لكن التشغيل الموصى به الآن هو Electron:

```cmd
npm install
npm run desktop
```

إذا أردت وضع التطوير مع Vite استخدم:

```cmd
npm run dev
```
