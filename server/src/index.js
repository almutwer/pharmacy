/**
 * نظام إدارة الصيدليات — خادم API
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import db from './lib/db.js';
import { migrate } from './lib/schema.js';
import { HttpError } from './lib/helpers.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import catalogRoutes from './routes/catalog.js';
import productsRoutes from './routes/products.js';
import inventoryRoutes from './routes/inventory.js';
import { suppliersRouter, customersRouter } from './routes/parties.js';
import purchasesRoutes from './routes/purchases.js';
import salesRoutes from './routes/sales.js';
import expensesRoutes from './routes/expenses.js';
import reportsRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import licenseRoutes from './routes/license.js';
import { licenseStatus, licenseEnforced, machineId } from './lib/license.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

migrate();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '60mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/api/license', licenseRoutes);

/**
 * حارس التفعيل: يمنع تشغيل النظام على جهاز غير مرخَّص
 * (نقطة الفحص ومسارات التفعيل تبقى مفتوحة حتى يمكن التفعيل)
 */
app.use('/api', (req, res, next) => {
  if (!licenseEnforced()) return next();
  if (req.path === '/health' || req.path.startsWith('/license')) return next();
  const status = licenseStatus();
  if (status.active) return next();
  return res.status(402).json({
    error: status.reason || 'النسخة غير مفعّلة على هذا الجهاز',
    code: 'LICENSE_REQUIRED',
    machine_id: status.machine_id,
  });
});

app.get('/api/health', (req, res) => res.json({
  ok: true,
  name: 'نظام إدارة الصيدليات',
  driver: db.driver,
  desktop: !!process.versions.electron,
  time: new Date().toISOString(),
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);

// خدمة واجهة الإنتاج إن وُجدت (CLIENT_DIST يُستخدم في تطبيق سطح المكتب)
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// معالج الأخطاء
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err instanceof HttpError ? err.status : err.status || 500;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({
    error: err.message || 'حدث خطأ غير متوقع في الخادم',
    details: err.details,
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ خادم نظام الصيدلية يعمل على http://${HOST}:${PORT}`);
  console.log(`   محرك قاعدة البيانات: ${db.driver}  |  الملف: ${db.file}`);
  const lic = licenseStatus();
  console.log(`   معرف الجهاز: ${machineId()}  |  التفعيل: ${lic.enforced ? (lic.active ? 'مفعّل' : `مطلوب — ${lic.reason}`) : 'غير مُلزم'}`);
});

export { app, server };
export default app;
