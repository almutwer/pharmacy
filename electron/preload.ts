import { contextBridge, ipcRenderer } from 'electron';
import type { AddStockInput, CartItem, CompleteSaleInput } from './types';

const api = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    loadSampleData: () => ipcRenderer.invoke('app:loadSampleData'),
  },
  catalog: {
    chooseFile: () => ipcRenderer.invoke('catalog:chooseFile'),
    importFile: (filePath: string, mapping: Record<string, string>, username?: string) =>
      ipcRenderer.invoke('catalog:importFile', filePath, mapping, username),
    search: (query: string, limit?: number) => ipcRenderer.invoke('catalog:search', query, limit),
  },
  inventory: {
    findCatalogByBarcode: (barcode: string) => ipcRenderer.invoke('inventory:findCatalogByBarcode', barcode),
    addStock: (input: AddStockInput) => ipcRenderer.invoke('inventory:addStock', input),
    list: (limit?: number) => ipcRenderer.invoke('inventory:list', limit),
    search: (query: string, limit?: number) => ipcRenderer.invoke('inventory:search', query, limit),
    chooseSupplierFile: () => ipcRenderer.invoke('inventory:chooseSupplierFile'),
    importSupplierInvoice: (filePath: string, mapping: Record<string, string>, supplierName?: string, invoiceNumber?: string, username?: string) =>
      ipcRenderer.invoke('inventory:importSupplierInvoice', filePath, mapping, supplierName, invoiceNumber, username),
  },
  sales: {
    searchPOS: (query: string, limit?: number) => ipcRenderer.invoke('sales:searchPOS', query, limit),
    buildCartItemFromInventory: (inventoryId: number, quantity?: number) => ipcRenderer.invoke('sales:buildCartItemFromInventory', inventoryId, quantity),
    completeSale: (input: CompleteSaleInput) => ipcRenderer.invoke('sales:completeSale', input),
    receipt: (saleId: number) => ipcRenderer.invoke('sales:receipt', saleId),
  },
  reports: {
    dailySales: (day?: string) => ipcRenderer.invoke('reports:dailySales', day),
    inventoryStatus: () => ipcRenderer.invoke('reports:inventoryStatus'),
    lowStock: () => ipcRenderer.invoke('reports:lowStock'),
    expiring: (days?: number) => ipcRenderer.invoke('reports:expiring', days),
    profit: (startDate?: string, endDate?: string) => ipcRenderer.invoke('reports:profit', startDate, endDate),
    suppliers: (startDate?: string, endDate?: string) => ipcRenderer.invoke('reports:suppliers', startDate, endDate),
    stagnant: (days?: number) => ipcRenderer.invoke('reports:stagnant', days),
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    chooseUsbAndCopy: () => ipcRenderer.invoke('backup:chooseUsbAndCopy'),
    list: () => ipcRenderer.invoke('backup:list'),
    needsWarning: () => ipcRenderer.invoke('backup:needsWarning'),
  },
};

contextBridge.exposeInMainWorld('pharmacy', api);

export type PharmacyApi = typeof api;
