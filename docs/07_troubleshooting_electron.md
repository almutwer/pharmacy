# 07 - حل مشاكل تشغيل Electron على Windows

## المشكلة: `npm run dev` لا يفتح أي نافذة

جرّب أولاً التشغيل المباشر بدون خادم Vite:

```cmd
npm run desktop
```

هذا الأمر يبني الواجهة ثم يفتح Electron مباشرة من ملفات `dist`.

## إذا لم يفتح أيضاً

نفذ هذه الأوامر وأرسل الناتج:

```cmd
node -v
npm -v
npm run build
npm run desktop
```

## تأكد أنك داخل مجلد المشروع

يجب أن يظهر ملف `package.json` عند تنفيذ:

```cmd
dir package.json
```

إذا لم يظهر، فأنت لست داخل مجلد المشروع الصحيح.

## إذا ظهر أن electron غير موجود

نفذ:

```cmd
npm install
```

إذا كانت عندك مشكلة شهادة SSL، نفذ مؤقتاً:

```cmd
set NODE_TLS_REJECT_UNAUTHORIZED=0
npm install
```

ثم أغلق CMD وافتحه من جديد، وبعدها:

```cmd
npm run desktop
```

## الفرق بين الأوامر

### للتشغيل الأسهل

```cmd
npm run desktop
```

يبني التطبيق ويفتح Electron مباشرة. هذا هو الأمر المفضل إذا `npm run dev` لا يفتح نافذة.

### للتطوير مع تحديث مباشر

```cmd
npm run dev
```

يشغل Vite ثم يفتح Electron. لا تفتح رابط Network من المتصفح؛ استخدم نافذة Electron فقط.

## إذا فتحت رابط الشبكة المحلية

روابط مثل:

```text
http://localhost:5173
http://192.168.x.x:5173
```

تعرض واجهة React فقط ولا تحتوي على قاعدة البيانات أو وظائف Electron. التطبيق الحقيقي يفتح كنافذة Desktop.
