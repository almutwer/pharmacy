/**
 * جسر آمن بين نافذة إعدادات الشبكة والعملية الرئيسية
 * (contextIsolation مفعّل — لا يوجد وصول مباشر إلى Node من الصفحة)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pharmacyNet', {
  /** حالة التشغيل الحالية: الوضع، المنفذ، عناوين الشبكة */
  state: () => ipcRenderer.invoke('net:state'),
  /** فحص الاتصال بخادم بعيد */
  test: (url) => ipcRenderer.invoke('net:test', url),
  /** حفظ الإعدادات وإعادة تشغيل التطبيق */
  save: (patch) => ipcRenderer.invoke('net:save', patch),
  /** نسخ نص إلى الحافظة */
  copy: (text) => ipcRenderer.invoke('net:copy', text),
  /** إغلاق نافذة الإعدادات */
  close: () => ipcRenderer.invoke('net:close'),
});
