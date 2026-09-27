@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =============================================
echo   نظام إدارة الصيدلية - تشغيل سطح المكتب
echo =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js غير مثبت أو غير موجود في PATH.
  echo نزّل Node.js LTS من https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm غير موجود. أعد تثبيت Node.js.
  pause
  exit /b 1
)

if not exist package.json (
  echo لم يتم العثور على package.json. تأكد أنك داخل مجلد المشروع الصحيح.
  pause
  exit /b 1
)

if not exist node_modules (
  echo جاري تثبيت الحزم لأول مرة...
  call npm install
  if errorlevel 1 goto error
)

echo جاري بناء وتشغيل التطبيق...
call npm run desktop
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo حدث خطأ أثناء التشغيل. انسخ الرسالة الظاهرة في هذه النافذة وأرسلها للمطور.
pause
exit /b 1
