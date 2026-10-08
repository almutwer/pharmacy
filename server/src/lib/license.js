/**
 * نظام الحماية والتفعيل — يمنع نسخ النظام من جهاز إلى آخر
 * ----------------------------------------------------------------
 *  • لكل جهاز «معرف جهاز» مشتق من مواصفاته الثابتة (بصمة عتاد)
 *  • مفتاح التفعيل موقّع رقمياً بخوارزمية Ed25519 ويحمل معرف الجهاز
 *  • التطبيق يحمل المفتاح العام فقط، فلا يمكن تزوير مفاتيح من داخله
 *  • المفتاح الخاص يبقى عند المطوّر في أداة توليد المفاتيح
 * ----------------------------------------------------------------
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import db from './db.js';
import { LICENSE_PUBLIC_KEY } from './license-public-key.js';

const PREFIX = 'PHRM1';
const LICENSE_FILE = () => path.join(db.dir, 'license.key');

/* ======================= معرف الجهاز ======================= */

/**
 * بصمة الجهاز: مواصفات ثابتة لا تتغير بإعادة التشغيل ولا بتغيير كرت الشبكة،
 * وتختلف من جهاز لآخر.
 */
function fingerprintParts() {
  const cpu = os.cpus()?.[0]?.model || 'unknown-cpu';
  return [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpu.replace(/\s+/g, ' ').trim(),
    String(os.cpus()?.length || 0),
    String(Math.round(os.totalmem() / 1024 / 1024 / 1024)),
  ];
}

/** معرف الجهاز بصيغة XXXX-XXXX-XXXX-XXXX */
export function machineId() {
  const hash = crypto.createHash('sha256').update(fingerprintParts().join('|')).digest('hex').toUpperCase();
  return hash.slice(0, 16).match(/.{4}/g).join('-');
}

/* ======================= المفاتيح ======================= */

const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (str) => Buffer.from(str, 'base64url'),
};

/** هل النظام مهيأ للتفعيل أصلاً؟ (وُلِّد مفتاح عام) */
export const licensingConfigured = () => !!LICENSE_PUBLIC_KEY.trim();

/**
 * هل التفعيل مُلزم في هذا التشغيل؟
 * مُلزم داخل تطبيق سطح المكتب المُغلَّف، أو عند ضبط LICENSE_ENFORCE=1
 * ومُعطَّل في وضع التطوير حتى لا يعيق العمل.
 */
export function licenseEnforced() {
  if (!licensingConfigured()) return false;
  if (process.env.LICENSE_ENFORCE === '0') return false;
  if (process.env.LICENSE_ENFORCE === '1') return true;
  return !!process.versions.electron;
}

/** تفكيك مفتاح التفعيل والتحقق من توقيعه */
export function verifyKey(rawKey) {
  const key = String(rawKey || '').replace(/\s+/g, '');
  if (!key) return { valid: false, reason: 'لم يتم إدخال مفتاح التفعيل' };

  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { valid: false, reason: 'صيغة مفتاح التفعيل غير صحيحة' };
  }
  if (!licensingConfigured()) {
    return { valid: false, reason: 'لم يتم تهيئة نظام التفعيل في هذه النسخة' };
  }

  let payload;
  try {
    payload = JSON.parse(b64url.decode(parts[1]).toString('utf8'));
  } catch {
    return { valid: false, reason: 'محتوى المفتاح تالف' };
  }

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      null,
      Buffer.from(`${PREFIX}.${parts[1]}`, 'utf8'),
      crypto.createPublicKey(LICENSE_PUBLIC_KEY),
      b64url.decode(parts[2]),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { valid: false, reason: 'مفتاح التفعيل غير صالح أو معدَّل' };

  const current = machineId();
  if (payload.m && payload.m !== '*' && payload.m !== current) {
    return {
      valid: false,
      reason: 'هذا المفتاح مُصدَر لجهاز آخر ولا يعمل على هذا الجهاز',
      issued_for: payload.m,
    };
  }

  if (payload.e) {
    const expiry = new Date(`${payload.e}T23:59:59`);
    if (Number.isNaN(expiry.getTime())) return { valid: false, reason: 'تاريخ انتهاء غير صالح داخل المفتاح' };
    if (expiry.getTime() < Date.now()) {
      return { valid: false, reason: `انتهت صلاحية الترخيص بتاريخ ${payload.e}`, expires_at: payload.e };
    }
  }

  return {
    valid: true,
    customer: payload.c || null,
    machine: payload.m || '*',
    expires_at: payload.e || null,
    issued_at: payload.i || null,
    edition: payload.t || 'full',
  };
}

/* ======================= التخزين والحالة ======================= */

export function readStoredKey() {
  try {
    return fs.readFileSync(LICENSE_FILE(), 'utf8').trim();
  } catch {
    return '';
  }
}

export function storeKey(key) {
  fs.mkdirSync(path.dirname(LICENSE_FILE()), { recursive: true });
  fs.writeFileSync(LICENSE_FILE(), String(key).replace(/\s+/g, ''), 'utf8');
}

const daysBetween = (dateStr) => Math.ceil((new Date(`${dateStr}T23:59:59`).getTime() - Date.now()) / 86400000);

/** حالة الترخيص الحالية */
export function licenseStatus() {
  const machine_id = machineId();
  const enforced = licenseEnforced();

  if (!licensingConfigured()) {
    return { active: true, enforced: false, configured: false, machine_id, reason: 'نظام التفعيل غير مهيأ (وضع التطوير)' };
  }

  const stored = readStoredKey();
  if (!stored) {
    return {
      active: !enforced,
      enforced,
      configured: true,
      machine_id,
      reason: 'النسخة غير مفعّلة على هذا الجهاز',
    };
  }

  const result = verifyKey(stored);
  return {
    active: result.valid || !enforced,
    valid: result.valid,
    enforced,
    configured: true,
    machine_id,
    customer: result.customer || null,
    expires_at: result.expires_at || null,
    days_left: result.expires_at ? daysBetween(result.expires_at) : null,
    edition: result.edition || null,
    reason: result.valid ? 'مفعّل' : result.reason,
  };
}

/** تفعيل النسخة بمفتاح جديد */
export function activate(key) {
  const result = verifyKey(key);
  if (!result.valid) return { ok: false, error: result.reason, machine_id: machineId() };
  storeKey(key);
  return { ok: true, ...licenseStatus() };
}

export default { machineId, licenseStatus, activate, verifyKey, licenseEnforced, licensingConfigured };
