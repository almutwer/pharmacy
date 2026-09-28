# 🖥️ تطبيق سطح المكتب (Electron) — تحويل النظام إلى ملف EXE

هذا المجلد يحتوي كل ما يلزم لتشغيل نظام إدارة الصيدليات كتطبيق ويندوز مستقل
(بدون متصفح، وبدون أن يحتاج المستخدم إلى تشغيل أوامر أو تثبيت Node.js على جهاز الصيدلية).

---

## 📂 محتويات المجلد

| الملف | الوظيفة |
|---|---|
| `main.cjs` | العملية الرئيسية: تشغيل خادم النظام داخلياً، فتح النافذة، القوائم العربية، النسخ الاحتياطي |
| `splash.html` | شاشة الانتظار أثناء تهيئة قاعدة البيانات |
| `icon.ico` | أيقونة التطبيق لويندوز (8 أحجام: 16 → 256 بكسل) |
| `icon.png` | أيقونة بدقة 1024×1024 (لينكس / ماك) |

---

## ⚙️ كيف يعمل التطبيق؟

1. عند التشغيل يختار `main.cjs` منفذاً محلياً حراً (يبدأ بالمحاولة عند `43110`).
2. يضبط متغيرات البيئة ثم يشغّل خادم Express **داخل نفس العملية** (بدون نافذة أوامر سوداء):
   - `DATA_DIR` → مجلد بيانات المستخدم (خارج مجلد التثبيت، قابل للكتابة دائماً).
   - `JWT_SECRET` → مفتاح سري عشوائي يُولَّد مرة واحدة ويُحفظ في `app-config.json`.
   - `CLIENT_DIST` → واجهة React المبنية.
   - `HOST=127.0.0.1` → الخادم غير مرئي على الشبكة (أمان).
3. تظهر شاشة الانتظار، ويتم استطلاع `/api/health` حتى جاهزية الخادم فعلياً (لا مهلة ثابتة).
4. تُفتح النافذة الرئيسية على `http://127.0.0.1:<المنفذ>`.

### 📍 مكان حفظ البيانات
```
ويندوز:  %APPDATA%\Pharmacy System\data\pharmacy.db
لينكس:   ~/.config/Pharmacy System/data/pharmacy.db
ماك:     ~/Library/Application Support/Pharmacy System/data/pharmacy.db
```
> البيانات **لا تُحذف** عند إزالة البرنامج أو تحديثه.
> من داخل التطبيق: قائمة **أدوات ← فتح مجلد البيانات** أو **نسخ احتياطي سريع**.

---

## 🚀 خطوات إنشاء ملف EXE (على جهاز ويندوز)

### 1) المتطلبات لمرة واحدة
- **Node.js 20 أو أحدث** — <https://nodejs.org>
- **أدوات البناء** (لازمة لتجميع محرك قاعدة البيانات):
  ```powershell
  npm install --global --production windows-build-tools
  ```
  أو ثبّت *Visual Studio Build Tools* مع حزمة **Desktop development with C++** + **Python 3.x**.

### 2) تجهيز المشروع
```powershell
cd pharmacy
npm install
npm run app:setup      # تثبيت better-sqlite3 وإعادة بنائه ليعمل داخل Electron
```

> **لماذا `app:setup`؟**
> وضع التطوير يستخدم محرك `node:sqlite` المدمج في Node.js (يحتاج راية تشغيل خاصة).
> داخل Electron لا يمكن تمرير تلك الراية، لذلك نستخدم `better-sqlite3`.
> ملف `server/src/lib/db.js` يختار المحرك المتاح تلقائياً — لا حاجة لتعديل أي كود.

### 3) تجربة التطبيق قبل التغليف
```powershell
npm run app:start
```
يبني الواجهة ثم يفتح نافذة التطبيق مباشرة.

### 4) إنشاء ملفات التثبيت
```powershell
npm run app:build             # مثبّت NSIS + نسخة محمولة (Portable)
npm run app:build:portable    # نسخة محمولة فقط (ملف EXE واحد)
npm run app:dir               # مجلد غير مضغوط للاختبار السريع
```

### 5) المخرجات — مجلد `release/`
| الملف | الوصف |
|---|---|
| `PharmacySystem-1.0.0-x64.exe` | **المثبّت**: يختار المستخدم مجلد التثبيت، وينشئ اختصاراً على سطح المكتب وقائمة ابدأ |
| `PharmacySystem-1.0.0-portable.exe` | **نسخة محمولة**: تعمل من فلاشة بدون تثبيت |
| `win-unpacked/` | نسخة مفكوكة للفحص |

---

## 🔧 التخصيص

| ماذا تريد تغييره؟ | أين |
|---|---|
| اسم البرنامج واسم الاختصار | `package.json` ← `build.productName` و `build.nsis.shortcutName` |
| الأيقونة | استبدل `electron/icon.ico` (يفضّل 256×256 داخل ملف متعدد الأحجام) |
| رقم الإصدار | `package.json` ← `version` |
| معرّف التطبيق | `package.json` ← `build.appId` |
| حجم النافذة الافتراضي | `electron/main.cjs` ← `loadWindowState()` |
| إخفاء شريط القوائم | `electron/main.cjs` ← `autoHideMenuBar: true` |

---

## 🛠️ حل المشكلات

| المشكلة | الحل |
|---|---|
| رسالة «تعذر فتح قاعدة البيانات» | نفّذ `npm run app:setup` ثم أعد البناء |
| `NODE_MODULE_VERSION mismatch` | `npx electron-rebuild -f -w better-sqlite3` (اختلاف نسخة Electron عن Node) |
| شاشة بيضاء عند الفتح | تأكد من وجود `client/dist` (`npm run build`) قبل التغليف |
| «انتهت مهلة تشغيل الخادم الداخلي» | جدار الحماية يمنع الاستماع على `127.0.0.1` — اسمح للتطبيق |
| تحذير SmartScreen عند التثبيت | طبيعي للبرامج غير الموقّعة؛ للتخلص منه يلزم **شهادة توقيع كود** (Code Signing Certificate) وإضافتها في `build.win.certificateFile` |
| فشل تنزيل Electron أثناء `npm install` | ضع متغير `ELECTRON_MIRROR` لمرآة قريبة، أو أعد المحاولة عبر اتصال مستقر |

---

## 🌐 بناء لأنظمة أخرى
```bash
npx electron-builder --linux    # AppImage
npx electron-builder --mac      # DMG (يتطلب جهاز macOS)
```

> **ملاحظة:** بناء نسخة ويندوز يجب أن يتم على جهاز ويندوز، لأن `better-sqlite3`
> وحدة أصلية (Native) تُجمَّع لنظام التشغيل المستهدف.
