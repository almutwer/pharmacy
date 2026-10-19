/**
 * النسخ الاحتياطي والاستعادة ومسح بيانات النظام
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  DatabaseBackup, Download, Upload, HardDriveDownload, Trash2, ShieldAlert, AlertTriangle,
  CheckCircle2, Loader2, RefreshCw, FileJson, Info, Eraser,
} from 'lucide-react';
import api, { downloadFile, readJsonFile } from '../../api.js';
import { useApp } from '../../context/AppContext.jsx';
import {
  Card, CardHeader, Field, Input, Select, Table, Badge, Modal, useToast, EmptyState,
} from '../../components/ui.jsx';
import { fmtDateTime, fmtInt } from '../../lib/format.js';

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} ميجا` : `${Math.round(n / 1024)} كيلو`);

export default function Maintenance() {
  const { can } = useApp();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setFiles((await api.get('/settings/backups')).data); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadBackup = async () => {
    setBusy('download');
    try {
      await downloadFile('/settings/backup', `نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('تم تنزيل النسخة الاحتياطية');
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };

  const saveOnDevice = async () => {
    setBusy('save');
    try {
      const r = await api.post('/settings/backups');
      toast.success(`تم حفظ النسخة: ${r.name}`);
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };

  const removeFile = async (name) => {
    try { await api.del(`/settings/backups/${name}`); toast.success('تم حذف النسخة'); load(); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      {/* ======= النسخ الاحتياطي ======= */}
      <Card>
        <CardHeader
          title="النسخ الاحتياطي" icon={DatabaseBackup}
          subtitle="نسخة كاملة من كل بيانات النظام بصيغة JSON — تصلح للاستعادة على أي جهاز"
          action={(
            <div className="flex gap-2">
              <button className="btn-outline btn-sm" onClick={saveOnDevice} disabled={busy === 'save'}>
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />} حفظ نسخة على الجهاز
              </button>
              <button className="btn-primary btn-sm" onClick={downloadBackup} disabled={busy === 'download'}>
                {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تنزيل نسخة
              </button>
            </div>
          )}
        />
        <div className="px-5 pb-1 pt-4">
          <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-6 text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p>
              النسخة تشمل: الإعدادات، المستخدمين وكلمات مرورهم المشفّرة، دليل الأدوية، الأصناف والدفعات،
              المبيعات والمشتريات والمصروفات وحركات المخزون. احتفظ بها في مكان آمن خارج الجهاز.
              <br />
              كما ينشئ النظام <b>نسخة أمان تلقائية</b> قبل أي عملية استعادة أو مسح.
            </p>
          </div>
        </div>
        <Table
          loading={loading}
          columns={['اسم الملف', 'التاريخ', 'الحجم', '']}
          rows={files}
          empty={<EmptyState title="لا توجد نسخ محفوظة على الجهاز" hint="اضغط «حفظ نسخة على الجهاز» لإنشاء واحدة" icon={FileJson} />}
          renderRow={(f) => (
            <tr key={f.name}>
              <td className="font-mono text-[11px]">
                {f.name}
                {f.name.includes('before-wipe') && <Badge tone="amber" className="mr-2">قبل المسح</Badge>}
                {f.name.includes('before-restore') && <Badge tone="violet" className="mr-2">قبل الاستعادة</Badge>}
              </td>
              <td className="text-xs text-ink-500">{fmtDateTime(f.created_at)}</td>
              <td className="num text-xs">{kb(f.size)}</td>
              <td>
                <div className="flex justify-end gap-1">
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => downloadFile(`/settings/backups/${f.name}`, f.name).catch((e) => toast.error(e.message))}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {can('admin') && (
                    <button className="btn-outline btn-sm text-rose-600" onClick={() => removeFile(f.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
        />
      </Card>

      {can('admin') && <RestoreCard onRestored={load} savedFiles={files} />}
      {can('admin') && <WipeCard onDone={load} />}

      {!can('admin') && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="h-5 w-5" />
          استعادة النسخ ومسح البيانات متاحان لمدير النظام فقط.
        </div>
      )}
    </div>
  );
}

/* ==================== الاستعادة ==================== */
function RestoreCard({ onRestored, savedFiles }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [savedName, setSavedName] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(null);

  const reset = () => { setFile(null); setData(null); setInfo(null); setSavedName(''); setPassword(''); };

  const pickFile = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const json = await readJsonFile(f);
      const res = await api.post('/settings/restore/inspect', { data: json });
      setFile(f); setData(json); setInfo(res); setSavedName('');
    } catch (err) { toast.error(err.message); reset(); } finally { setBusy(false); }
  };

  const pickSaved = async (name) => {
    setSavedName(name);
    setFile(null); setData(null); setInfo(null);
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/backups/${name}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pharmacy_token')}` },
      });
      const json = await res.json();
      const check = await api.post('/settings/restore/inspect', { data: json });
      setData(json); setInfo(check);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const res = await api.post('/settings/restore', { data, password });
      setDone(res);
      setConfirmOpen(false);
      reset();
      toast.success('تمت استعادة النسخة الاحتياطية بنجاح');
      onRestored?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader
        title="استعادة نسخة احتياطية" icon={Upload}
        subtitle="استبدال كل البيانات الحالية بمحتوى ملف النسخة — لا يمكن التراجع إلا بنسخة الأمان التلقائية"
      />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ملف من جهازك" hint="ملف JSON تم تنزيله من هذا النظام">
            <input
              type="file" accept=".json,application/json"
              className="w-full cursor-pointer rounded-xl border border-ink-200 bg-white p-2 text-xs file:ml-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-700"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </Field>
          <Field label="أو نسخة محفوظة على الجهاز">
            <Select value={savedName} onChange={(e) => pickSaved(e.target.value)}>
              <option value="">— اختر نسخة —</option>
              {savedFiles.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </Select>
          </Field>
        </div>

        {busy && !info && <p className="text-xs text-ink-400"><Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" /> جاري فحص الملف…</p>}

        {info && (
          <div className="space-y-3 rounded-2xl border border-ink-200 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="brand">إصدار {info.version}</Badge>
              <Badge tone="gray">{fmtInt(info.total_rows)} سجل</Badge>
              <Badge tone="gray">{info.users_count} مستخدم</Badge>
              {info.generated_at && <span className="text-ink-400">أُنشئت: {fmtDateTime(info.generated_at)}</span>}
              {file && <span className="text-ink-400">({file.name})</span>}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {info.tables.map((t) => (
                <div key={t} className="rounded-xl bg-ink-50 px-3 py-2">
                  <p className="num text-sm font-black text-ink-800">{fmtInt(info.counts[t])}</p>
                  <p className="text-[10px] font-bold text-ink-500">{info.labels?.[t] || t}</p>
                </div>
              ))}
            </div>

            {info.warnings?.map((w) => (
              <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                <AlertTriangle className="ml-1 inline h-3.5 w-3.5" /> {w}
              </p>
            ))}

            <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 p-3">
              <p className="text-[11px] font-bold leading-5 text-rose-700">
                سيتم حذف كل البيانات الحالية واستبدالها بمحتوى هذه النسخة.
                <br />
                سيحفظ النظام نسخة أمان تلقائية قبل التنفيذ.
              </p>
              <button className="btn-danger shrink-0" onClick={() => setConfirmOpen(true)}>
                <Upload className="h-4 w-4" /> استعادة الآن
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">
            <CheckCircle2 className="ml-1 inline h-4 w-4" />
            تمت الاستعادة. المستخدمون: {done.users_restored ? 'مستعادون من النسخة' : 'بقوا كما هم'} —
            نسخة الأمان: <span className="font-mono">{done.safety_backup}</span>
            {done.integrity_issues > 0 && <span className="text-rose-600"> — تنبيه: {done.integrity_issues} مشكلة ترابط بيانات</span>}
            <button className="btn-outline btn-sm mr-2" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" /> تحديث الصفحة
            </button>
          </div>
        )}
      </div>

      <Modal
        open={confirmOpen} onClose={() => setConfirmOpen(false)} size="sm"
        title="تأكيد الاستعادة"
        footer={(
          <>
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>إلغاء</button>
            <button className="btn-danger" onClick={restore} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} تأكيد الاستعادة
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold leading-6 text-rose-700">
            هذا الإجراء يستبدل جميع البيانات الحالية. أدخل كلمة مرورك للمتابعة.
          </p>
          <Field label="كلمة مرورك" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/* ==================== مسح البيانات ==================== */
function WipeCard({ onDone }) {
  const toast = useToast();
  const [scopes, setScopes] = useState([]);
  const [counts, setCounts] = useState({});
  const [scope, setScope] = useState('transactions');
  const [wipeCatalog, setWipeCatalog] = useState(false);
  const [wipeActivity, setWipeActivity] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/settings/wipe/scopes').then((r) => { setScopes(r.data); setCounts(r.counts); }).catch(() => {});
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post('/settings/wipe', {
        scope, wipe_catalog: wipeCatalog, wipe_activity: wipeActivity, password, confirm,
      });
      setResult(res);
      setOpen(false); setPassword(''); setConfirm('');
      toast.success(`تم مسح ${res.total_deleted} سجل`);
      api.get('/settings/wipe/scopes').then((r) => setCounts(r.counts)).catch(() => {});
      onDone?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Card className="border-rose-200">
      <CardHeader
        title="مسح بيانات النظام" icon={Eraser}
        subtitle="تصفير النظام للبدء من جديد — يُنشأ نسخة أمان تلقائية قبل التنفيذ"
      />
      <div className="space-y-4 p-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries({
            sales: 'فواتير بيع', purchases: 'فواتير شراء', expenses: 'مصروفات',
            products: 'أصناف مخزون', drug_catalog: 'أدوية في الدليل', stock_movements: 'حركة مخزون',
          }).map(([k, label]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2">
              <p className="num text-base font-black text-ink-800">{fmtInt(counts[k] || 0)}</p>
              <p className="text-[10px] font-bold text-ink-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {scopes.map((s) => (
            <label
              key={s.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                scope === s.value ? 'border-rose-400 bg-rose-50' : 'border-ink-200 hover:border-ink-300'
              }`}
            >
              <input
                type="radio" name="wipe-scope" className="mt-1 accent-rose-600"
                checked={scope === s.value} onChange={() => setScope(s.value)}
              />
              <span>
                <span className="block text-sm font-extrabold text-ink-800">{s.label}</span>
                <span className="block text-[11px] leading-5 text-ink-500">{s.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 rounded-xl bg-ink-50 p-3 text-xs">
          <label className={`flex items-center gap-2 ${scope === 'transactions' ? 'opacity-40' : 'cursor-pointer'}`}>
            <input
              type="checkbox" className="accent-rose-600" checked={wipeCatalog}
              disabled={scope === 'transactions'}
              onChange={(e) => setWipeCatalog(e.target.checked)}
            />
            حذف دليل الأدوية أيضاً ({fmtInt(counts.drug_catalog || 0)} دواء)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-rose-600" checked={wipeActivity} onChange={(e) => setWipeActivity(e.target.checked)} />
            حذف سجل النشاط
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 p-3">
          <p className="text-[11px] font-bold leading-5 text-rose-700">
            <AlertTriangle className="ml-1 inline h-4 w-4" />
            لا يمكن التراجع عن هذه العملية إلا عبر استعادة نسخة احتياطية.
            المستخدمون والإعدادات تبقى كما هي دائماً.
          </p>
          <button className="btn-danger shrink-0" onClick={() => setOpen(true)}>
            <Eraser className="h-4 w-4" /> مسح البيانات
          </button>
        </div>

        {result && (
          <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">
            <CheckCircle2 className="ml-1 inline h-4 w-4" />
            تم مسح «{result.scope_label}» — {fmtInt(result.total_deleted)} سجل.
            نسخة الأمان: <span className="font-mono">{result.safety_backup}</span>
          </div>
        )}
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} size="sm"
        title="تأكيد مسح البيانات"
        footer={(
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button>
            <button className="btn-danger" onClick={run} disabled={busy || !password || confirm.trim() !== 'مسح'}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} تنفيذ المسح
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold leading-6 text-rose-700">
            سيتم حذف: {scopes.find((s) => s.value === scope)?.label}
            {wipeCatalog && scope !== 'transactions' ? ' + دليل الأدوية' : ''}
            {wipeActivity ? ' + سجل النشاط' : ''}.
          </p>
          <Field label="اكتب كلمة «مسح» للتأكيد" required>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="مسح" autoFocus />
          </Field>
          <Field label="كلمة مرورك" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
