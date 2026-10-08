import React, { useCallback, useEffect, useState } from 'react';
import { Truck, Users, Plus, Search, Pencil, Trash2, Eye, Phone, Wallet, Receipt } from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, Table, Badge, Field, Input, Textarea, Modal, useToast,
  StatCard, ConfirmDialog, EmptyState, Loading,
} from '../components/ui.jsx';
import { fmtNum, fmtDate } from '../lib/format.js';

function PartiesPage({ kind }) {
  const isSupplier = kind === 'suppliers';
  const { currency, can } = useApp();
  const toast = useToast();

  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api.get(`/${kind}`, { q })).data); } finally { setLoading(false); }
  }, [kind, q]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const save = async () => {
    try {
      if (form.id) { await api.put(`/${kind}/${form.id}`, form); toast.success('تم التحديث'); }
      else { await api.post(`/${kind}`, form); toast.success('تمت الإضافة'); }
      setForm(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { const r = await api.del(`/${kind}/${deleteId}`); toast.success(r.message || 'تم الحذف'); setDeleteId(null); load(); }
    catch (err) { toast.error(err.message); setDeleteId(null); }
  };

  const totalBalance = rows.reduce((s, r) => s + (r.balance || 0), 0);
  const totalVolume = rows.reduce((s, r) => s + (isSupplier ? r.total_purchases : r.total_sales) || 0, 0);

  return (
    <div>
      <PageHeader
        title={isSupplier ? 'الموردون' : 'العملاء'}
        subtitle={isSupplier ? 'بيانات شركات التوريد والمستحقات المالية' : 'سجل العملاء وحساباتهم'}
        icon={isSupplier ? Truck : Users}
        actions={<button className="btn-primary" onClick={() => setForm({ name: '', phone: '', email: '', address: '', notes: '', active: 1, ...(isSupplier ? { contact: '', tax_number: '' } : {}) })}>
          <Plus className="h-4 w-4" /> {isSupplier ? 'مورد جديد' : 'عميل جديد'}
        </button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={isSupplier ? 'عدد الموردين' : 'عدد العملاء'} value={rows.length} icon={isSupplier ? Truck : Users} tone="brand" />
        <StatCard label={isSupplier ? 'إجمالي المشتريات' : 'إجمالي المبيعات'} value={`${fmtNum(totalVolume)} ${currency}`} icon={Receipt} tone="blue" />
        <StatCard label={isSupplier ? 'المستحق للموردين' : 'ذمم العملاء'} value={`${fmtNum(totalBalance)} ${currency}`} icon={Wallet} tone="rose" />
      </div>

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input className="pr-9" placeholder="بحث بالاسم أو رقم الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Table
        loading={loading}
        columns={['الاسم', 'الجوال', isSupplier ? 'مسؤول التواصل' : 'العنوان', 'الفواتير', isSupplier ? 'إجمالي المشتريات' : 'إجمالي المبيعات', 'الرصيد', 'الحالة', '']}
        rows={rows}
        empty={<EmptyState title="لا توجد سجلات" icon={isSupplier ? Truck : Users} />}
        renderRow={(r) => (
          <tr key={r.id}>
            <td className="font-extrabold text-ink-900">{r.name}</td>
            <td className="num text-ink-600">{r.phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-ink-400" /> {r.phone}</span> : '—'}</td>
            <td className="text-ink-500">{(isSupplier ? r.contact : r.address) || '—'}</td>
            <td className="num">{r.invoices_count}</td>
            <td className="num font-bold">{fmtNum(isSupplier ? r.total_purchases : r.total_sales)} {currency}</td>
            <td className={`num font-extrabold ${r.balance > 0 ? 'text-rose-600' : 'text-ink-400'}`}>{fmtNum(r.balance)}</td>
            <td>{r.active ? <Badge tone="green">نشط</Badge> : <Badge tone="gray">موقوف</Badge>}</td>
            <td>
              <div className="flex gap-1">
                <button className="btn-outline btn-sm" onClick={async () => setDetail(await api.get(`/${kind}/${r.id}`))}><Eye className="h-3.5 w-3.5" /></button>
                {can('pharmacist') && <button className="btn-outline btn-sm" onClick={() => setForm({ ...r })}><Pencil className="h-3.5 w-3.5" /></button>}
                {can('manager') && <button className="btn-outline btn-sm text-rose-600" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </td>
          </tr>
        )}
      />

      <Modal
        open={!!form} onClose={() => setForm(null)} size="sm"
        title={form?.id ? `تعديل: ${form.name}` : isSupplier ? 'إضافة مورد' : 'إضافة عميل'}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
          <button className="btn-primary" onClick={save}>حفظ</button></>}
      >
        {form && (
          <div className="space-y-3">
            <Field label="الاسم" required><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="رقم الجوال"><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            {isSupplier && <Field label="مسؤول التواصل"><Input value={form.contact || ''} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>}
            {isSupplier && <Field label="الرقم الضريبي"><Input value={form.tax_number || ''} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} /></Field>}
            <Field label="البريد الإلكتروني"><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="العنوان"><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="ملاحظات"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!detail} onClose={() => setDetail(null)} size="md"
        title={detail?.data?.name || ''} subtitle={detail?.data?.phone || ''}
        footer={<button className="btn-ghost" onClick={() => setDetail(null)}>إغلاق</button>}
      >
        {!detail ? <Loading /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Info label="عدد الفواتير" value={detail.data.invoices_count} />
              <Info label={isSupplier ? 'إجمالي المشتريات' : 'إجمالي المبيعات'} value={`${fmtNum(isSupplier ? detail.data.total_purchases : detail.data.total_sales)} ${currency}`} />
              <Info label="الرصيد المستحق" value={`${fmtNum(detail.data.balance)} ${currency}`} />
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>الحالة</th></tr></thead>
                <tbody>
                  {detail.invoices.length === 0 && <tr><td colSpan={5}><EmptyState title="لا توجد فواتير" /></td></tr>}
                  {detail.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-bold">{i.invoice_no}</td>
                      <td className="text-ink-500">{fmtDate(i.date)}</td>
                      <td className="num font-extrabold">{fmtNum(i.total)}</td>
                      <td className="num">{fmtNum(i.paid)}</td>
                      <td><Badge tone={i.status === 'cancelled' ? 'red' : 'green'}>{i.status === 'cancelled' ? 'ملغاة' : 'سارية'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={remove} danger
        title="حذف السجل" confirmLabel="حذف"
        message="سيتم الحذف نهائياً إن لم توجد فواتير مرتبطة، وإلا سيتم الإيقاف فقط."
      />
    </div>
  );
}

const Info = ({ label, value }) => (
  <div className="rounded-xl bg-ink-50 px-3 py-2">
    <p className="text-[11px] font-bold text-ink-400">{label}</p>
    <p className="num font-extrabold text-ink-800">{value}</p>
  </div>
);

export const Suppliers = () => <PartiesPage kind="suppliers" />;
export const Customers = () => <PartiesPage kind="customers" />;
