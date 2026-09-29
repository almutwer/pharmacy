/**
 * ============================================================
 *  نظام إدارة الصيدليات — عملية Electron الرئيسية (Main Process)
 * ============================================================
 *  الوظيفة:
 *   1) تحديد مجلد بيانات آمن للكتابة (AppData) لقاعدة البيانات
 *   2) توليد مفتاح جلسات سري ثابت لكل جهاز
 *   3) تشغيل خادم Express داخلياً على منفذ محلي حر
 *   4) عرض شاشة انتظار ثم فتح نافذة التطبيق بعد جاهزية الخادم
 *   5) قائمة عربية كاملة + حفظ أبعاد النافذة + منع تعدد النسخ
 */
const { app, BrowserWindow, Menu, shell, dialog, crashReporter } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const APP_ID = 'com.pharmacy.system';
const APP_TITLE = 'نظام إدارة الصيدليات';
const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let serverPort = 0;
let serverInfo = {};

/* ============ منع تشغيل أكثر من نسخة ============ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.setAppUserModelId(APP_ID);

/* ============ مسارات البيانات ============ */
const userDataDir = app.getPath('userData');
const dataDir = path.join(userDataDir, 'data');
const configFile = path.join(userDataDir, 'app-config.json');
const stateFile = path.join(userDataDir, 'window-state.json');

fs.mkdirSync(dataDir, { recursive: true });

/** إعدادات محلية (مفتاح سري + المنفذ المفضل) */
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    const config = { jwt_secret: crypto.randomBytes(48).toString('hex'), created_at: new Date().toISOString() };
    try { fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); } catch { /* تجاهل */ }
    return config;
  }
}

/** أبعاد النافذة المحفوظة */
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (s && s.width > 600 && s.height > 400) return s;
  } catch { /* تجاهل */ }
  return { width: 1480, height: 940, maximized: true };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getNormalBounds();
    fs.writeFileSync(stateFile, JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }));
  } catch { /* تجاهل */ }
}

/* ============ إيجاد منفذ محلي حر ============ */
function findFreePort(preferred = 43110) {
  return new Promise((resolve) => {
    const tryPort = (port, fallbackToRandom) => {
      const srv = net.createServer();
      srv.once('error', () => (fallbackToRandom ? tryPort(0, false) : resolve(0)));
      srv.once('listening', () => {
        const { port: got } = srv.address();
        srv.close(() => resolve(got));
      });
      srv.listen(port, '127.0.0.1');
    };
    tryPort(preferred, true);
  });
}

/* ============ تشغيل خادم Express داخلياً ============ */
async function startServer() {
  const config = loadConfig();
  serverPort = await findFreePort();

  process.env.DATA_DIR = dataDir;
  process.env.DB_FILE = path.join(dataDir, 'pharmacy.db');
  process.env.PORT = String(serverPort);
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = config.jwt_secret;
  process.env.JWT_EXPIRES = '24h';
  process.env.CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  if (!isDev) process.env.NODE_ENV = 'production';

  const entry = path.join(__dirname, '..', 'server', 'src', 'index.js');
  await import(pathToFileURL(entry).href);
  await waitForServer();
}

/** انتظار جاهزية الخادم عبر نقطة الفحص /api/health */
function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get({ host: '127.0.0.1', port: serverPort, path: '/api/health', timeout: 1500 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return retry(); }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { serverInfo = JSON.parse(body); } catch { serverInfo = {}; }
          resolve();
        });
        return undefined;
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('انتهت مهلة تشغيل الخادم الداخلي'));
      return setTimeout(ping, 250);
    };
    ping();
  });
}

/* ============ النوافذ ============ */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460, height: 300, frame: false, resizable: false, center: true,
    show: true, alwaysOnTop: true, backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width, height: state.height, x: state.x, y: state.y,
    minWidth: 1024, minHeight: 640,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  // فتح الروابط الخارجية في المتصفح لا داخل التطبيق
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('توقف التطبيق', `حدث خطأ غير متوقع في واجهة التطبيق (${details.reason}). سيتم إعادة التحميل.`);
    if (mainWindow) mainWindow.reload();
  });

  buildMenu();
}

/* ============ القائمة العربية ============ */
function buildMenu() {
  const template = [
    {
      label: 'ملف',
      submenu: [
        {
          label: 'طباعة…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print({}),
        },
        {
          label: 'حفظ كملف PDF…',
          click: async () => {
            if (!mainWindow) return;
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
              title: 'حفظ كملف PDF',
              defaultPath: `تقرير-${new Date().toISOString().slice(0, 10)}.pdf`,
              filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (canceled || !filePath) return;
            const pdf = await mainWindow.webContents.printToPDF({ printBackground: true });
            fs.writeFileSync(filePath, pdf);
            shell.showItemInFolder(filePath);
          },
        },
        { type: 'separator' },
        { label: 'إغلاق التطبيق', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'تحرير',
      submenu: [
        { label: 'تراجع', role: 'undo' },
        { label: 'إعادة', role: 'redo' },
        { type: 'separator' },
        { label: 'قص', role: 'cut' },
        { label: 'نسخ', role: 'copy' },
        { label: 'لصق', role: 'paste' },
        { label: 'تحديد الكل', role: 'selectAll' },
      ],
    },
    {
      label: 'عرض',
      submenu: [
        { label: 'إعادة تحميل', accelerator: 'F5', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: 'تكبير', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { label: 'تصغير', role: 'zoomOut' },
        { label: 'الحجم الطبيعي', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'ملء الشاشة', role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },
    {
      label: 'أدوات',
      submenu: [
        {
          label: 'فتح مجلد البيانات وقاعدة البيانات',
          click: () => shell.openPath(dataDir),
        },
        {
          label: 'نسخ احتياطي سريع لقاعدة البيانات',
          click: async () => {
            const src = path.join(dataDir, 'pharmacy.db');
            if (!fs.existsSync(src)) return dialog.showErrorBox('تعذر النسخ', 'لم يتم العثور على قاعدة البيانات.');
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
              title: 'حفظ نسخة احتياطية',
              defaultPath: `pharmacy-backup-${new Date().toISOString().slice(0, 10)}.db`,
              filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
            });
            if (canceled || !filePath) return undefined;
            fs.copyFileSync(src, filePath);
            shell.showItemInFolder(filePath);
            return undefined;
          },
        },
        { type: 'separator' },
        { label: 'أدوات المطور', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'مساعدة',
      submenu: [
        {
          label: `حول ${APP_TITLE}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'حول البرنامج',
              message: APP_TITLE,
              detail:
                `الإصدار: ${app.getVersion()}\n`
                + `Electron: ${process.versions.electron}\n`
                + `Node.js: ${process.versions.node}\n`
                + `محرك قاعدة البيانات: ${serverInfo.driver || 'غير معروف'}\n\n`
                + `مجلد البيانات:\n${dataDir}\n\n`
                + 'نظام متكامل لإدارة المخزون والمبيعات والمشتريات والأرباح والمصروفات ودليل الأدوية.',
              buttons: ['حسناً'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ============ دورة حياة التطبيق ============ */
app.whenReady().then(async () => {
  createSplash();
  try {
    await startServer();
    createMainWindow();
  } catch (err) {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    dialog.showErrorBox(
      'تعذر تشغيل النظام',
      `${err?.message || err}\n\nتأكد من عدم حجب البرنامج بواسطة جدار الحماية، ثم أعد المحاولة.\n\nمجلد البيانات:\n${dataDir}`,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) createMainWindow();
});

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('خطأ غير متوقع', String(err?.stack || err));
});
