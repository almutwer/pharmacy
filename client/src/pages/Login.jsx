import React, { useState } from 'react';
import { Pill, LogIn, ShieldCheck, Boxes, TrendingUp, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { Field, Input, Spinner } from '../components/ui.jsx';

const DEMO = [
  ['admin', 'admin123', 'مدير النظام'],
  ['manager', 'manager123', 'مدير الصيدلية'],
  ['pharmacist', 'pharma123', 'صيدلي'],
  ['cashier', 'cash123', 'كاشير'],
];

export default function Login() {
  const { login } = useApp();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form.username.trim(), form.password);
    } catch (err) {
      setError(err.message || 'تعذر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* الجانب التعريفي */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-10 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="rounded-2xl bg-brand-600 p-2.5"><Pill className="h-7 w-7" /></div>
          <div>
            <p className="text-lg font-extrabold">نظام إدارة الصيدليات</p>
            <p className="text-xs font-bold text-ink-400">Pharmacy Management System</p>
          </div>
        </div>

        <div className="relative space-y-7">
          <h1 className="text-4xl font-extrabold leading-tight">
            إدارة متكاملة لصيدليتك<br />
            <span className="text-brand-400">من المخزون حتى الأرباح</span>
          </h1>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Boxes, 'مخزون بالدفعات', 'تتبع التشغيلات وتواريخ الصلاحية وصرف الأقرب انتهاءً أولاً'],
              [BookOpen, 'دليل أدوية مرجعي', 'مرجع كامل للأدوية لا يظهر في المخزون ويُستخدم للإدخال السريع'],
              [TrendingUp, 'أرباح ومصروفات', 'تقارير ربحية دقيقة: المبيعات، التكلفة، المصروفات، صافي الربح'],
              [ShieldCheck, 'صلاحيات وأمان', 'أدوار متعددة وسجل نشاط كامل لكل عملية داخل النظام'],
            ].map(([Icon, title, text]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Icon className="mb-2 h-5 w-5 text-brand-400" />
                <p className="font-extrabold">{title}</p>
                <p className="mt-1 text-xs leading-6 text-ink-300">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs font-bold text-ink-500">© {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
      </div>

      {/* نموذج الدخول */}
      <div className="flex items-center justify-center bg-ink-50 p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
            <div className="rounded-2xl bg-brand-600 p-2.5 text-white"><Pill className="h-6 w-6" /></div>
            <p className="text-lg font-extrabold">نظام إدارة الصيدليات</p>
          </div>

          <div className="card p-7">
            <h2 className="text-2xl font-extrabold text-ink-900">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-ink-400">أدخل بيانات حسابك للمتابعة إلى لوحة التحكم</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="اسم المستخدم" required>
                <Input
                  autoFocus value={form.username} placeholder="admin"
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </Field>
              <Field label="كلمة المرور" required>
                <Input
                  type="password" value={form.password} placeholder="••••••••"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>

              {error && (
                <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
              )}

              <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
                {busy ? <Spinner className="h-5 w-5 text-white" /> : <LogIn className="h-5 w-5" />}
                دخول النظام
              </button>
            </form>

            <div className="mt-6 border-t border-ink-100 pt-4">
              <p className="mb-2 text-xs font-extrabold text-ink-400">حسابات تجريبية (اضغط للتعبئة):</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO.map(([u, p, label]) => (
                  <button
                    key={u} type="button"
                    onClick={() => setForm({ username: u, password: p })}
                    className="rounded-xl border border-ink-200 px-3 py-2 text-right text-xs font-bold text-ink-600 transition hover:border-brand-400 hover:bg-brand-50"
                  >
                    <span className="block text-ink-900">{label}</span>
                    <span className="text-[11px] text-ink-400">{u} / {p}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
