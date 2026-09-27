@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تشغيل وضع التشخيص...
echo.
call npm run build
if errorlevel 1 goto error
call npx electron --trace-warnings --enable-logging dist-electron/main.js
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo فشل وضع التشخيص. انسخ كل النص الظاهر في هذه النافذة وأرسله للمطور.
pause
exit /b 1
