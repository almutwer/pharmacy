# 04 - Installation Guide for Windows

## المتطلبات

- Windows 10 أو Windows 11
- Python 3.10 أو أحدث
- طابعة حرارية اختيارية
- ماسح باركود USB اختياري، يعمل كلوحة مفاتيح

## خطوات التشغيل للمطور أو مسؤول النظام

افتح PowerShell داخل مجلد المشروع:

```powershell
cd pharmacy
```

أنشئ بيئة Python:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

ثبت المتطلبات:

```powershell
pip install -r requirements.txt
```

أنشئ قاعدة البيانات:

```powershell
python scripts\init_db.py
```

اختياري: تحميل بيانات تجريبية:

```powershell
python scripts\load_sample_data.py
```

شغل التطبيق:

```powershell
python scripts\run_desktop.py
```

## مسار قاعدة البيانات

افتراضياً:

```text
%APPDATA%\LocalPharmacy\pharmacy.db
```

لتحديد مسار مختلف:

```powershell
$env:PHARMACY_DB_PATH="D:\PharmacyData\pharmacy.db"
python scripts\run_desktop.py
```

## بناء ملف EXE اختياري

يمكن استخدام PyInstaller:

```powershell
pip install pyinstaller
pyinstaller --name PharmacyDesktop --windowed --paths src scripts\run_desktop.py
```

بعد البناء يظهر الملف داخل:

```text
dist\PharmacyDesktop\PharmacyDesktop.exe
```

> ملاحظة: يجب نسخ مجلد `db` بجانب التطبيق أو تضمينه في PyInstaller عبر `--add-data`.

مثال:

```powershell
pyinstaller --name PharmacyDesktop --windowed --paths src --add-data "db;db" scripts\run_desktop.py
```

## الطابعة الحرارية

- إذا كانت الطابعة معرفة في Windows، يمكن ضبط اسمها داخل الإعدادات لاحقاً.
- إن لم تتوفر الطباعة، يحفظ النظام الإيصال كملف نصي في:

```text
%APPDATA%\LocalPharmacy\receipts\
```

## النسخ الاحتياطي

من شاشة الإعدادات:

1. اضغط `إنشاء نسخة احتياطية الآن`.
2. أو اضغط `نسخ إلى USB` واختر محرك الفلاش.

النسخ تحفظ بصيغة:

```text
pharmacy_YYYY-MM-DD_HH-MM-SS.db
```

