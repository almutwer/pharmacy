/** شاشة تفعيل النسخة — تظهر قبل تسجيل الدخول عندما يكون الجهاز غير مرخَّص */
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Copy, KeyRound, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../api.js';
import { Card, Field, Textarea, useToast } from '../components/ui.jsx';

export default function Activate({ status, onActivated }) {
  const toast = useToast();
  const [machineId, setMachineId] = useState(status?.machine_id || '');
  const [reason, setReason] = useState(status?.reason || '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (machineId) return;
    api.get('/license/status')
      .then((r) => { setMachineId(r.machine_id); setReason(r.reason); })
      .catch(() => {});
  }, [machineId]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
      toast.success('تم نسخ معرف الجهاز');
    } catch { toast.error('تعذر النسخ — انسخه يدوياً'); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!key.trim()) { toast.error('الصق مفتاح التفعيل أولاً'); return; }
    setBusy(true);
    try {
      const res = await api.post('/license/activate', { key: key.trim() });
      setDone(true);
      toast.success('تم تفعيل النسخة بنجاح');
      setTimeout(() => onActivated?.(res), 900);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <Card className="w-full max-w-xl overflow-hidden">
        <div className="bg-brand-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-2.5"><ShieldCheck className="h-7 w-7" /></div>
            <div>
              <h1 className="text-lg font-black">تفعيل نظام إدارة الصيدليات</h1>
              <p className="text-xs text-white/80">هذه النسخة مرخّصة لجهاز واحد ولا تعمل على غيره</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          {reason && !done && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {reason}
            </p>
          )}

          <div>
            <p className="mb-1.5 text-xs font-extrabold text-ink-700">معرف هذا الجهاز</p>
            <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 p-3">
              <code className="num flex-1 select-all text-center text-lg font-black tracking-wider text-brand-700" dir="ltr">
                {machineId || '—'}
              </code>
              <button type="button" className="btn-outline btn-sm shrink-0" onClick={copyId}>
                <Copy className="h-3.5 w-3.5" /> نسخ
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-500">
              أرسل هذا المعرف إلى الجهة التي زوّدتك بالنظام للحصول على مفتاح التفعيل الخاص بهذا الجهاز.
            </p>
          </div>

          <Field label="مفتاح التفعيل">
            <Textarea
              className="min-h-[110px] font-mono text-[11px]"
              dir="ltr"
              placeholder="PHRM1...."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={done}
            />
          </Field>

          <button className="btn-primary w-full py-3" disabled={busy || done}>
            {done ? <CheckCircle2 className="h-4 w-4" /> : busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {done ? 'تم التفعيل — جاري فتح النظام' : 'تفعيل النسخة'}
          </button>

          <p className="text-center text-[11px] text-ink-400">
            المفتاح مرتبط بمواصفات هذا الجهاز، ولا يعمل إذا نُسخ النظام إلى جهاز آخر.
          </p>
        </form>
      </Card>
    </div>
  );
}
