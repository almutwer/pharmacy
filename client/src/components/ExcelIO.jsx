/**
 * أدوات التصدير والاستيراد بصيغة Excel — تُستخدم في المخزون ودليل الأدوية
 */
import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet, Upload, FileDown, CheckCircle2, AlertTriangle,
  XCircle, Loader2, FileCheck2, RotateCcw,
} from 'lucide-react';
import api, { downloadFile, fileToBase64 } from '../api.js';
import { Modal, Field, Select, useToast } from './ui.jsx';

const ENTITIES = {
  products: {
    base: '/products',
    title: 'أصناف المخزون',
    exportName: () => `المخزون-${new Date().toISOString().slice(0, 10)}.xlsx`,
    templateName: 'قالب-المخزون.xlsx',
    unit: 'صنف',
  },
  batches: {
    base: '/inventory/batches',
    title: 'الدفعات وتواريخ الصلاحية',
    exportName: () => `الدفعات-${new Date().toISOString().slice(0, 10)}.xlsx`,
    templateName: 'قالب-تعديل-الدفعات.xlsx',
    unit: 'دفعة',
  },
  catalog: {
    base: '/catalog',
    title: 'دليل الأدوية',
    exportName: () => `دليل-الأدوية-${new Date().toISOString().slice(0, 10)}.xlsx`,
    templateName: 'قالب-دليل-الأدوية.xlsx',
    unit: 'دواء',
  },
};

/** زرّا التصدير والاستيراد */
export default function ExcelIO({ entity, filters = {}, onDone, canImport = true, size = '' }) {
  const cfg = ENTITIES[entity];
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = size === 'sm' ? 'btn-outline btn-sm' : 'btn-outline';

  const exportFile = async () => {
    setBusy(true);
    try {
      await downloadFile(`${cfg.base}/export`, cfg.exportName(), filters);
      toast.success(`تم تصدير ${cfg.title} إلى Excel`);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <button className={btn} onClick={exportFile} disabled={busy} title="تنزيل البيانات كملف Excel">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} تصدير Excel
      </button>
      {canImport && (
        <button className={btn} onClick={() => setOpen(true)} title="رفع ملف Excel لإضافة أو تحديث البيانات">
          <Upload className="h-4 w-4" /> استيراد Excel
        </button>
      )}
      {open && (
        <ImportModal
          cfg={cfg}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onDone?.(); }}
        />
      )}
    </>
  );
}

/* ==================== نافذة الاستيراد ==================== */
function ImportModal({ cfg, onClose, onDone }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const pick = (f) => {
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { toast.error('الملف يجب أن يكون بصيغة Excel أو CSV'); return; }
    setFile(f); setPreview(null); setResult(null);
  };

  const send = async (dryRun) => {
    if (!file) { toast.error('اختر ملفاً أولاً'); return; }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.post(`${cfg.base}/import-file`, {
        file: base64, filename: file.name, mode, dry_run: dryRun,
      });
      if (dryRun) setPreview(res);
      else {
        setResult(res);
        toast.success(`تم الاستيراد: ${res.created} جديد و${res.updated} محدّث`);
      }
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const summary = result || preview;

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={`استيراد ${cfg.title} من ملف Excel`}
      subtitle="نزّل القالب، املأه، ثم ارفعه — ويمكنك فحص الملف قبل التنفيذ"
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>{result ? 'إغلاق' : 'إلغاء'}</button>
          {!result && (
            <>
              <button className="btn-outline" onClick={() => send(true)} disabled={!file || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} فحص الملف
              </button>
              <button className="btn-primary" onClick={() => send(false)} disabled={!file || busy}>
                <Upload className="h-4 w-4" /> تنفيذ الاستيراد
              </button>
            </>
          )}
          {result && <button className="btn-primary" onClick={onDone}><CheckCircle2 className="h-4 w-4" /> تم</button>}
        </>
      )}
    >
      <div className="space-y-4">
        {/* القالب */}
        <div className="flex items-center justify-between rounded-xl border border-dashed border-brand-200 bg-brand-50/60 p-3">
          <div className="text-xs leading-6 text-ink-600">
            <p className="font-extrabold text-ink-800">لا تعرف الأعمدة المطلوبة؟</p>
            <p>نزّل القالب الجاهز — يحتوي على العناوين الصحيحة وورقة تعليمات.</p>
          </div>
          <button
            className="btn-outline btn-sm shrink-0"
            onClick={() => downloadFile(`${cfg.base}/template`, cfg.templateName).catch((e) => toast.error(e.message))}
          >
            <FileDown className="h-4 w-4" /> تنزيل القالب
          </button>
        </div>

        {/* اختيار الملف */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
            drag ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/50 hover:border-brand-300'
          }`}
        >
          <FileSpreadsheet className={`h-8 w-8 ${file ? 'text-brand-600' : 'text-ink-300'}`} />
          {file ? (
            <>
              <p className="text-sm font-extrabold text-ink-800">{file.name}</p>
              <p className="text-[11px] text-ink-400">{(file.size / 1024).toFixed(1)} كيلوبايت — اضغط لاختيار ملف آخر</p>
            </>
          ) : (
            <>
              <p className="text-sm font-extrabold text-ink-700">اسحب الملف هنا أو اضغط للاختيار</p>
              <p className="text-[11px] text-ink-400">الصيغ المدعومة: xlsx.‏ و csv.‏ — بحد أقصى 5000 صف</p>
            </>
          )}
          <input
            ref={inputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        {/* الخيارات */}
        {!result && cfg.base !== '/inventory/batches' && (
          <Field label="عند وجود سجل مطابق" hint="المطابقة بالمعرف، ثم الباركود، ثم الاسم">
            <Select value={mode} onChange={(e) => { setMode(e.target.value); setPreview(null); }}>
              <option value="upsert">تحديث بيانات السجل الموجود (موصى به)</option>
              <option value="insert">تجاهله وإضافة الجديد فقط</option>
            </Select>
          </Field>
        )}

        {/* النتيجة */}
        {summary && (
          <div className="space-y-3">
            <div className={`rounded-xl p-3 text-xs font-extrabold ${result ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {result
                ? <><CheckCircle2 className="ml-1 inline h-4 w-4" /> تم تنفيذ الاستيراد بنجاح</>
                : <><AlertTriangle className="ml-1 inline h-4 w-4" /> نتيجة الفحص التجريبي — لم يُحفظ أي شيء بعد</>}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="إجمالي الصفوف" value={summary.total} tone="gray" />
              <Stat label={`${cfg.unit} جديد`} value={summary.created} tone="green" />
              <Stat label="سيتم تحديثه" value={summary.updated} tone="blue" />
              <Stat label="متجاهل" value={summary.skipped} tone={summary.skipped ? 'amber' : 'gray'} />
            </div>

            {summary.opening_units > 0 && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-bold text-brand-700">
                سيتم تسجيل رصيد افتتاحي بمقدار {summary.opening_units} وحدة للأصناف الجديدة.
              </p>
            )}

            {summary.warnings?.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-amber-200">
                <div className="bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-700">
                  <AlertTriangle className="ml-1 inline h-4 w-4" /> {summary.warnings.length} تنبيه
                </div>
                <div className="max-h-36 overflow-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {summary.warnings.slice(0, 50).map((w, i) => (
                        <tr key={`${w.row}-${i}`} className="border-t border-ink-100">
                          <td className="p-2 num font-bold">{w.row}</td>
                          <td className="p-2">{w.name}</td>
                          <td className="p-2 text-amber-700">{w.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.retail_enabled > 0 && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-bold text-brand-700">
                تم تفعيل البيع بالتجزئة تلقائياً لـ {summary.retail_enabled} صنف (لوجود الوحدة الصغرى وعدد الوحدات).
              </p>
            )}

            {summary.unknown?.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                أعمدة غير معروفة تم تجاهلها: {summary.unknown.join('، ')}
              </p>
            )}

            {summary.errors?.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-rose-200">
                <div className="bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700">
                  <XCircle className="ml-1 inline h-4 w-4" /> {summary.errors.length} صف به مشكلة
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-ink-50 text-ink-500">
                      <tr><th className="p-2 text-right">الصف</th><th className="p-2 text-right">السجل</th><th className="p-2 text-right">السبب</th></tr>
                    </thead>
                    <tbody>
                      {summary.errors.slice(0, 100).map((e, i) => (
                        <tr key={`${e.row}-${i}`} className="border-t border-ink-100">
                          <td className="p-2 num font-bold">{e.row}</td>
                          <td className="p-2">{e.name}</td>
                          <td className="p-2 text-rose-600">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview && !result && (
              <button className="btn-ghost btn-sm" onClick={() => { setPreview(null); setFile(null); }}>
                <RotateCcw className="h-3.5 w-3.5" /> اختيار ملف آخر
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

const TONES = {
  gray: 'bg-ink-50 text-ink-600',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
};

const Stat = ({ label, value, tone }) => (
  <div className={`rounded-xl p-2.5 text-center ${TONES[tone] || TONES.gray}`}>
    <p className="num text-lg font-black">{value ?? 0}</p>
    <p className="text-[10px] font-bold opacity-80">{label}</p>
  </div>
);
