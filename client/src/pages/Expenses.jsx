import React, { useCallback, useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Wallet, Plus, Search, Pencil, Trash2, Filter, Tags, TrendingDown } from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, CardHeader, Table, Pagination, Badge, Field, Input, Select, Textarea,
  Modal, useToast, StatCard, ConfirmDialog, EmptyState,
} from '../components/ui.jsx';
import { fmtNum, fmtDate, todayStr, monthStartStr, PAYMENT_METHODS } from '../lib/format.js';

const COLORS = ['#12856b', '#1fa583', '#42c09c', '#78d9ba', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b', '#14b8a6'];
const emptyExpense = () => ({ date: todayStr(), category: '', description: '', amount: '', payment_method: 'cash', reference: '' });

export default function Expenses() {
  const { currency, can } = useApp();
  const toast = useToast();

  const [filters, setFilters] = useState({ q: '', category: '', from: monthStartStr(), to: todayStr() });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, pages: 1, sum: 0, byCategory: [] });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [catModal, setCatModal] = useState(false);

  const loadCats = useCallback(() => api.get('/expenses/categories').then((r) => setCategories(r.data)), []);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRes(await api.get('/expenses', { ...filters, page, limit: 20 })); } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

  const save = async () => {
    try {
      if (form.id) { await api.put(`/expenses/${form.id}`, form); toast.success('تم تحديث المصروف'); }
      else { await api.post('/expenses', form); toast.success('تم تسجيل المصروف'); }
      setForm(null); load(); loadCats();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { await api.del(`/expenses/${deleteId}`); toast.success('تم حذف المصروف'); setDeleteId(null); load(); }
    catch (err) { toast.error(err.message); setDeleteId(null); }
  };

  const avg = res.total > 0 ? res.sum / res.total : 0;
  const topCat = res.byCategory?.[0];

  return (
    <div>
      <PageHeader
        title="المصروفات" subtitle="مصاريف التشغيل التي تُخصم من الأرباح" icon={Wallet}
        actions={can('pharmacist') && (
          <>
            {can('manager') && <button className="btn-outline" onClick={() => setCatModal(true)}><Tags className="h-4 w-4" /> التصنيفات</button>}
            <button className="btn-primary" onClick={() => setForm(emptyExpense())}><Plus className="h-4 w-4" /> مصروف جديد</button>
          </>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي المصروفات" value={`${fmtNum(res.sum)} ${currency}`} sub="خلال الفترة المحددة" icon={TrendingDown} tone="rose" />
        <StatCard label="عدد العمليات" value={res.total} icon={Wallet} tone="brand" />
        <StatCard label="متوسط المصروف" value={`${fmtNum(avg)} ${currency}`} icon={Wallet} tone="blue" />
        <StatCard label="أعلى بند" value={topCat?.category || '—'} sub={topCat ? `${fmtNum(topCat.amount)} ${currency}` : ''} icon={Tags} tone="amber" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="بحث" className="min-w-[180px] flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input className="pr-9" placeholder="الوصف أو المرجع" value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
              </div>
            </Field>
            <Field label="التصنيف">
              <Select value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}>
                <option value="">الكل</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="من"><Input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /></Field>
            <Field label="إلى"><Input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></Field>
            <button className="btn-ghost" onClick={() => setFilters({ q: '', category: '', from: monthStartStr(), to: todayStr() })}>
              <Filter className="h-4 w-4" /> تعيين
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader title="توزيع المصروفات" subtitle="حسب التصنيف" icon={Tags} />
          <div className="p-2">
            {!res.byCategory?.length ? <EmptyState title="لا توجد بيانات" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={res.byCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {res.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${fmtNum(v)} ${currency}`} contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tajawal' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Table
        loading={loading}
        columns={['التاريخ', 'التصنيف', 'الوصف', 'المبلغ', 'طريقة الدفع', 'المرجع', 'المستخدم', '']}
        rows={res.data}
        empty={<EmptyState title="لا توجد مصروفات" hint="سجّل أول مصروف لتتبع أرباحك بدقة" icon={Wallet} />}
        renderRow={(e) => (
          <tr key={e.id}>
            <td className="text-ink-500">{fmtDate(e.date)}</td>
            <td><Badge tone="brand">{e.category}</Badge></td>
            <td className="font-bold text-ink-800">{e.description || '—'}</td>
            <td className="num font-extrabold text-rose-600">{fmtNum(e.amount)} {currency}</td>
            <td className="text-ink-500">{PAYMENT_METHODS[e.payment_method] || e.payment_method}</td>
            <td className="text-xs text-ink-400">{e.reference || '—'}</td>
            <td className="text-xs text-ink-400">{e.user_name || '—'}</td>
            <td>
              {can('manager') && (
                <div className="flex gap-1">
                  <button className="btn-outline btn-sm" onClick={() => setForm({ ...e })}><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="btn-outline btn-sm text-rose-600" onClick={() => setDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </td>
          </tr>
        )}
      />
      <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />

      <Modal
        open={!!form} onClose={() => setForm(null)} size="sm"
        title={form?.id ? 'تعديل المصروف' : 'تسجيل مصروف جديد'}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
          <button className="btn-primary" onClick={save}>حفظ</button></>}
      >
        {form && (
          <div className="space-y-3">
            <Field label="التاريخ" required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="التصنيف" required>
              <Input list="expense-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="اختر أو اكتب تصنيفاً جديداً" />
              <datalist id="expense-cats">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </Field>
            <Field label="المبلغ" required>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="طريقة الدفع">
              <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="رقم المرجع / السند"><Input value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            <Field label="الوصف"><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {catModal && <CategoriesModal categories={categories} onClose={() => setCatModal(false)} onChange={loadCats} />}

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={remove} danger
        title="حذف المصروف" confirmLabel="حذف" message="سيتم حذف هذا المصروف نهائياً وسينعكس على تقارير الأرباح."
      />
    </div>
  );
}

function CategoriesModal({ categories, onClose, onChange }) {
  const toast = useToast();
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    try { await api.post('/expenses/categories', { name: name.trim() }); setName(''); onChange(); toast.success('تمت الإضافة'); }
    catch (err) { toast.error(err.message); }
  };
  const remove = async (id) => {
    try { await api.del(`/expenses/categories/${id}`); onChange(); } catch (err) { toast.error(err.message); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="تصنيفات المصروفات" footer={<button className="btn-ghost" onClick={onClose}>إغلاق</button>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم التصنيف الجديد" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /></button>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
              <span className="font-bold text-ink-700">{c.name}</span>
              <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
