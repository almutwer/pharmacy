#!/usr/bin/env node
/**
 * ============================================================
 *  أداة توليد مفاتيح التفعيل — للمطوّر فقط
 * ============================================================
 *  الاستخدام:
 *    npm run keygen init                       تهيئة زوج المفاتيح (مرة واحدة)
 *    npm run keygen machine                    عرض معرف هذا الجهاز
 *    npm run keygen issue --machine XXXX-...   إصدار مفتاح تفعيل لعميل
 *    npm run keygen verify <المفتاح>            التحقق من مفتاح
 *    npm run keygen list                        عرض المفاتيح الصادرة
 *
 *  أمثلة:
 *    npm run keygen issue -- --machine A1B2-C3D4-E5F6-7788 --name "صيدلية النور"
 *    npm run keygen issue -- --machine A1B2-C3D4-E5F6-7788 --days 365
 *    npm run keygen issue -- --machine "*" --name "نسخة عرض"   (يعمل على أي جهاز)
 *
 *  ⚠️ المفتاح الخاص في tools/keys/private.pem لا يُسلَّم للعميل إطلاقاً،
 *     ومن يملكه يستطيع إصدار مفاتيح لأي جهاز.
 * ============================================================
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_FILE = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_FILE = path.join(KEYS_DIR, 'public.pem');
const REGISTRY_FILE = path.join(KEYS_DIR, 'issued.json');
const PUBLIC_MODULE = path.join(ROOT, 'server', 'src', 'lib', 'license-public-key.js');
const PREFIX = 'PHRM1';

const C = {
  g: (t) => `\x1b[32m${t}\x1b[0m`,
  r: (t) => `\x1b[31m${t}\x1b[0m`,
  y: (t) => `\x1b[33m${t}\x1b[0m`,
  b: (t) => `\x1b[1m${t}\x1b[0m`,
  d: (t) => `\x1b[90m${t}\x1b[0m`,
};

/* ===================== قراءة الوسائط ===================== */
function args() {
  const out = { _: [] };
  const list = process.argv.slice(3);
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i += 1; }
    } else out._.push(a);
  }
  return out;
}

/* ===================== معرف الجهاز (نفس منطق النظام) ===================== */
function machineId() {
  const cpu = os.cpus()?.[0]?.model || 'unknown-cpu';
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpu.replace(/\s+/g, ' ').trim(),
    String(os.cpus()?.length || 0),
    String(Math.round(os.totalmem() / 1024 / 1024 / 1024)),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').toUpperCase()
    .slice(0, 16).match(/.{4}/g).join('-');
}

/* ===================== الأوامر ===================== */

function cmdInit(opts) {
  if (fs.existsSync(PRIVATE_FILE) && !opts.force) {
    console.log(C.y('⚠️  يوجد زوج مفاتيح بالفعل في tools/keys/'));
    console.log(C.d('   استخدم --force لإعادة التوليد (ستتوقف كل المفاتيح الصادرة سابقاً عن العمل)'));
    return;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pub = publicKey.export({ type: 'spki', format: 'pem' });

  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(PRIVATE_FILE, priv, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_FILE, pub);

  const module = `/**
 * المفتاح العام للتحقق من تراخيص التفعيل (Ed25519)
 * ----------------------------------------------------------------
 *  • يُولَّد مرة واحدة عند المطوّر بالأمر:  npm run keygen init
 *  • الأمر يكتب المفتاح العام هنا تلقائياً، ويحفظ المفتاح الخاص في
 *    tools/keys/private.pem  (مستثنى من Git — لا يُسلَّم للعميل أبداً)
 *  • ما دامت هذه القيمة فارغة يعمل النظام بدون تفعيل (وضع التطوير)
 * ----------------------------------------------------------------
 */
export const LICENSE_PUBLIC_KEY = \`${pub.trim()}\`;

export default LICENSE_PUBLIC_KEY;
`;
  fs.writeFileSync(PUBLIC_MODULE, module, 'utf8');

  console.log(C.g('✅ تم توليد زوج المفاتيح'));
  console.log(`   المفتاح الخاص : ${C.b('tools/keys/private.pem')}  ${C.r('(احتفظ به ولا تسلّمه لأحد)')}`);
  console.log(`   المفتاح العام : كُتب داخل ${C.b('server/src/lib/license-public-key.js')}`);
  console.log(C.y('\n   ⚠️ أعد بناء التطبيق (npm run app:build) حتى يسري التفعيل على النسخ الجديدة.'));
}

function loadPrivate() {
  if (!fs.existsSync(PRIVATE_FILE)) {
    console.log(C.r('✘ لا يوجد مفتاح خاص. نفّذ أولاً:  npm run keygen init'));
    process.exit(1);
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_FILE));
}

function loadPublic() {
  if (!fs.existsSync(PUBLIC_FILE)) {
    console.log(C.r('✘ لا يوجد مفتاح عام. نفّذ أولاً:  npm run keygen init'));
    process.exit(1);
  }
  return crypto.createPublicKey(fs.readFileSync(PUBLIC_FILE));
}

function cmdIssue(opts) {
  const machine = String(opts.machine || opts.m || '').trim().toUpperCase();
  if (!machine) {
    console.log(C.r('✘ حدد معرف جهاز العميل:  --machine A1B2-C3D4-E5F6-7788'));
    console.log(C.d('   يظهر معرف الجهاز في شاشة التفعيل عند العميل، أو عبر: npm run keygen machine'));
    process.exit(1);
  }
  if (machine !== '*' && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(machine)) {
    console.log(C.r('✘ صيغة معرف الجهاز غير صحيحة. المتوقع: XXXX-XXXX-XXXX-XXXX'));
    process.exit(1);
  }

  let expires = null;
  if (opts.expires && opts.expires !== true) {
    expires = String(opts.expires).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      console.log(C.r('✘ صيغة التاريخ يجب أن تكون YYYY-MM-DD'));
      process.exit(1);
    }
  } else if (opts.days && opts.days !== true) {
    const d = new Date();
    d.setDate(d.getDate() + Number(opts.days));
    expires = d.toISOString().slice(0, 10);
  }

  const payload = {
    m: machine,
    c: opts.name && opts.name !== true ? String(opts.name) : null,
    e: expires,
    i: new Date().toISOString().slice(0, 10),
    t: opts.trial ? 'trial' : 'full',
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.sign(null, Buffer.from(`${PREFIX}.${body}`, 'utf8'), loadPrivate());
  const key = `${PREFIX}.${body}.${signature.toString('base64url')}`;

  // سجل المفاتيح الصادرة
  let registry = [];
  try { registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch { /* أول مفتاح */ }
  registry.push({ ...payload, key, issued_at_full: new Date().toISOString() });
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');

  console.log(C.g('✅ تم إصدار مفتاح التفعيل\n'));
  console.log(`   العميل     : ${payload.c || C.d('غير محدد')}`);
  console.log(`   الجهاز     : ${machine === '*' ? C.y('أي جهاز') : machine}`);
  console.log(`   الصلاحية   : ${expires || C.g('دائم')}`);
  console.log(`   النوع      : ${payload.t === 'trial' ? 'تجريبي' : 'كامل'}\n`);
  console.log(C.b('   المفتاح:'));
  console.log(`\n${key}\n`);

  if (opts.out && opts.out !== true) {
    fs.writeFileSync(String(opts.out), key, 'utf8');
    console.log(C.d(`   حُفظ أيضاً في: ${opts.out}`));
  }
  console.log(C.d(`   سجل الإصدارات: tools/keys/issued.json (${registry.length} مفتاح)`));
}

function cmdVerify(opts) {
  const key = String(opts._[0] || opts.key || '').replace(/\s+/g, '');
  if (!key) { console.log(C.r('✘ مرر المفتاح:  npm run keygen verify -- <المفتاح>')); process.exit(1); }

  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) { console.log(C.r('✘ صيغة المفتاح غير صحيحة')); process.exit(1); }

  const okSig = crypto.verify(null, Buffer.from(`${PREFIX}.${parts[1]}`, 'utf8'), loadPublic(), Buffer.from(parts[2], 'base64url'));
  if (!okSig) { console.log(C.r('✘ التوقيع غير صالح — المفتاح مزوّر أو معدَّل')); process.exit(1); }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const expired = payload.e && new Date(`${payload.e}T23:59:59`) < new Date();
  console.log(C.g('✅ التوقيع صحيح'));
  console.log(`   العميل   : ${payload.c || '—'}`);
  console.log(`   الجهاز   : ${payload.m}`);
  console.log(`   الصلاحية : ${payload.e || 'دائم'} ${expired ? C.r('(منتهية)') : C.g('(سارية)')}`);
  console.log(`   الإصدار  : ${payload.i}`);
  console.log(`   يعمل على هذا الجهاز: ${payload.m === '*' || payload.m === machineId() ? C.g('نعم') : C.y('لا — مخصص لجهاز آخر')}`);
}

function cmdList() {
  let registry = [];
  try { registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch { /* لا يوجد */ }
  if (!registry.length) { console.log(C.d('لا توجد مفاتيح صادرة بعد.')); return; }
  console.log(C.b(`المفاتيح الصادرة (${registry.length}):\n`));
  registry.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${r.c || '—'}  |  ${r.m}  |  ${r.e || 'دائم'}  |  ${r.i}`);
  });
  console.log(C.d('\nالمفاتيح الكاملة محفوظة في tools/keys/issued.json'));
}

function cmdMachine() {
  console.log(C.b('معرف هذا الجهاز:'));
  console.log(`\n   ${C.g(machineId())}\n`);
  console.log(C.d('   يظهر نفس المعرف في شاشة التفعيل داخل التطبيق.'));
}

function help() {
  console.log(`
${C.b('أداة توليد مفاتيح تفعيل نظام إدارة الصيدليات')}

  ${C.g('npm run keygen init')}                        تهيئة زوج المفاتيح (مرة واحدة فقط)
  ${C.g('npm run keygen machine')}                     عرض معرف هذا الجهاز
  ${C.g('npm run keygen issue -- --machine <ID>')}     إصدار مفتاح تفعيل
  ${C.g('npm run keygen verify -- <KEY>')}             التحقق من مفتاح
  ${C.g('npm run keygen list')}                        عرض سجل المفاتيح الصادرة

${C.b('خيارات الإصدار:')}
  --machine <ID>     معرف جهاز العميل، أو "*" ليعمل على أي جهاز
  --name "<الاسم>"    اسم الصيدلية أو العميل
  --days <عدد>       صلاحية بعدد الأيام
  --expires <تاريخ>  صلاحية حتى تاريخ محدد YYYY-MM-DD
  --trial            تعليم المفتاح كنسخة تجريبية
  --out <ملف>        حفظ المفتاح في ملف
`);
}

const cmd = process.argv[2];
const opts = args();

switch (cmd) {
  case 'init': cmdInit(opts); break;
  case 'issue': cmdIssue(opts); break;
  case 'verify': cmdVerify(opts); break;
  case 'list': cmdList(); break;
  case 'machine': cmdMachine(); break;
  default: help();
}
