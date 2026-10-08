/** مكتبة مكونات الواجهة */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, Check, AlertTriangle, Info, Loader2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '../lib/format.js';

/* ============ التنبيهات (Toasts) ============ */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  const icons = {
    success: <Check className="h-4 w-4" />,
    error: <AlertTriangle className="h-4 w-4" />,
    info: <Info className="h-4 w-4" />,
  };
  const styles = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-ink-800',
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2 no-print">
        {toasts.map((t) => (
          <div key={t.id} className={cn('flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-pop animate-slide-up max-w-sm', styles[t.type])}>
            {icons[t.type]}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ============ الحالات ============ */
export function Spinner({ className = '' }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function Loading({ label = 'جاري التحميل...' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm font-bold text-ink-400">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="mb-1 rounded-2xl bg-ink-100 p-4 text-ink-400"><Icon className="h-7 w-7" /></div>
      <p className="font-extrabold text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-400">{hint}</p>}
      {action}
    </div>
  );
}

/* ============ البطاقات ============ */
export function Card({ children, className = '', ...props }) {
  return <div className={cn('card', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, icon: Icon, action, className = '' }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}>
      <div className="flex items-center gap-3">
        {Icon && <div className="rounded-xl bg-brand-50 p-2 text-brand-600"><Icon className="h-5 w-5" /></div>}
        <div>
          <h3 className="font-extrabold text-ink-900">{title}</h3>
          {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', trend }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    blue: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600',
    ink: 'bg-ink-100 text-ink-600',
  };
  return (
    <div className="card p-4 transition hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink-400">{label}</p>
          <p className="num mt-1.5 text-2xl font-extrabold text-ink-900">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-ink-400">{sub}</p>}
        </div>
        {Icon && <div className={cn('shrink-0 rounded-xl p-2.5', tones[tone])}><Icon className="h-5 w-5" /></div>}
      </div>
      {trend}
    </div>
  );
}

/* ============ الشارات ============ */
export function Badge({ children, className = '', tone }) {
  const tones = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-sky-100 text-sky-700',
    gray: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return <span className={cn('badge', tone ? tones[tone] : '', className)}>{children}</span>;
}

/* ============ الحقول ============ */
export function Field({ label, children, className = '', hint, required }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-rose-500"> *</span>}</label>}
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={cn('input', className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={cn('input cursor-pointer', className)} {...props}>{children}</select>;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cn('input min-h-[84px]', className)} {...props} />;
}

/* ============ النافذة المنبثقة ============ */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm no-print"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={cn('my-8 w-full rounded-2xl bg-white shadow-pop animate-slide-up', sizes[size])} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-ink-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3.5 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title = 'تأكيد العملية', message, confirmLabel = 'تأكيد', danger }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm"
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />} {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-sm leading-7 text-ink-600">{message}</p>
    </Modal>
  );
}

/* ============ الجداول ============ */
export function Table({ columns, rows, renderRow, empty, loading, footer }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} className={c.className}>{c.title ?? c}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={columns.length}><Loading /></td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={columns.length}>{empty || <EmptyState />}</td></tr>
          )}
          {!loading && rows.map(renderRow)}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return <div className="px-1 py-2 text-xs text-ink-400">الإجمالي: {total ?? 0}</div>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      <span className="text-xs font-bold text-ink-400">صفحة {page} من {pages} · الإجمالي {total}</span>
      <div className="flex items-center gap-1.5">
        <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronRight className="h-4 w-4" /> السابق
        </button>
        <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          التالي <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ============ أدوات أخرى ============ */
export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 no-print">
      <div className="flex items-center gap-3">
        {Icon && <div className="rounded-2xl bg-white p-2.5 text-brand-600 shadow-card"><Icon className="h-6 w-6" /></div>}
        <div>
          <h1 className="text-xl font-extrabold text-ink-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-ink-100 p-1 no-print">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition',
            value === t.value ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {t.icon && <t.icon className="h-4 w-4" />} {t.label}
          {t.count !== undefined && <span className="rounded-md bg-ink-100 px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function DateRange({ from, to, onChange, className = '' }) {
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <Field label="من تاريخ">
        <Input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      </Field>
      <Field label="إلى تاريخ">
        <Input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
      </Field>
    </div>
  );
}
