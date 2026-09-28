import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Plus, Search, Pencil, Trash2, PackagePlus, Info, Upload, CheckCircle2, Filter, FlaskConical,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, Table, Pagination, Badge, Field, Input, Select, Textarea, Modal, useToast,
  StatCard, ConfirmDialog, EmptyState,
} from '../components/ui.jsx';
import { fmtNum, fmtInt, DOSAGE_FORMS, UNITS } from '../lib/format.js';

const emptyDrug = () => ({
  trade_name: '', generic_name: '', form: '', strength: '', unit: 'علبة', category: '',
  manufacturer: '', country: '', barcode: '', atc_code: '', default_purchase_price: 0,
  default_sale_price: 0, requires_prescription: 0, storage_conditions: '', notes: '', active: 1,
});

export default function Catalog() {
  const { currency, can } = useApp();
  const toast = useToast();

  const [filters, setFilters] = useState({ q: '', category: '', form: '', manufacturer: '', only_unlinked: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, pages: 1 });
  const [meta, setMeta] = useState({ categories: [], forms: [], manufacturers: [], total: 0, linked: 0 });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [addToStock, setAddToStock] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const loadMeta = useCallback(() => api.get('/catalog/meta').then(setMeta), []);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRes(await api.get('/catalog', { ...filters, page, limit: 20 })); } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const save = async () => {
    try {
      if (form.id) { await api.put(`/catalog/${form.id}`, form); toast.success('تم تحديث بيانات الدواء'); }
      else { await api.post('/catalog', form); toast.success('تمت إضافة الدواء إلى الدليل'); }
      setForm(null); load(); loadMeta();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try {
      await api.del(`/catalog/${deleteId}`);
      toast.success('تم حذف الدواء من الدليل');
      setDeleteId(null); load(); loadMeta();
    } catch (err) { toast.error(err.message); setDeleteId(null); }
  };

  const confirmAddToStock = async () => {
    try {
      await api.post(`/products/from-catalog/${addToStock.drug.id}`, {
        purchase_price: Number(addToStock.purchase_price) || 0,
        sale_price: Number(addToStock.sale_price) || 0,
        reorder_level: Number(addToStock.reorder_level) || 10,
        location: addToStock.location || null,
        opening_qty: Number(addToStock.opening_qty) || 0,
        opening_expiry: addToStock.opening_expiry || null,
      });
      toast.success(`تمت إضافة «${addToStock.drug.trade_name}» إلى المخزون`);
      setAddToStock(null); load(); loadMeta();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <PageHeader
        title="دليل الأدوية" subtitle="مرجع شامل للأدوية — لا يظهر في المخزون ويُستخدم لإدخال الأدوية بسرعة" icon={BookOpen}
        actions={can('pharmacist') && (
          <>
            {can('manager') && <button className="btn-outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> استيراد</button>}
            <button className="btn-primary" onClick={() => setForm(emptyDrug())}><Plus className="h-4 w-4" /> دواء جديد</button>
          </>
        )}
      />

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <p className="leading-7">
          <strong>دليل الأدوية مرجعي فقط:</strong> لا يحتوي على أرصدة ولا يظهر ضمن تقارير المخزون.
          استخدمه لإدخال الأدوية بسرعة عند إنشاء <strong>فاتورة شراء</strong> أو عبر زر
          <Badge tone="brand" className="mx-1"><PackagePlus className="h-3 w-3" /> إضافة للمخزون</Badge>
          ليتحول الدواء إلى صنف فعلي يُدار رصيده ودفعاته.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي أدوية الدليل" value={fmtInt(meta.total)} icon={BookOpen} tone="violet" />
        <StatCard label="مضاف إلى المخزون" value={fmtInt(meta.linked)} sub="أصناف مرتبطة" icon={CheckCircle2} tone="brand" />
        <StatCard label="غير مضاف للمخزون" value={fmtInt(Math.max(0, meta.total - meta.linked))} sub="مرجع فقط" icon={FlaskConical} tone="amber" />
        <StatCard label="التصنيفات" value={fmtInt(meta.categories?.length)} sub={`${meta.manufacturers?.length || 0} شركة مصنعة`} icon={Filter} tone="blue" />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="بحث" className="min-w-[220px] flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input className="pr-9" placeholder="الاسم التجاري / العلمي / الباركود / الشركة" value={filters.q}
                onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
            </div>
          </Field>
          <Field label="التصنيف">
            <Select value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}>
              <option value="">الكل</option>
              {meta.categories?.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="الشكل">
            <Select value={filters.form} onChange={(e) => { setFilters({ ...filters, form: e.target.value }); setPage(1); }}>
              <option value="">الكل</option>
              {meta.forms?.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="الشركة">
            <Select value={filters.manufacturer} onChange={(e) => { setFilters({ ...filters, manufacturer: e.target.value }); setPage(1); }}>
              <option value="">الكل</option>
              {meta.manufacturers?.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="الحالة في المخزون">
            <Select value={filters.only_unlinked} onChange={(e) => { setFilters({ ...filters, only_unlinked: e.target.value }); setPage(1); }}>
              <option value="">الكل</option>
              <option value="1">غير مضاف للمخزون فقط</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Table
        loading={loading}
        columns={['الاسم التجاري', 'المادة الفعالة', 'الشكل / التركيز', 'التصنيف', 'الشركة', 'سعر الشراء', 'سعر البيع', 'وصفة', 'المخزون', '']}
        rows={res.data}
        empty={<EmptyState title="لا توجد أدوية في الدليل" hint="أضف دواءً جديداً أو استورد قائمة كاملة" icon={BookOpen} />}
        renderRow={(d) => (
          <tr key={d.id}>
            <td>
              <p className="font-extrabold text-ink-900">{d.trade_name}</p>
              <p className="text-[11px] text-ink-400">{d.barcode || '—'}</p>
            </td>
            <td className="text-ink-600">{d.generic_name || '—'}</td>
            <td className="text-ink-500">{[d.form, d.strength].filter(Boolean).join(' · ') || '—'}</td>
            <td className="text-ink-500">{d.category || '—'}</td>
            <td className="text-ink-500">{d.manufacturer || '—'}<span className="block text-[11px] text-ink-400">{d.country || ''}</span></td>
            <td className="num">{fmtNum(d.default_purchase_price)}</td>
            <td className="num font-bold text-brand-700">{fmtNum(d.default_sale_price)} {currency}</td>
            <td>{d.requires_prescription ? <Badge tone="red">وصفة</Badge> : <Badge tone="gray">حر</Badge>}</td>
            <td>{d.in_inventory ? <Badge tone="green">مضاف</Badge> : <Badge tone="violet">غير مضاف</Badge>}</td>
            <td>
              <div className="flex items-center gap-1">
                {can('pharmacist') && !d.in_inventory && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => setAddToStock({
                      drug: d,
                      purchase_price: d.default_purchase_price,
                      sale_price: d.default_sale_price,
                      reorder_level: 10, location: '', opening_qty: 0, opening_expiry: '',
                    })}
                  >
                    <PackagePlus className="h-3.5 w-3.5" /> للمخزون
                  </button>
                )}
                {can('pharmacist') && <button className="btn-outline btn-sm" onClick={() => setForm({ ...d })}><Pencil className="h-3.5 w-3.5" /></button>}
                {can('manager') && <button className="btn-outline btn-sm text-rose-600" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </td>
          </tr>
        )}
      />
      <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />

      {/* نموذج الدواء */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.id ? `تعديل: ${form.trade_name}` : 'إضافة دواء إلى الدليل'}
        subtitle="بيانات مرجعية تُستخدم لإدخال الأدوية بسرعة — لا تؤثر على أرصدة المخزون"
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
          <button className="btn-primary" onClick={save}>حفظ</button></>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="الاسم التجاري" required className="sm:col-span-2">
              <Input autoFocus value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
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
            <Field label="التركيز"><Input value={form.strength || ''} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="500 مجم" /></Field>
            <Field label="وحدة الصرف">
              <Select value={form.unit || ''} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="التصنيف الدوائي"><Input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="الشركة المصنعة"><Input value={form.manufacturer || ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
            <Field label="بلد المنشأ"><Input value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label="الباركود"><Input value={form.barcode || ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            <Field label="كود ATC"><Input value={form.atc_code || ''} onChange={(e) => setForm({ ...form, atc_code: e.target.value })} /></Field>
            <Field label="سعر الشراء الافتراضي">
              <Input type="number" step="0.01" value={form.default_purchase_price} onChange={(e) => setForm({ ...form, default_purchase_price: e.target.value })} />
            </Field>
            <Field label="سعر البيع الافتراضي">
              <Input type="number" step="0.01" value={form.default_sale_price} onChange={(e) => setForm({ ...form, default_sale_price: e.target.value })} />
            </Field>
            <Field label="يصرف بوصفة طبية؟">
              <Select value={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: Number(e.target.value) })}>
                <option value={0}>لا</option><option value={1}>نعم</option>
              </Select>
            </Field>
            <Field label="الحالة">
              <Select value={form.active} onChange={(e) => setForm({ ...form, active: Number(e.target.value) })}>
                <option value={1}>نشط</option><option value={0}>موقوف</option>
              </Select>
            </Field>
            <Field label="ظروف التخزين" className="sm:col-span-2">
              <Input value={form.storage_conditions || ''} onChange={(e) => setForm({ ...form, storage_conditions: e.target.value })} placeholder="يحفظ في درجة حرارة أقل من 30 مئوية" />
            </Field>
            <Field label="ملاحظات / إرشادات" className="sm:col-span-2 lg:col-span-3">
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* إضافة للمخزون */}
      <Modal
        open={!!addToStock} onClose={() => setAddToStock(null)} size="md"
        title={`إضافة «${addToStock?.drug?.trade_name || ''}» إلى المخزون`}
        subtitle="سيتم إنشاء صنف مخزني مرتبط بهذا الدواء مع إمكانية إدخال رصيد افتتاحي"
        footer={<><button className="btn-ghost" onClick={() => setAddToStock(null)}>إلغاء</button>
          <button className="btn-primary" onClick={confirmAddToStock}><PackagePlus className="h-4 w-4" /> إضافة للمخزون</button></>}
      >
        {addToStock && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="سعر الشراء"><Input type="number" step="0.01" value={addToStock.purchase_price} onChange={(e) => setAddToStock({ ...addToStock, purchase_price: e.target.value })} /></Field>
            <Field label="سعر البيع"><Input type="number" step="0.01" value={addToStock.sale_price} onChange={(e) => setAddToStock({ ...addToStock, sale_price: e.target.value })} /></Field>
            <Field label="حد إعادة الطلب"><Input type="number" value={addToStock.reorder_level} onChange={(e) => setAddToStock({ ...addToStock, reorder_level: e.target.value })} /></Field>
            <Field label="موقع الرف"><Input value={addToStock.location} onChange={(e) => setAddToStock({ ...addToStock, location: e.target.value })} placeholder="رف A1" /></Field>
            <Field label="رصيد افتتاحي (اختياري)"><Input type="number" min="0" value={addToStock.opening_qty} onChange={(e) => setAddToStock({ ...addToStock, opening_qty: e.target.value })} /></Field>
            <Field label="تاريخ انتهاء الرصيد"><Input type="date" value={addToStock.opening_expiry} onChange={(e) => setAddToStock({ ...addToStock, opening_expiry: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); loadMeta(); }} />}

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={remove} danger
        title="حذف من الدليل" confirmLabel="حذف"
        message="سيتم حذف الدواء من الدليل المرجعي فقط، ولن يتأثر أي صنف موجود في المخزون."
      />
    </div>
  );
}

/* ================== استيراد الدليل ================== */
function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const sample = `الاسم التجاري, المادة الفعالة, الشكل, التركيز, التصنيف, الشركة, سعر الشراء, سعر البيع
سيتال, باراسيتامول, أقراص, 500 مجم, مسكنات, EIPICO, 5, 9`;

  const run = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { toast.error('أدخل البيانات أولاً'); return; }
    const rows = lines.slice(lines[0].includes('الاسم التجاري') ? 1 : 0).map((line) => {
      const [trade_name, generic_name, form, strength, category, manufacturer, buy, sell] = line.split(/[,\t;]/).map((s) => (s || '').trim());
      return {
        trade_name, generic_name, form, strength, category, manufacturer,
        default_purchase_price: Number(buy) || 0, default_sale_price: Number(sell) || 0,
      };
    }).filter((r) => r.trade_name);

    if (!rows.length) { toast.error('تعذر قراءة أي سطر صالح'); return; }
    setBusy(true);
    try {
      const res = await api.post('/catalog/import', { items: rows });
      toast.success(`تم استيراد ${res.inserted} دواء (تم تجاهل ${res.skipped} مكرر)`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} size="md" title="استيراد أدوية إلى الدليل"
      subtitle="الصق البيانات بصيغة CSV — كل سطر يمثل دواءً"
      footer={<><button className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={run} disabled={busy}><Upload className="h-4 w-4" /> استيراد</button></>}
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-ink-50 p-3 text-xs leading-6 text-ink-600">
          <p className="font-extrabold">ترتيب الأعمدة:</p>
          <code className="block whitespace-pre-wrap text-[11px]">{sample}</code>
        </div>
        <Textarea className="min-h-[220px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="الصق الأسطر هنا..." />
      </div>
    </Modal>
  );
}
