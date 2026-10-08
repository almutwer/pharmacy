/**
 * ============================================================
 *  نظام إدارة الصيدليات — عملية Electron الرئيسية (Main Process)
 * ============================================================
 *  أوضاع التشغيل الثلاثة:
 *   • standalone : جهاز واحد — خادم داخلي على 127.0.0.1 بمنفذ حر (الافتراضي)
 *   • server     : جهاز رئيسي — خادم متاح لأجهزة الشبكة المحلية على منفذ ثابت
 *   • client     : جهاز فرعي — يتصل بالجهاز الرئيسي ولا يشغّل خادماً
 */
const {
  app, BrowserWindow, Menu, shell, dialog, ipcMain, clipboard,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const APP_ID = 'com.pharmacy.system';
const APP_TITLE = 'نظام إدارة الصيدليات';
const DEFAULT_LAN_PORT = 4100;
const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let networkWindow = null;
let serverPort = 0;
let serverHost = '127.0.0.1';
let serverInfo = {};
let appUrl = '';

/* ============ منع تشغيل أكثر من نسخة ============ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  const win = mainWindow || networkWindow;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.setAppUserModelId(APP_ID);

/* ============ مسارات البيانات والإعدادات ============ */
const userDataDir = app.getPath('userData');
const dataDir = path.join(userDataDir, 'data');
const configFile = path.join(userDataDir, 'app-config.json');
const stateFile = path.join(userDataDir, 'window-state.json');

fs.mkdirSync(dataDir, { recursive: true });

const DEFAULT_CONFIG = {
  mode: 'standalone',          // standalone | server | client
  server_port: DEFAULT_LAN_PORT,
  server_url: '',              // يُستخدم في وضع العميل
  created_at: new Date().toISOString(),
};

function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { /* أول تشغيل */ }
  const config = { ...DEFAULT_CONFIG, ...saved };
  if (!config.jwt_secret) config.jwt_secret = crypto.randomBytes(48).toString('hex');
  if (!['standalone', 'server', 'client'].includes(config.mode)) config.mode = 'standalone';
  config.server_port = Number(config.server_port) || DEFAULT_LAN_PORT;
  try { fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); } catch { /* تجاهل */ }
  return config;
}

function saveConfig(patch) {
  const config = { ...loadConfig(), ...patch };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  return config;
}

let config = loadConfig();

/* ============ أدوات الشبكة ============ */

/** عناوين الجهاز على الشبكة المحلية */
function lanAddresses() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(interfaces)) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push({ name, address: item.address });
    }
  }
  return out;
}

/** تطبيع عنوان الخادم الذي يكتبه المستخدم */
function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  value = value.replace(/\/+$/, '');
  try {
    const url = new URL(value);
    if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_LAN_PORT);
    return url.origin;
  } catch {
    return '';
  }
}

/** فحص توفر خادم بعيد */
function probeServer(rawUrl, timeout = 5000) {
  return new Promise((resolve) => {
    const base = normalizeUrl(rawUrl);
    if (!base) return resolve({ ok: false, error: 'العنوان غير صالح' });
    const url = new URL(`${base}/api/health`);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          if (res.statusCode === 200 && info.ok) return resolve({ ok: true, info, url: base });
          return resolve({ ok: false, error: 'الخادم موجود لكنه ليس نظام إدارة الصيدليات' });
        } catch {
          return resolve({ ok: false, error: 'رد غير مفهوم من الخادم' });
        }
      });
      return undefined;
    });
    req.on('error', (err) => resolve({
      ok: false,
      error: err.code === 'ECONNREFUSED'
        ? 'تعذر الاتصال — تأكد أن البرنامج يعمل على الجهاز الرئيسي بوضع «خادم»'
        : `تعذر الاتصال (${err.code || err.message})`,
    }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'انتهت مهلة الاتصال — تحقق من الشبكة وجدار الحماية' }); });
    return undefined;
  });
}

/** إيجاد منفذ محلي حر */
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

/** التأكد أن المنفذ المطلوب متاح قبل تشغيل وضع الخادم */
function isPortFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/* ============ تشغيل الخادم الداخلي ============ */
async function startServer() {
  const lanMode = config.mode === 'server';
  serverHost = lanMode ? '0.0.0.0' : '127.0.0.1';

  if (lanMode) {
    const free = await isPortFree(config.server_port);
    if (!free) {
      throw new Error(
        `المنفذ ${config.server_port} مستخدم من برنامج آخر على هذا الجهاز.\n`
        + 'غيّر المنفذ من «إعدادات الشبكة» أو أغلق البرنامج الذي يحجزه.',
      );
    }
    serverPort = config.server_port;
  } else {
    serverPort = await findFreePort();
  }

  process.env.DATA_DIR = dataDir;
  process.env.DB_FILE = path.join(dataDir, 'pharmacy.db');
  process.env.PORT = String(serverPort);
  process.env.HOST = serverHost;
  process.env.JWT_SECRET = config.jwt_secret;
  process.env.JWT_EXPIRES = '24h';
  process.env.CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  if (!isDev) process.env.NODE_ENV = 'production';

  const entry = path.join(__dirname, '..', 'server', 'src', 'index.js');
  await import(pathToFileURL(entry).href);
  await waitForServer();
  return `http://127.0.0.1:${serverPort}`;
}

/** انتظار جاهزية الخادم عبر /api/health */
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

/* ============ أبعاد النافذة ============ */
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

/* ============ النوافذ ============ */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460, height: 300, frame: false, resizable: false, center: true,
    show: true, alwaysOnTop: true, backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

const MODE_LABELS = {
  standalone: 'جهاز واحد',
  server: 'خادم الشبكة',
  client: 'متصل بالشبكة',
};

function createMainWindow(url) {
  appUrl = url;
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width, height: state.height, x: state.x, y: state.y,
    minWidth: 1024, minHeight: 640,
    show: false,
    title: `${APP_TITLE} — ${MODE_LABELS[config.mode]}`,
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  // فتح الروابط الخارجية في المتصفح لا داخل التطبيق
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  // فشل الاتصال بالخادم البعيد (وضع العميل)
  mainWindow.webContents.on('did-fail-load', (event, code, description, failingUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (config.mode === 'client') {
      closeSplash();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      mainWindow = null;
      openNetworkWindow(`انقطع الاتصال بالخادم (${description}). تأكد أن الجهاز الرئيسي يعمل.`);
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  buildMenu();
}

/** نافذة إعدادات الشبكة */
function openNetworkWindow(errorMessage = '') {
  if (networkWindow && !networkWindow.isDestroyed()) {
    networkWindow.focus();
    return;
  }
  networkWindow = new BrowserWindow({
    width: 860, height: 760, resizable: true, minimizable: true, center: true,
    title: 'إعدادات الشبكة',
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  networkWindow.setMenuBarVisibility(false);
  networkWindow.loadFile(path.join(__dirname, 'network.html'), {
    query: errorMessage ? { error: errorMessage } : {},
  });
  networkWindow.on('closed', () => {
    networkWindow = null;
    if (!mainWindow) app.quit();
  });
  closeSplash();
}

/* ============ روابط الاتصال ============ */
function connectionUrls() {
  if (config.mode === 'client') return [{ label: 'الخادم', url: normalizeUrl(config.server_url) }];
  if (config.mode !== 'server') return [];
  return lanAddresses().map((a) => ({ label: a.name, url: `http://${a.address}:${serverPort || config.server_port}` }));
}

function showConnectionInfo() {
  const urls = connectionUrls();
  if (config.mode !== 'server') {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'مشاركة النظام على الشبكة',
      message: 'هذا الجهاز لا يعمل حالياً كخادم شبكة',
      detail: 'افتح «أدوات ← إعدادات الشبكة» واختر وضع «خادم الشبكة» لتتمكن الأجهزة الأخرى من الاتصال بهذا الجهاز.',
      buttons: ['حسناً'],
    });
    return;
  }
  const list = urls.map((u) => `• ${u.url}   (${u.label})`).join('\n') || 'لا يوجد اتصال شبكة نشط على هذا الجهاز.';
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'روابط الاتصال بالنظام',
    message: 'الأجهزة الأخرى تتصل عبر أحد هذه العناوين',
    detail: `${list}\n\nمن أي جهاز في نفس الشبكة:\n`
      + '• افتح المتصفح على العنوان أعلاه مباشرة، أو\n'
      + '• ثبّت نفس البرنامج واختر وضع «متصل بالشبكة» ثم اكتب العنوان.\n\n'
      + 'إن لم يفتح لديهم، اسمح للبرنامج في جدار حماية ويندوز (الشبكات الخاصة).',
    buttons: ['نسخ أول رابط', 'حسناً'],
    defaultId: 1,
  }).then(({ response }) => {
    if (response === 0 && urls[0]) clipboard.writeText(urls[0].url);
  });
}

/* ============ القائمة العربية ============ */
function buildMenu() {
  const template = [
    {
      label: 'ملف',
      submenu: [
        { label: 'طباعة…', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.print({}) },
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
      label: 'الشبكة',
      submenu: [
        { label: `الوضع الحالي: ${MODE_LABELS[config.mode]}`, enabled: false },
        { type: 'separator' },
        { label: 'إعدادات الشبكة…', accelerator: 'CmdOrCtrl+Shift+N', click: () => openNetworkWindow() },
        { label: 'عرض روابط الاتصال…', click: showConnectionInfo },
      ],
    },
    {
      label: 'أدوات',
      submenu: [
        { label: 'فتح مجلد البيانات وقاعدة البيانات', click: () => shell.openPath(dataDir), enabled: config.mode !== 'client' },
        {
          label: 'نسخ احتياطي سريع لقاعدة البيانات',
          enabled: config.mode !== 'client',
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
            const net0 = connectionUrls()[0];
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'حول البرنامج',
              message: APP_TITLE,
              detail:
                `الإصدار: ${app.getVersion()}\n`
                + `Electron: ${process.versions.electron}\n`
                + `Node.js: ${process.versions.node}\n`
                + `وضع التشغيل: ${MODE_LABELS[config.mode]}\n`
                + (config.mode === 'client'
                  ? `الخادم: ${normalizeUrl(config.server_url)}\n`
                  : `محرك قاعدة البيانات: ${serverInfo.driver || 'غير معروف'}\n`)
                + (net0 && config.mode === 'server' ? `رابط الشبكة: ${net0.url}\n` : '')
                + (config.mode === 'client' ? '\n' : `\nمجلد البيانات:\n${dataDir}\n\n`)
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

/* ============ جسر IPC مع نافذة إعدادات الشبكة ============ */
ipcMain.handle('net:state', () => ({
  mode: config.mode,
  server_port: config.server_port,
  server_url: config.server_url,
  running_port: serverPort,
  addresses: lanAddresses(),
  urls: connectionUrls(),
  data_dir: dataDir,
  version: app.getVersion(),
}));

ipcMain.handle('net:test', async (_e, url) => probeServer(url));

ipcMain.handle('net:copy', (_e, text) => { clipboard.writeText(String(text || '')); return true; });

ipcMain.handle('net:save', async (_e, patch) => {
  const next = {
    mode: patch.mode,
    server_port: Number(patch.server_port) || DEFAULT_LAN_PORT,
    server_url: patch.mode === 'client' ? normalizeUrl(patch.server_url) : (config.server_url || ''),
  };

  if (next.mode === 'client') {
    if (!next.server_url) return { ok: false, error: 'اكتب عنوان الجهاز الرئيسي' };
    const probe = await probeServer(next.server_url);
    if (!probe.ok) return { ok: false, error: probe.error };
  }
  if (next.mode === 'server' && (next.server_port < 1024 || next.server_port > 65535)) {
    return { ok: false, error: 'اختر منفذاً بين 1024 و 65535' };
  }

  config = saveConfig(next);
  setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
  return { ok: true };
});

ipcMain.handle('net:close', () => {
  if (networkWindow && !networkWindow.isDestroyed()) networkWindow.close();
  return true;
});

/* ============ الإقلاع ============ */
async function boot() {
  if (config.mode === 'client') {
    const target = normalizeUrl(config.server_url);
    const probe = await probeServer(target);
    if (!probe.ok) {
      openNetworkWindow(probe.error || 'تعذر الاتصال بالجهاز الرئيسي');
      return;
    }
    serverInfo = probe.info || {};
    createMainWindow(target);
    return;
  }

  const url = await startServer();
  createMainWindow(url);
}

app.whenReady().then(async () => {
  createSplash();
  try {
    await boot();
  } catch (err) {
    closeSplash();
    dialog.showErrorBox(
      'تعذر تشغيل النظام',
      `${err?.message || err}\n\nمجلد البيانات:\n${dataDir}`,
    );
    openNetworkWindow(String(err?.message || err));
  }
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot().catch(() => openNetworkWindow());
});

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('خطأ غير متوقع', String(err?.stack || err));
});
