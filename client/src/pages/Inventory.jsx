import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes, Plus, Search, Eye, Pencil, Trash2, SlidersHorizontal, CalendarClock, Activity,
  AlertTriangle, PackageX, TrendingUp, Layers, Trash, BookOpen,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, Table, Pagination, Badge, Field, Input, Select, Textarea, Modal, useToast,
  StatCard, ConfirmDialog, Tabs, Loading, EmptyState,
} from '../components/ui.jsx';
import ExcelIO from '../components/ExcelIO.jsx';
import {
  fmtNum, fmtDate, fmtDateTime, expiryState, stockState, MOVEMENT_TYPES, DOSAGE_FORMS, UNITS,
  SUB_UNITS, canSellSub, subUnitPrice, fmtStock, cn,
} from '../lib/format.js';

const emptyProduct = () => ({
  name: '', generic_name: '', form: '', strength: '', unit: 'علبة', category: '', manufacturer: '',
  sub_unit: '', units_per_pack: 1, sub_unit_price: 0, allow_sub_unit: 0,
  barcode: '', purchase_price: 0, sale_price: 0, reorder_level: 10, location: '',
  requires_prescription: 0, notes: '', active: 1, opening_qty: 0, opening_expiry: '',
});

export default function Inventory() {
  const { currency, can } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState(params.get('tab') || 'items');
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ q: '', category: '', status: params.get('status') || '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ categories: [] });
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [editBatch, setEditBatch] = useState(null);

  const loadSummary = useCallback(() => api.get('/inventory/summary').then(setSummary), []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRes(await api.get('/products', { ...filters, page, limit: 20 })); } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { loadSummary(); api.get('/products/meta').then(setMeta); }, [loadSummary]);
  useEffect(() => { if (tab === 'items') load(); }, [load, tab]);
  useEffect(() => { setParams(tab === 'items' ? {} : { tab }, { replace: true }); }, [tab, setParams]);

  const saveProduct = async () => {
    try {
      if (form.id) {
        await api.put(`/products/${form.id}`, form);
        toast.success('تم تحديث الصنف');
      } else {
        await api.post('/products', form);
        toast.success('تمت إضافة الصنف للمخزون');
      }
      setForm(null); load(); loadSummary();
    } catch (err) { toast.error(err.message); }
  };

  const submitAdjust = async () => {
    try {
      await api.post('/inventory/adjust', adjust);
      toast.success('تم تنفيذ التسوية المخزنية');
      setAdjust(null); load(); loadSummary();
      if (detail) setDetail(await api.get(`/products/${detail.data.id}`));
    } catch (err) { toast.error(err.message); }
  };

  const removeProduct = async () => {
    try {
      const r = await api.del(`/products/${deleteId}`);
      toast.success(r.message || 'تم حذف الصنف');
      setDeleteId(null); load(); loadSummary();
    } catch (err) { toast.error(err.message); setDeleteId(null); }
  };

  const disposeExpired = async () => {
    try {
      const r = await api.post('/inventory/dispose-expired');
      toast.success(`تم إتلاف ${r.count} دفعة بقيمة ${fmtNum(r.value)} ${currency}`);
      setDisposeOpen(false); loadSummary();
    } catch (err) { toast.error(err.message); setDisposeOpen(false); }
  };

  return (
    <div>
      <PageHeader
        title="إدارة المخزون" subtitle="الأصناف والدفعات وتواريخ الصلاحية وحركات المخزون" icon={Boxes}
        actions={(
          <>
            <ExcelIO entity="products" filters={filters} canImport={can('pharmacist')} onDone={load} />
            {can('pharmacist') && (
              <>
                <button className="btn-outline" onClick={() => setAdjust({ product_id: '', type: 'adjust_in', qty: 1, note: '' })}>
                  <SlidersHorizontal className="h-4 w-4" /> تسوية مخزنية
                </button>
                <button className="btn-primary" onClick={() => setForm(emptyProduct())}><Plus className="h-4 w-4" /> صنف جديد</button>
              </>
            )}
          </>
        )}
      />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="قيمة المخزون (تكلفة)" value={`${fmtNum(summary.cost_value)} ${currency}`} sub={`${summary.products} صنف · ${fmtNum(summary.units, 0)} وحدة`} icon={Boxes} tone="brand" />
          <StatCard label="قيمة البيع المتوقعة" value={`${fmtNum(summary.sale_value)} ${currency}`} sub={`ربح متوقع ${fmtNum(summary.expected_profit)}`} icon={TrendingUp} tone="blue" />
          <StatCard label="أصناف منخفضة / نفدت" value={`${summary.low_stock} / ${summary.out_of_stock}`} sub="تحتاج إعادة طلب" icon={AlertTriangle} tone="amber" />
          <StatCard label="قاربت الانتهاء / منتهية" value={`${summary.expiring_soon} / ${summary.expired}`} sub={`قيمة المنتهي ${fmtNum(summary.expired_value)} ${currency}`} icon={CalendarClock} tone="rose" />
        </div>
      )}

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'items', label: 'الأصناف', icon: Boxes },
          { value: 'expiry', label: 'الصلاحيات', icon: CalendarClock },
          { value: 'low', label: 'نواقص المخزون', icon: PackageX },
          { value: 'movements', label: 'حركات المخزون', icon: Activity },
        ]}
      />

      {tab === 'items' && (
        <>
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="بحث" className="min-w-[220px] flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input className="pr-9" placeholder="اسم الدواء / المادة الفعالة / الباركود" value={filters.q}
                    onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
                </div>
              </Field>
              <Field label="التصنيف">
                <Select value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}>
                  <option value="">كل التصنيفات</option>
                  {meta.categories?.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="الحالة">
                <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
                  <option value="">الكل</option>
                  <option value="low">منخفض</option>
                  <option value="out">نفد</option>
                  <option value="expiring">قارب الانتهاء</option>
                  <option value="expired">منتهي الصلاحية</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Table
            loading={loading}
            columns={['الصنف', 'التصنيف', 'الشكل', 'الرصيد', 'الحالة', 'أقرب صلاحية', 'سعر الشراء', 'سعر البيع', 'الموقع', '']}
            rows={res.data}
            renderRow={(p) => {
              const st = stockState(p.stock_qty, p.reorder_level);
              const exp = expiryState(p.nearest_expiry);
              return (
                <tr key={p.id}>
                  <td>
                    <p className="font-extrabold text-ink-900">{p.name} <span className="text-xs text-ink-400">{p.strength || ''}</span></p>
                    <p className="text-[11px] text-ink-400">{p.generic_name || '—'} {p.catalog_id ? '· مرتبط بالدليل' : ''}</p>
                  </td>
                  <td className="text-ink-500">{p.category || '—'}</td>
                  <td className="text-ink-500">{p.form || '—'}</td>
                  <td className="num font-extrabold">
                    {fmtStock(p.stock_qty, p)}
                    {canSellSub(p) && (
                      <span className="block text-[10px] font-normal text-brand-600">
                        تجزئة: {fmtNum(subUnitPrice(p))} / {p.sub_unit}
                      </span>
                    )}
                  </td>
                  <td><Badge className={st.cls}>{st.label}</Badge></td>
                  <td>{p.nearest_expiry ? <Badge className={exp.cls}>{fmtDate(p.nearest_expiry)}</Badge> : <span className="text-ink-300">—</span>}</td>
                  <td className="num">{fmtNum(p.purchase_price)}</td>
                  <td className="num font-bold text-brand-700">{fmtNum(p.sale_price)}</td>
                  <td className="text-xs text-ink-400">{p.location || '—'}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button className="btn-outline btn-sm" onClick={async () => setDetail(await api.get(`/products/${p.id}`))}><Eye className="h-3.5 w-3.5" /></button>
                      {can('pharmacist') && <button className="btn-outline btn-sm" onClick={() => setForm({ ...p })}><Pencil className="h-3.5 w-3.5" /></button>}
                      {can('manager') && <button className="btn-outline btn-sm text-rose-600" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              );
            }}
          />
          <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />
        </>
      )}

      {tab === 'expiry' && <ExpiryTab currency={currency} canManage={can('manager')} canEdit={can('pharmacist')} onDispose={() => setDisposeOpen(true)} />}
      {tab === 'low' && <LowStockTab currency={currency} />}
      {tab === 'movements' && <MovementsTab currency={currency} />}

      {/* نموذج الصنف */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.id ? `تعديل الصنف: ${form.name}` : 'إضافة صنف جديد للمخزون'}
        subtitle="يمكنك أيضاً إضافة الأصناف مباشرة من دليل الأدوية أو عبر فاتورة شراء"
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
          <button className="btn-primary" onClick={saveProduct}>حفظ</button></>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الصنف" required className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="المادة الفعالة">
              <Input value={form.generic_name || ''} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} />
            </Field>
            <Field label="الشكل الصيدلاني">
              <Select value={form.form || ''} onChange={(e) => setForm({ ...form, form: e.target.value })}>
                <option value="">—</option>
                {DOSAGE_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="التركيز"><Input value={form.strength || ''} onChange={(e) => setForm({ ...form, strength: e.target.value })} /></Field>
            <Field label="وحدة الصرف">
              <Select value={form.unit || ''} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="التصنيف"><Input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="الشركة المصنعة"><Input value={form.manufacturer || ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
            <Field label="الباركود"><Input value={form.barcode || ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            <Field label="سعر الشراء"><Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} /></Field>
            <Field label="سعر البيع"><Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></Field>
            <Field label="حد إعادة الطلب"><Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></Field>
            <Field label="موقع الرف"><Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="البيع بالتجزئة" className="sm:col-span-2" hint="لبيع جزء من العبوة (شريط من علبة، قرص من شريط…)">
              <Select
                value={form.allow_sub_unit || 0}
                onChange={(e) => setForm({ ...form, allow_sub_unit: Number(e.target.value), sub_unit: form.sub_unit || 'شريط' })}
              >
                <option value={0}>غير مفعّل — البيع بالعبوة الكاملة فقط</option>
                <option value={1}>مفعّل — يمكن بيع وحدة أصغر من العبوة</option>
              </Select>
            </Field>

            {Number(form.allow_sub_unit) === 1 && (
              <>
                <Field label="اسم الوحدة الصغرى" required>
                  <Select value={form.sub_unit || ''} onChange={(e) => setForm({ ...form, sub_unit: e.target.value })}>
                    <option value="">—</option>
                    {SUB_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </Field>
                <Field label={`عدد الـ${form.sub_unit || 'وحدات'} في ${form.unit || 'العبوة'}`} required>
                  <Input
                    type="number" min="1" step="1" value={form.units_per_pack}
                    onChange={(e) => setForm({ ...form, units_per_pack: Number(e.target.value) || 1 })}
                  />
                </Field>
                <Field
                  label={`سعر بيع الـ${form.sub_unit || 'وحدة'}`}
                  className="sm:col-span-2"
                  hint={`اتركه صفراً ليُحسب تلقائياً = ${fmtNum(
                    (Number(form.sale_price) || 0) / (Number(form.units_per_pack) || 1),
                  )} ${currency}. عادة يكون سعر التجزئة أعلى.`}
                >
                  <Input
                    type="number" step="0.01" value={form.sub_unit_price}
                    onChange={(e) => setForm({ ...form, sub_unit_price: Number(e.target.value) || 0 })}
                  />
                </Field>
              </>
            )}

            <Field label="يصرف بوصفة؟">
              <Select value={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: Number(e.target.value) })}>
                <option value={0}>لا</option><option value={1}>نعم</option>
              </Select>
            </Field>
            <Field label="الحالة">
              <Select value={form.active} onChange={(e) => setForm({ ...form, active: Number(e.target.value) })}>
                <option value={1}>نشط</option><option value={0}>موقوف</option>
              </Select>
            </Field>
            {!form.id && (
              <>
                <Field label="رصيد افتتاحي (اختياري)">
                  <Input type="number" min="0" value={form.opening_qty} onChange={(e) => setForm({ ...form, opening_qty: e.target.value })} />
                </Field>
                <Field label="صلاحية الرصيد الافتتاحي">
                  <Input type="date" value={form.opening_expiry} onChange={(e) => setForm({ ...form, opening_expiry: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="ملاحظات" className="sm:col-span-2 lg:col-span-3">
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* بطاقة الصنف */}
      <Modal
        open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? detail.data.name : ''} subtitle={detail ? `${detail.data.generic_name || ''} · ${detail.data.form || ''} ${detail.data.strength || ''}` : ''}
        footer={<button className="btn-ghost" onClick={() => setDetail(null)}>إغلاق</button>}
      >
        {!detail ? <Loading /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="الرصيد" value={fmtStock(detail.data.stock_qty, detail.data)} />
              {canSellSub(detail.data) && (
                <Info
                  label="البيع بالتجزئة"
                  value={`${fmtNum(subUnitPrice(detail.data))} ${currency} / ${detail.data.sub_unit} — العبوة ${fmtNum(detail.data.units_per_pack, 0)} ${detail.data.sub_unit}`}
                />
              )}
              <Info label="قيمة المخزون" value={`${fmtNum(detail.data.stock_cost_value)} ${currency}`} />
              <Info label="سعر البيع" value={`${fmtNum(detail.data.sale_price)} ${currency}`} />
              <Info label="الموقع" value={detail.data.location || '—'} />
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 font-extrabold text-ink-800"><Layers className="h-4 w-4 text-brand-600" /> الدفعات</p>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>رقم الدفعة</th><th>الصلاحية</th><th>الوارد</th><th>المتاح</th><th>التكلفة</th><th>المورد</th><th></th></tr></thead>
                  <tbody>
                    {detail.batches.length === 0 && <tr><td colSpan={7}><EmptyState title="لا توجد دفعات" /></td></tr>}
                    {detail.batches.map((b) => {
                      const exp = expiryState(b.expiry_date);
                      return (
                        <tr key={b.id} className={cn(b.qty_available <= 0 && 'opacity-50')}>
                          <td className="font-bold">{b.batch_no || '—'}</td>
                          <td><Badge className={exp.cls}>{b.expiry_date ? fmtDate(b.expiry_date) : 'غير محدد'}</Badge></td>
                          <td className="num">{fmtNum(b.qty_in, 0)}</td>
                          <td className="num font-extrabold">{fmtNum(b.qty_available, 0)}</td>
                          <td className="num">{fmtNum(b.cost_price)}</td>
                          <td className="text-xs text-ink-400">{b.supplier_name || '—'}</td>
                          <td>
                            {can('pharmacist') && (
                              <button
                                className="btn-outline btn-sm"
                                title="تعديل تاريخ الصلاحية والأسعار"
                                onClick={() => setEditBatch({ ...b, product_name: detail.data.name })}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 font-extrabold text-ink-800"><Activity className="h-4 w-4 text-brand-600" /> آخر الحركات</p>
              <div className="max-h-64 overflow-y-auto">
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>التاريخ</th><th>الحركة</th><th>الكمية</th><th>الدفعة</th><th>المستخدم</th><th>ملاحظة</th></tr></thead>
                    <tbody>
                      {detail.movements.map((m) => (
                        <tr key={m.id}>
                          <td className="text-xs text-ink-500">{fmtDateTime(m.created_at)}</td>
                          <td><Badge tone={m.qty > 0 ? 'green' : 'red'}>{MOVEMENT_TYPES[m.type] || m.type}</Badge></td>
                          <td className={cn('num font-bold', m.qty > 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.qty > 0 ? '+' : ''}{fmtNum(m.qty, 0)}</td>
                          <td className="text-xs">{m.batch_no || '—'}</td>
                          <td className="text-xs text-ink-400">{m.user_name || '—'}</td>
                          <td className="text-xs text-ink-400">{m.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* تسوية */}
      <AdjustModal adjust={adjust} setAdjust={setAdjust} onSubmit={submitAdjust} />

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={removeProduct} danger
        title="حذف الصنف" confirmLabel="حذف"
        message="سيتم حذف الصنف نهائياً إن لم يكن مرتبطاً بحركات، وإلا سيتم إيقافه فقط."
      />
      {editBatch && (
        <BatchEditModal
          batch={editBatch}
          onClose={() => setEditBatch(null)}
          onSaved={async () => {
            setEditBatch(null);
            if (detail) setDetail(await api.get(`/products/${detail.data.id}`));
            load(); loadSummary();
          }}
        />
      )}

      <ConfirmDialog
        open={disposeOpen} onClose={() => setDisposeOpen(false)} onConfirm={disposeExpired} danger
        title="إتلاف الدفعات المنتهية" confirmLabel="تنفيذ الإتلاف"
        message="سيتم تصفير جميع الدفعات منتهية الصلاحية وتسجيلها كخسائر إتلاف في التقارير."
      />
    </div>
  );
}

/* ================== تبويب الصلاحيات ================== */
function ExpiryTab({ currency, canManage, onDispose, canEdit }) {
  const [mode, setMode] = useState('soon');
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editBatch, setEditBatch] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.get('/inventory/expiry', { mode, days }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, [mode, days, reloadKey]);

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="العرض">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="soon">قاربت الانتهاء</option>
              <option value="expired">منتهية الصلاحية</option>
              <option value="all">الكل</option>
            </Select>
          </Field>
          {mode !== 'expired' && (
            <Field label="خلال (يوم)"><Input type="number" className="w-28" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ExcelIO
            entity="batches"
            canImport={canEdit}
            onDone={() => setReloadKey((k) => k + 1)}
          />
          {canManage && <button className="btn-danger" onClick={onDispose}><Trash className="h-4 w-4" /> إتلاف المنتهي</button>}
        </div>
      </Card>

      <Table
        loading={loading}
        columns={['الصنف', 'التصنيف', 'رقم الدفعة', 'تاريخ الانتهاء', 'المتبقي', 'الكمية', 'التكلفة', 'القيمة', '']}
        rows={rows}
        empty={<EmptyState title="لا توجد دفعات في هذا النطاق" icon={CalendarClock} />}
        renderRow={(b) => {
          const exp = expiryState(b.expiry_date);
          return (
            <tr key={b.id}>
              <td className="font-bold">{b.product_name}</td>
              <td className="text-ink-500">{b.category || '—'}</td>
              <td>{b.batch_no || '—'}</td>
              <td><Badge className={exp.cls}>{fmtDate(b.expiry_date)}</Badge></td>
              <td className={cn('num font-bold', b.days_left < 0 ? 'text-rose-600' : 'text-amber-600')}>
                {b.days_left < 0 ? `منتهٍ منذ ${Math.abs(b.days_left)} يوم` : `${b.days_left} يوم`}
              </td>
              <td className="num font-extrabold">{fmtNum(b.qty_available, 0)} {b.unit}</td>
              <td className="num">{fmtNum(b.cost_price)}</td>
              <td className="num font-bold text-rose-600">{fmtNum(b.value)} {currency}</td>
              <td>
                {canEdit && (
                  <button
                    className="btn-outline btn-sm"
                    title="تعديل تاريخ الصلاحية والأسعار"
                    onClick={() => setEditBatch(b)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          );
        }}
      />

      {editBatch && (
        <BatchEditModal
          batch={editBatch}
          onClose={() => setEditBatch(null)}
          onSaved={() => { setEditBatch(null); setReloadKey((k) => k + 1); }}
        />
      )}
    </>
  );
}

/* ================== تبويب النواقص ================== */
function LowStockTab({ currency }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/inventory/low-stock').then((r) => setRows(r.data)).finally(() => setLoading(false)); }, []);

  return (
    <Table
      loading={loading}
      columns={['الصنف', 'التصنيف', 'الرصيد الحالي', 'حد إعادة الطلب', 'الكمية المقترحة', 'سعر الشراء', 'تكلفة التوريد المقترحة']}
      rows={rows}
      empty={<EmptyState title="لا توجد نواقص — المخزون بحالة جيدة" icon={PackageX} />}
      renderRow={(p) => {
        const suggest = Math.max(0, (p.reorder_level > 0 ? p.reorder_level : 10) * 3 - p.stock_qty);
        return (
          <tr key={p.id}>
            <td className="font-bold">{p.name}</td>
            <td className="text-ink-500">{p.category || '—'}</td>
            <td className="num"><Badge tone={p.stock_qty <= 0 ? 'red' : 'amber'}>{fmtNum(p.stock_qty, 0)} {p.unit}</Badge></td>
            <td className="num">{fmtNum(p.reorder_level, 0)}</td>
            <td className="num font-extrabold text-brand-700">{fmtNum(suggest, 0)}</td>
            <td className="num">{fmtNum(p.purchase_price)}</td>
            <td className="num font-bold">{fmtNum(suggest * p.purchase_price)} {currency}</td>
          </tr>
        );
      }}
    />
  );
}

/* ================== تبويب الحركات ================== */
function MovementsTab({ currency }) {
  const [filters, setFilters] = useState({ q: '', type: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/inventory/movements', { ...filters, page, limit: 25 }).then(setRes).finally(() => setLoading(false));
  }, [filters, page]);

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="بحث بالصنف" className="min-w-[200px] flex-1">
            <Input value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} placeholder="اسم الصنف" />
          </Field>
          <Field label="نوع الحركة">
            <Select value={filters.type} onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setPage(1); }}>
              <option value="">الكل</option>
              {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
      <Table
        loading={loading}
        columns={['التاريخ', 'الصنف', 'الحركة', 'الكمية', 'التكلفة', 'الدفعة', 'المرجع', 'المستخدم', 'ملاحظة']}
        rows={res.data}
        renderRow={(m) => (
          <tr key={m.id}>
            <td className="text-xs text-ink-500">{fmtDateTime(m.created_at)}</td>
            <td className="font-bold">{m.product_name}</td>
            <td><Badge tone={m.qty > 0 ? 'green' : 'red'}>{MOVEMENT_TYPES[m.type] || m.type}</Badge></td>
            <td className={cn('num font-extrabold', m.qty > 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.qty > 0 ? '+' : ''}{fmtNum(m.qty, 0)}</td>
            <td className="num">{fmtNum(m.unit_cost)} {currency}</td>
            <td className="text-xs">{m.batch_no || '—'}</td>
            <td className="text-xs text-ink-400">{m.ref_type || '—'}{m.ref_id ? `#${m.ref_id}` : ''}</td>
            <td className="text-xs text-ink-400">{m.user_name || '—'}</td>
            <td className="max-w-[220px] truncate text-xs text-ink-400">{m.note || '—'}</td>
          </tr>
        )}
      />
      <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />
    </>
  );
}

/* ================== نافذة التسوية ================== */
function AdjustModal({ adjust, setAdjust, onSubmit }) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!adjust) { setQ(''); setSelected(null); setOptions([]); }
  }, [adjust]);

  useEffect(() => {
    if (!q.trim()) { setOptions([]); return undefined; }
    const t = setTimeout(() => api.get('/products/search', { q }).then((r) => setOptions(r.data)), 220);
    return () => clearTimeout(t);
  }, [q]);

  if (!adjust) return null;

  return (
    <Modal
      open onClose={() => setAdjust(null)} size="md" title="تسوية مخزنية"
      subtitle="إدخال أو إخراج كميات مع تسجيل الحركة في سجل المخزون"
      footer={<><button className="btn-ghost" onClick={() => setAdjust(null)}>إلغاء</button>
        <button className="btn-primary" onClick={onSubmit} disabled={!adjust.product_id}>تنفيذ التسوية</button></>}
    >
      <div className="space-y-3">
        <Field label="الصنف" required>
          {selected ? (
            <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-3 py-2.5">
              <div>
                <p className="font-extrabold text-ink-900">{selected.name}</p>
                <p className="text-[11px] text-ink-500">المتاح: {fmtNum(selected.stock_qty, 0)} {selected.unit}</p>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => { setSelected(null); setAdjust({ ...adjust, product_id: '' }); }}>تغيير</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input className="pr-9" autoFocus placeholder="ابحث عن الصنف..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {options.length > 0 && (
                <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-100 p-1">
                  {options.map((o) => (
                    <button key={o.id} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-sm hover:bg-brand-50"
                      onClick={() => { setSelected(o); setAdjust({ ...adjust, product_id: o.id }); }}>
                      <span className="font-bold">{o.name}</span>
                      <span className="num text-xs text-ink-400">{fmtNum(o.stock_qty, 0)} {o.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع التسوية">
            <Select value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value })}>
              <option value="adjust_in">إدخال (زيادة)</option>
              <option value="adjust_out">إخراج (نقص)</option>
              <option value="damage">تالف</option>
              <option value="expired">منتهي الصلاحية</option>
            </Select>
          </Field>
          <Field label="الكمية" required>
            <Input type="number" min="0.01" step="0.01" value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} />
          </Field>
        </div>

        {adjust.type === 'adjust_in' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="رقم الدفعة"><Input value={adjust.batch_no || ''} onChange={(e) => setAdjust({ ...adjust, batch_no: e.target.value })} /></Field>
            <Field label="تاريخ الانتهاء"><Input type="date" value={adjust.expiry_date || ''} onChange={(e) => setAdjust({ ...adjust, expiry_date: e.target.value })} /></Field>
            <Field label="تكلفة الوحدة"><Input type="number" step="0.01" value={adjust.cost_price || ''} onChange={(e) => setAdjust({ ...adjust, cost_price: e.target.value })} /></Field>
          </div>
        )}

        <Field label="سبب / ملاحظة">
          <Input value={adjust.note || ''} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="مثال: جرد فعلي، كسر، هدية..." />
        </Field>
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

/* ================== تعديل دفعة (الصلاحية والأسعار) ================== */
export function BatchEditModal({ batch, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    batch_no: batch.batch_no || '',
    expiry_date: batch.expiry_date || '',
    cost_price: batch.cost_price ?? 0,
    sale_price: batch.sale_price ?? 0,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/inventory/batches/${batch.id}`, {
        batch_no: form.batch_no || null,
        expiry_date: form.expiry_date || null,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
      });
      toast.success('تم تحديث بيانات الدفعة');
      onSaved?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} size="sm"
      title="تعديل الدفعة"
      subtitle={batch.product_name || batch.name || 'تعديل تاريخ الصلاحية والأسعار'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save} disabled={busy}>حفظ التعديلات</button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="رقم الدفعة"><Input value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} /></Field>
        <Field label="تاريخ الصلاحية">
          <Input type="date" value={form.expiry_date || ''} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
        </Field>
        <Field label="سعر التكلفة">
          <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
        </Field>
        <Field label="سعر البيع">
          <Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
        </Field>
        <p className="sm:col-span-2 rounded-xl bg-ink-50 p-3 text-[11px] leading-6 text-ink-500">
          الكمية لا تُعدَّل من هنا — استخدم «تسوية مخزنية» حتى تبقى حركة المخزون موثّقة.
        </p>
      </div>
    </Modal>
  );
}
