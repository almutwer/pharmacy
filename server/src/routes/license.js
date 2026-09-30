/**
 * مسارات التفعيل — متاحة بدون تسجيل دخول لأن النظام يُقفل قبل الدخول
 */
import { Router } from 'express';
import { z } from 'zod';
import { wrap, parse, logActivity } from '../lib/helpers.js';
import { licenseStatus, activate, machineId } from '../lib/license.js';

const router = Router();

/** حالة التفعيل ومعرف هذا الجهاز */
router.get('/status', wrap((req, res) => res.json(licenseStatus())));

/** تفعيل النسخة بمفتاح */
router.post(
  '/activate',
  wrap((req, res) => {
    const data = parse(z.object({ key: z.string().min(10, 'أدخل مفتاح التفعيل') }), req.body);
    const result = activate(data.key);
    if (!result.ok) return res.status(400).json({ error: result.error, machine_id: result.machine_id });
    logActivity(null, 'activate', 'license', null, `تفعيل على الجهاز ${machineId()}`);
    return res.json(result);
  }),
);

export default router;
