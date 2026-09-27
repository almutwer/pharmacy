import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { SQLiteService } from './services/database';
import { CatalogService } from './services/catalog';
import { InventoryService } from './services/inventory';
import { SalesService } from './services/sales';
import { ReportsService } from './services/reports';
import { BackupService } from './services/backup';
import { createPreview } from './services/fileReaders';
import type { AddStockInput, CompleteSaleInput } from './types';

let mainWindow: BrowserWindow | null = null;
const db = new SQLiteService();
const catalog = new CatalogService(db);
const inventory = new InventoryService(db);
const sales = new SalesService(db);
const reports = new ReportsService(db);
const backup = new BackupService(db);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'نظام إدارة الصيدلية المحلي',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerHandlers(): void {
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    dbPath: db.dbPath,
    backupDir: db.backupDir,
    receiptDir: db.receiptDir,
  }));
  ipcMain.handle('app:loadSampleData', () => {
    db.loadSampleData();
    return true;
  });

  ipcMain.handle('catalog:chooseFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'اختر ملف دليل الأدوية',
      properties: ['openFile'],
      filters: [{ name: 'Data Files', extensions: ['xlsx', 'xls', 'csv', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return createPreview(result.filePaths[0], 20);
  });
  ipcMain.handle('catalog:importFile', (_event, filePath: string, mapping: Record<string, string>, username = 'admin') =>
    catalog.importCatalog(filePath, mapping, username),
  );
  ipcMain.handle('catalog:search', (_event, query: string, limit?: number) => catalog.search(query, limit));

  ipcMain.handle('inventory:findCatalogByBarcode', (_event, barcode: string) => inventory.findCatalogByBarcode(barcode));
  ipcMain.handle('inventory:addStock', (_event, input: AddStockInput) => inventory.addStock(input));
  ipcMain.handle('inventory:list', (_event, limit?: number) => inventory.list(limit));
  ipcMain.handle('inventory:search', (_event, query: string, limit?: number) => inventory.search(query, limit));
  ipcMain.handle('inventory:chooseSupplierFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'اختر ملف فاتورة المورد',
      properties: ['openFile'],
      filters: [{ name: 'Data Files', extensions: ['xlsx', 'xls', 'csv', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return createPreview(result.filePaths[0], 20);
  });
  ipcMain.handle(
    'inventory:importSupplierInvoice',
    (_event, filePath: string, mapping: Record<string, string>, supplierName: string | null, invoiceNumber: string | null, username = 'admin') =>
      inventory.bulkImportSupplierInvoice(filePath, mapping, supplierName || null, invoiceNumber || null, username),
  );

  ipcMain.handle('sales:searchPOS', (_event, query: string, limit?: number) => sales.searchPOS(query, limit));
  ipcMain.handle('sales:buildCartItemFromInventory', (_event, inventoryId: number, quantity?: number) =>
    sales.buildCartItemFromInventory(inventoryId, quantity || 1),
  );
  ipcMain.handle('sales:completeSale', (_event, input: CompleteSaleInput) => sales.completeSale(input));
  ipcMain.handle('sales:receipt', (_event, saleId: number) => sales.receipt(saleId));

  ipcMain.handle('reports:dailySales', (_event, day?: string) => reports.dailySales(day));
  ipcMain.handle('reports:inventoryStatus', () => reports.inventoryStatus());
  ipcMain.handle('reports:lowStock', () => reports.lowStock());
  ipcMain.handle('reports:expiring', (_event, days?: number) => reports.expiring(days || 30));
  ipcMain.handle('reports:profit', (_event, startDate?: string, endDate?: string) => reports.profit(startDate, endDate));
  ipcMain.handle('reports:suppliers', (_event, startDate?: string, endDate?: string) => reports.suppliers(startDate, endDate));
  ipcMain.handle('reports:stagnant', (_event, days?: number) => reports.stagnant(days || 90));

  ipcMain.handle('backup:create', () => backup.createBackup('manual'));
  ipcMain.handle('backup:list', () => backup.listBackups());
  ipcMain.handle('backup:needsWarning', () => backup.needsWarning());
  ipcMain.handle('backup:chooseUsbAndCopy', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'اختر مجلد USB أو مجلد النسخ',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return backup.copyLatestToUsb(result.filePaths[0]);
  });

  ipcMain.handle('shell:openPath', (_event, filePath: string) => shell.openPath(filePath));
}

app.whenReady().then(async () => {
  await db.initialize();
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
