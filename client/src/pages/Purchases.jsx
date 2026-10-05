import React, { useCallback, useEffect, useState } from 'react';
import {
  ShoppingBag, Plus, Search, Eye, Ban, Printer, Trash2, BookOpen, Boxes, Wallet, Filter, FileClock, RotateCcw,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, Table, Pagination, Badge, Field, Input, Select, Modal, useToast,
  StatCard, ConfirmDialog, Loading, EmptyState,
} from '../components/ui.jsx';
import { fmtNum, fmtDate, PAYMENT_METHODS, todayStr, monthStartStr, expiryState, cn, fmtDateTime } from '../lib/format.js';

const emptyForm = () => ({
  supplier_id: '', supplier_invoice: '', date: todayStr(), discount: 0, tax: 0,
  paid: '', payment_method: 'cash', notes: '', items: [],
});

export default function Purchases() {
  const { currency, can } = useApp();
  const toast = useToast();

  const [filters, setFilters] = useState({ q: '', from: monthStartStr(), to: todayStr(), status: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, pages: 1, summary: {} });
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [draft, setDraft] = useState(null);          // مسودة محفوظة بانتظار الاستعادة
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRes(await api.get('/purchases', { ...filters, page, limit: 20 })); } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/suppliers', { active: 1 }).then((r) => setSuppliers(r.data)); }, []);

  // البحث عن مسودة لم تُحفظ (مثلاً بعد انقطاع التيار)
  useEffect(() => {
    if (!can('pharmacist')) return;
    api.get('/purchases/draft/current')
      .then((r) => { if (r.data && r.data.items?.length) setDraft(r); })
      .catch(() => {});
  }, [can]);

  // حفظ تلقائي للمسودة أثناء الإدخال
  useEffect(() => {
    if (!form || !can('pharmacist')) return undefined;
    const t = setTimeout(() => {
      const itemsCount = form.items?.length || 0;
      const total = (form.items || []).reduce(
        (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0) - (Number(i.discount) || 0), 0,
      );
      api.put('/purchases/draft/current', { data: form, items_count: itemsCount, total })
        .then(() => setDraftSavedAt(new Date()))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [form, can]);

  const clearDraft = useCallback(async () => {
    setDraft(null);
    setDraftSavedAt(null);
    try { await api.del('/purchases/draft/current'); } catch { /* تجاهل */ }
  }, []);

  const save = async () => {
    if (!form.items.length) { toast.error('أضف صنفاً واحداً على الأقل'); return; }
    try {
      const payload = {
        ...form,
        supplier_id: form.supplier_id || null,
        paid: form.paid === '' ? 0 : Number(form.paid),
        items: form.items.map((i) => ({
          product_id: i.product_id || null,
          catalog_id: i.catalog_id || null,
          qty: Number(i.qty), bonus_qty: Number(i.bonus_qty) || 0,
          unit_cost: Number(i.unit_cost), sale_price: Number(i.sale_price) || 0,
          discount: Number(i.discount) || 0,
          batch_no: i.batch_no || null, expiry_date: i.expiry_date || null,
        })),
      };
      const r = await api.post('/purchases', payload);
      toast.success(`تم حفظ فاتورة الشراء ${r.invoice_no} وإضافة الأصناف للمخزون`);
      setForm(null);
      await clearDraft();
      load();
    } catch (err) { toast.error(err.message); }
  };

  const cancelPurchase = async () => {
    try {
      await api.post(`/purchases/${cancelId}/cancel`);
      toast.success('تم إلغاء الفاتورة وسحب الكميات من المخزون');
      setCancelId(null);
      load();
    } catch (err) { toast.error(err.message); setCancelId(null); }
  };

  const pay = async () => {
    try {
      await api.post(`/purchases/${payFor.id}/pay`, { amount: Number(payFor.amount) });
      toast.success('تم تسجيل الدفعة');
      setPayFor(null);
      load();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <PageHeader
        title="المشتريات" subtitle="فواتير التوريد من الموردين — تُضاف الكميات للمخزون تلقائياً" icon={ShoppingBag}
        actions={<button className="btn-primary" onClick={() => setForm(emptyForm())}><Plus className="h-4 w-4" /> فاتورة شراء جديدة</button>}
      />

      {draft && !form && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <FileClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-extrabold">لديك فاتورة شراء لم تُحفظ</p>
              <p className="text-xs">
                {draft.items_count} صنف بقيمة {fmtNum(draft.total)} {currency} — آخر حفظ تلقائي: {fmtDateTime(draft.updated_at)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={clearDraft}>تجاهل وحذف</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => { setForm({ ...emptyForm(), ...draft.data }); setDraft(null); }}
            >
              <RotateCcw className="h-4 w-4" /> استعادة ومتابعة الإدخال
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="إجمالي المشتريات" value={`${fmtNum(res.summary?.total_amount)} ${currency}`} sub={`${res.total} فاتورة`} icon={ShoppingBag} tone="brand" />
        <StatCard label="المستحق للموردين" value={`${fmtNum(res.summary?.due_amount)} ${currency}`} icon={Wallet} tone="rose" />
        <StatCard label="عدد الموردين" value={suppliers.length} icon={Boxes} tone="violet" />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="بحث" className="min-w-[200px] flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input className="pr-9" placeholder="رقم الفاتورة أو المورد" value={filters.q}
                onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
            </div>
          </Field>
          <Field label="من"><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="إلى"><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="الحالة">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">الكل</option><option value="posted">مرحّلة</option><option value="cancelled">ملغاة</option>
            </Select>
          </Field>
          <button className="btn-ghost" onClick={() => setFilters({ q: '', from: monthStartStr(), to: todayStr(), status: '' })}>
            <Filter className="h-4 w-4" /> إعادة تعيين
          </button>
        </div>
      </Card>

      <Table
        loading={loading}
        columns={['رقم الفاتورة', 'فاتورة المورد', 'التاريخ', 'المورد', 'الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', '']}
        rows={res.data}
        renderRow={(p) => (
          <tr key={p.id}>
            <td className="font-extrabold text-ink-900">{p.invoice_no}</td>
            <td className="text-ink-500">{p.supplier_invoice || '—'}</td>
            <td className="text-ink-500">{fmtDate(p.date)}</td>
            <td>{p.supplier_name || '—'}</td>
            <td className="num text-center">{p.items_count}</td>
            <td className="num font-extrabold">{fmtNum(p.total)} {currency}</td>
            <td className="num text-brand-700">{fmtNum(p.paid)}</td>
            <td className={cn('num font-bold', p.total - p.paid > 0 ? 'text-rose-600' : 'text-ink-400')}>{fmtNum(p.total - p.paid)}</td>
            <td>{p.status === 'cancelled' ? <Badge tone="red">ملغاة</Badge> : <Badge tone="green">مرحّلة</Badge>}</td>
            <td>
              <div className="flex items-center gap-1">
                <button className="btn-outline btn-sm" onClick={async () => setDetail(await api.get(`/purchases/${p.id}`))}><Eye className="h-3.5 w-3.5" /></button>
                {can('manager') && p.status === 'posted' && p.total - p.paid > 0 && (
                  <button className="btn-outline btn-sm" onClick={() => setPayFor({ id: p.id, amount: +(p.total - p.paid).toFixed(2), max: +(p.total - p.paid).toFixed(2) })}>
                    <Wallet className="h-3.5 w-3.5" /> سداد
                  </button>
                )}
                {can('manager') && p.status === 'posted' && (
                  <button className="btn-outline btn-sm text-rose-600" onClick={() => setCancelId(p.id)}><Ban className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </td>
          </tr>
        )}
      />
      <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />

      {form && (
        <PurchaseForm
          form={form} setForm={setForm} suppliers={suppliers} currency={currency}
          savedAt={draftSavedAt}
          onClose={() => setForm(null)} onSave={save}
        />
      )}

      {/* تفاصيل فاتورة الشراء */}
      <Modal
        open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={`فاتورة شراء ${detail?.data?.invoice_no || ''}`}
        subtitle={detail ? `${detail.data.supplier_name || 'بدون مورد'} · ${fmtDate(detail.data.date)}` : ''}
        footer={<>
          <button className="btn-ghost" onClick={() => setDetail(null)}>إغلاق</button>
          <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button>
        </>}
      >
        {!detail ? <Loading /> : (
          <div className="print-area space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="الإجمالي" value={`${fmtNum(detail.data.total)} ${currency}`} />
              <Info label="المدفوع" value={`${fmtNum(detail.data.paid)} ${currency}`} />
              <Info label="المتبقي" value={`${fmtNum(detail.data.total - detail.data.paid)} ${currency}`} />
              <Info label="طريقة الدفع" value={PAYMENT_METHODS[detail.data.payment_method]} />
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>الصنف</th><th>الدفعة</th><th>الصلاحية</th><th>الكمية</th><th>بونص</th><th>سعر الشراء</th><th>سعر البيع</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.id}>
                      <td className="font-bold">{i.product_name}</td>
                      <td className="text-xs text-ink-400">{i.batch_no || '—'}</td>
                      <td className="text-xs">{i.expiry_date ? fmtDate(i.expiry_date) : '—'}</td>
                      <td className="num">{fmtNum(i.qty, 0)}</td>
                      <td className="num">{fmtNum(i.bonus_qty, 0)}</td>
                      <td className="num">{fmtNum(i.unit_cost)}</td>
                      <td className="num text-brand-700">{fmtNum(i.sale_price)}</td>
                      <td className="num font-extrabold">{fmtNum(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.data.notes && <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">{detail.data.notes}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={!!payFor} onClose={() => setPayFor(null)} title="تسجيل دفعة للمورد" size="sm"
        footer={<><button className="btn-ghost" onClick={() => setPayFor(null)}>إلغاء</button>
          <button className="btn-primary" onClick={pay}>حفظ الدفعة</button></>}
      >
        {payFor && (
          <Field label={`المبلغ (المتبقي: ${fmtNum(payFor.max)} ${currency})`}>
            <Input type="number" min="0" max={payFor.max} step="0.01" value={payFor.amount}
              onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })} />
          </Field>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelId} onClose={() => setCancelId(null)} onConfirm={cancelPurchase} danger
        title="إلغاء فاتورة الشراء" confirmLabel="نعم، ألغِ الفاتورة"
        message="سيتم سحب كميات هذه الفاتورة من المخزون. لا يمكن الإلغاء إذا تم بيع جزء من الكميات."
      />
    </div>
  );
}

/* ================== نموذج فاتورة الشراء ================== */
function PurchaseForm({ form, setForm, suppliers, currency, onClose, onSave, savedAt }) {
  const [picker, setPicker] = useState(false);

  const addItem = (item) => {
    setForm((f) => ({ ...f, items: [...f.items, item] }));
    setPicker(false);
  };
  const updateItem = (idx, patch) => setForm((f) => ({
    ...f, items: f.items.map((i, x) => (x === idx ? { ...i, ...patch } : i)),
  }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== idx) }));

  const subtotal = form.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0) - (Number(i.discount) || 0), 0);
  const total = +(subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0)).toFixed(2);

  return (
    <Modal
      open onClose={onClose} size="xl" title="فاتورة شراء جديدة"
      subtitle={savedAt
        ? `محفوظة تلقائياً كمسودة ${savedAt.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} — لن تفقد إدخالك عند انقطاع التيار`
        : 'أضف الأصناف من المخزون أو مباشرة من دليل الأدوية — يحفظ النظام إدخالك تلقائياً'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={onSave}>حفظ الفاتورة وترحيلها للمخزون</button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="المورد">
            <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">— بدون مورد —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="رقم فاتورة المورد">
            <Input value={form.supplier_invoice} onChange={(e) => setForm({ ...form, supplier_invoice: e.target.value })} />
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <p className="font-extrabold text-ink-800">أصناف الفاتورة ({form.items.length})</p>
          <button className="btn-primary btn-sm" onClick={() => setPicker(true)}><Plus className="h-4 w-4" /> إضافة صنف</button>
        </div>

        {form.items.length === 0 ? (
          <EmptyState title="لم تتم إضافة أصناف" hint="اضغط «إضافة صنف» لاختيار الدواء من المخزون أو من دليل الأدوية" icon={Boxes} />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الصنف</th><th>رقم الدفعة</th><th>الصلاحية</th><th>الكمية</th><th>بونص</th>
                  <th>سعر الشراء</th><th>سعر البيع</th><th>خصم</th><th>الإجمالي</th><th></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((i, idx) => (
                  <tr key={idx}>
                    <td className="min-w-[180px]">
                      <p className="font-bold">{i.name}</p>
                      {i.catalog_id && <Badge tone="violet"><BookOpen className="h-3 w-3" /> من الدليل</Badge>}
                    </td>
                    <td><Input className="w-24 py-1.5" value={i.batch_no || ''} onChange={(e) => updateItem(idx, { batch_no: e.target.value })} /></td>
                    <td><Input type="date" className="w-36 py-1.5" value={i.expiry_date || ''} onChange={(e) => updateItem(idx, { expiry_date: e.target.value })} /></td>
                    <td><Input type="number" min="0" className="num w-20 py-1.5 text-center" value={i.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} /></td>
                    <td><Input type="number" min="0" className="num w-16 py-1.5 text-center" value={i.bonus_qty} onChange={(e) => updateItem(idx, { bonus_qty: e.target.value })} /></td>
                    <td><Input type="number" min="0" step="0.01" className="num w-24 py-1.5 text-center" value={i.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: e.target.value })} /></td>
                    <td><Input type="number" min="0" step="0.01" className="num w-24 py-1.5 text-center" value={i.sale_price} onChange={(e) => updateItem(idx, { sale_price: e.target.value })} /></td>
                    <td><Input type="number" min="0" step="0.01" className="num w-20 py-1.5 text-center" value={i.discount} onChange={(e) => updateItem(idx, { discount: e.target.value })} /></td>
                    <td className="num font-extrabold">{fmtNum((Number(i.qty) || 0) * (Number(i.unit_cost) || 0) - (Number(i.discount) || 0))}</td>
                    <td><button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Field label="ملاحظات">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="اختياري" />
          </Field>
          <div className="space-y-2 rounded-2xl bg-ink-50 p-4 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">إجمالي الأصناف</span><span className="num font-bold">{fmtNum(subtotal)} {currency}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-500">خصم الفاتورة</span>
              <Input type="number" min="0" step="0.01" className="num w-28 py-1 text-center" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-500">ضريبة</span>
              <Input type="number" min="0" step="0.01" className="num w-28 py-1 text-center" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-500">المدفوع</span>
              <Input type="number" min="0" step="0.01" className="num w-28 py-1 text-center" placeholder={String(total)} value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-ink-200 pt-2">
              <span className="font-extrabold">الإجمالي</span>
              <span className="num text-xl font-extrabold text-brand-700">{fmtNum(total)} {currency}</span>
            </div>
          </div>
        </div>
      </div>

      {picker && <ItemPicker onClose={() => setPicker(false)} onPick={addItem} />}
    </Modal>
  );
}

/* ================== اختيار الصنف (مخزون / دليل الأدوية) ================== */
function ItemPicker({ onClose, onPick }) {
  const [tab, setTab] = useState('catalog');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const req = tab === 'catalog'
        ? api.get('/catalog', { q, limit: 30, active: 1 })
        : api.get('/products', { q, limit: 30, active: 1 });
      req.then((r) => setRows(r.data)).finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tab]);

  return (
    <Modal open onClose={onClose} size="lg" title="اختيار الصنف" subtitle="ابحث في دليل الأدوية أو في أصناف المخزون">
      <div className="mb-3 flex gap-1.5 rounded-xl bg-ink-100 p-1">
        {[['catalog', 'دليل الأدوية', BookOpen], ['products', 'أصناف المخزون', Boxes]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition',
              tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input autoFocus className="pr-9" placeholder="ابحث بالاسم التجاري أو العلمي..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {loading && <Loading />}
        {!loading && rows.length === 0 && <EmptyState title="لا توجد نتائج" />}
        {!loading && rows.map((r) => {
          const isCatalog = tab === 'catalog';
          const exp = !isCatalog ? expiryState(r.nearest_expiry) : null;
          return (
            <button
              key={r.id}
              onClick={() => onPick(isCatalog ? {
                catalog_id: r.id, product_id: null, name: r.trade_name,
                qty: 1, bonus_qty: 0, unit_cost: r.default_purchase_price || 0,
                sale_price: r.default_sale_price || 0, discount: 0, batch_no: '', expiry_date: '',
              } : {
                product_id: r.id, catalog_id: null, name: r.name,
                qty: 1, bonus_qty: 0, unit_cost: r.purchase_price || 0,
                sale_price: r.sale_price || 0, discount: 0, batch_no: '', expiry_date: '',
              })}
              className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-right transition hover:border-brand-400 hover:bg-brand-50/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-ink-900">
                  {isCatalog ? r.trade_name : r.name} <span className="text-xs font-bold text-ink-400">{r.strength || ''}</span>
                </p>
                <p className="truncate text-[11px] text-ink-400">
                  {(isCatalog ? r.generic_name : r.generic_name) || '—'} · {r.form || ''} · {r.manufacturer || ''}
                </p>
              </div>
              {isCatalog
                ? (r.in_inventory ? <Badge tone="green">في المخزون</Badge> : <Badge tone="violet">غير مضاف</Badge>)
                : <Badge className={exp.cls}>{fmtNum(r.stock_qty, 0)} متاح</Badge>}
              <span className="num shrink-0 text-xs font-bold text-ink-500">
                شراء {fmtNum(isCatalog ? r.default_purchase_price : r.purchase_price)}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

const Info = ({ label, value }) => (
  <div className="rounded-xl bg-ink-50 px-3 py-2">
    <p className="text-[11px] font-bold text-ink-400">{label}</p>
    <p className="num font-extrabold text-ink-800">{value}</p>
  </div>
);
