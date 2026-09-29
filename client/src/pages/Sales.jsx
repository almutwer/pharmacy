import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt as ReceiptIcon, Search, Eye, Undo2, Ban, Printer, Filter, ShoppingCart, RotateCcw,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, Table, Pagination, Badge, Field, Input, Select, Modal, useToast,
  StatCard, ConfirmDialog, Tabs, EmptyState, Loading,
} from '../components/ui.jsx';
import { fmtNum, fmtDate, fmtDateTime, PAYMENT_METHODS, todayStr, monthStartStr } from '../lib/format.js';
import ReceiptView from '../components/Receipt.jsx';

export default function Sales() {
  const { currency, can } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState('invoices');
  const [filters, setFilters] = useState({ q: '', from: monthStartStr(), to: todayStr(), status: '', payment_method: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, pages: 1, summary: {} });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [returns, setReturns] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/sales', { ...filters, page, limit: 20 });
      setRes(r);
    } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { if (tab === 'invoices') load(); }, [load, tab]);
  useEffect(() => {
    if (tab === 'returns') api.get('/sales/returns/list', { from: filters.from, to: filters.to }).then((r) => setReturns(r.data));
  }, [tab, filters.from, filters.to]);

  const openDetail = async (id) => {
    const full = await api.get(`/sales/${id}`);
    setDetail(full);
  };

  const submitReturn = async () => {
    const items = returnModal.items.filter((i) => Number(i.returnQty) > 0)
      .map((i) => ({ sale_item_id: i.id, qty: Number(i.returnQty) }));
    if (!items.length) { toast.error('حدد الكميات المرتجعة'); return; }
    try {
      await api.post(`/sales/${returnModal.sale.id}/return`, { items, reason: returnModal.reason });
      toast.success('تم تسجيل المرتجع وإعادة الكميات للمخزون');
      setReturnModal(null);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const cancelSale = async () => {
    try {
      await api.post(`/sales/${cancelId}/cancel`);
      toast.success('تم إلغاء الفاتورة وإرجاع الأصناف للمخزون');
      setCancelId(null);
      load();
    } catch (err) { toast.error(err.message); setCancelId(null); }
  };

  return (
    <div>
      <PageHeader
        title="فواتير المبيعات" subtitle="إدارة الفواتير والمرتجعات ومتابعة الأرباح" icon={ReceiptIcon}
        actions={<button className="btn-primary" onClick={() => navigate('/pos')}><ShoppingCart className="h-4 w-4" /> بيع جديد</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={`${fmtNum(res.summary?.total_amount)} ${currency}`} sub={`${res.total} فاتورة`} icon={ReceiptIcon} tone="brand" />
        <StatCard label="إجمالي الأرباح" value={`${fmtNum(res.summary?.total_profit)} ${currency}`} icon={ReceiptIcon} tone="blue" />
        <StatCard label="مبالغ آجلة" value={`${fmtNum(res.summary?.due_amount)} ${currency}`} icon={ReceiptIcon} tone="amber" />
        <StatCard label="عدد المرتجعات" value={returns.length || '—'} sub="خلال الفترة" icon={Undo2} tone="rose" />
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'invoices', label: 'الفواتير', icon: ReceiptIcon },
          { value: 'returns', label: 'المرتجعات', icon: RotateCcw },
        ]}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="بحث" className="min-w-[200px] flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input className="pr-9" placeholder="رقم الفاتورة أو اسم العميل" value={filters.q}
                onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
            </div>
          </Field>
          <Field label="من"><Input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /></Field>
          <Field label="إلى"><Input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></Field>
          {tab === 'invoices' && (
            <>
              <Field label="الحالة">
                <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
                  <option value="">الكل</option>
                  <option value="completed">مكتملة</option>
                  <option value="cancelled">ملغاة</option>
                </Select>
              </Field>
              <Field label="طريقة الدفع">
                <Select value={filters.payment_method} onChange={(e) => { setFilters({ ...filters, payment_method: e.target.value }); setPage(1); }}>
                  <option value="">الكل</option>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
            </>
          )}
          <button className="btn-ghost" onClick={() => { setFilters({ q: '', from: monthStartStr(), to: todayStr(), status: '', payment_method: '' }); setPage(1); }}>
            <Filter className="h-4 w-4" /> إعادة تعيين
          </button>
        </div>
      </Card>

      {tab === 'invoices' ? (
        <>
          <Table
            loading={loading}
            columns={['رقم الفاتورة', 'التاريخ', 'العميل', 'الأصناف', 'الإجمالي', 'الربح', 'الدفع', 'الحالة', 'الكاشير', '']}
            rows={res.data}
            renderRow={(s) => (
              <tr key={s.id}>
                <td className="font-extrabold text-ink-900">{s.invoice_no}</td>
                <td className="text-ink-500">{fmtDate(s.date)}</td>
                <td>{s.customer_name || <span className="text-ink-400">عميل نقدي</span>}</td>
                <td className="num text-center">{s.items_count}</td>
                <td className="num font-extrabold">{fmtNum(s.total)} {currency}</td>
                <td className="num font-bold text-brand-700">{fmtNum(s.profit)}</td>
                <td><Badge tone="gray">{PAYMENT_METHODS[s.payment_method]}</Badge></td>
                <td>
                  {s.status === 'cancelled' ? <Badge tone="red">ملغاة</Badge>
                    : s.returned_amount > 0 ? <Badge tone="amber">مرتجع جزئي</Badge>
                      : <Badge tone="green">مكتملة</Badge>}
                </td>
                <td className="text-xs text-ink-400">{s.user_name}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button className="btn-outline btn-sm" onClick={() => openDetail(s.id)}><Eye className="h-3.5 w-3.5" /> عرض</button>
                    {s.status !== 'cancelled' && (
                      <button
                        className="btn-outline btn-sm"
                        onClick={async () => {
                          const full = await api.get(`/sales/${s.id}`);
                          setReturnModal({ sale: full.data, items: full.items.map((i) => ({ ...i, returnQty: 0 })), reason: '' });
                        }}
                      >
                        <Undo2 className="h-3.5 w-3.5" /> مرتجع
                      </button>
                    )}
                    {can('manager') && s.status !== 'cancelled' && (
                      <button className="btn-outline btn-sm text-rose-600" onClick={() => setCancelId(s.id)}><Ban className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          />
          <Pagination page={page} pages={res.pages} total={res.total} onChange={setPage} />
        </>
      ) : (
        <Table
          columns={['رقم المرتجع', 'الفاتورة الأصلية', 'التاريخ', 'الأصناف', 'قيمة المرتجع', 'التكلفة', 'السبب', 'المستخدم']}
          rows={returns}
          empty={<EmptyState title="لا توجد مرتجعات" hint="المرتجعات المسجلة خلال الفترة المحددة ستظهر هنا" icon={RotateCcw} />}
          renderRow={(r) => (
            <tr key={r.id}>
              <td className="font-extrabold">{r.return_no}</td>
              <td className="text-brand-700">{r.invoice_no}</td>
              <td className="text-ink-500">{fmtDate(r.date)}</td>
              <td className="num text-center">{r.items_count}</td>
              <td className="num font-extrabold text-rose-600">{fmtNum(r.total)} {currency}</td>
              <td className="num">{fmtNum(r.cost_total)}</td>
              <td className="text-ink-500">{r.reason || '—'}</td>
              <td className="text-xs text-ink-400">{r.user_name}</td>
            </tr>
          )}
        />
      )}

      {/* تفاصيل الفاتورة */}
      <Modal
        open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={`تفاصيل الفاتورة ${detail?.data?.invoice_no || ''}`}
        subtitle={detail ? `${fmtDateTime(detail.data.created_at)} · ${detail.data.user_name || ''}` : ''}
        footer={<>
          <button className="btn-ghost" onClick={() => setDetail(null)}>إغلاق</button>
          <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button>
        </>}
      >
        {!detail ? <Loading /> : (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <Info label="العميل" value={detail.data.customer_name || 'عميل نقدي'} />
                <Info label="طريقة الدفع" value={PAYMENT_METHODS[detail.data.payment_method]} />
                <Info label="الحالة" value={detail.data.status === 'cancelled' ? 'ملغاة' : 'مكتملة'} />
                <Info label="الربح" value={`${fmtNum(detail.data.profit)} ${currency}`} />
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>الصنف</th><th>الدفعة</th><th>الكمية</th><th>المرتجع</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {detail.items.map((i) => (
                      <tr key={i.id}>
                        <td className="font-bold">{i.name}</td>
                        <td className="text-xs text-ink-400">{i.batch_no || '—'}{i.expiry_date ? ` · ${fmtDate(i.expiry_date)}` : ''}</td>
                        <td className="num">{fmtNum(i.qty, 0)}</td>
                        <td className="num text-rose-600">{i.returned_qty ? fmtNum(i.returned_qty, 0) : '—'}</td>
                        <td className="num">{fmtNum(i.unit_price)}</td>
                        <td className="num font-extrabold">{fmtNum(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.returns?.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  مرتجعات على هذه الفاتورة: {detail.returns.map((r) => `${r.return_no} (${fmtNum(r.total)})`).join(' · ')}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-ink-100 p-3">
              <ReceiptView sale={detail.data} items={detail.items} change={0} />
            </div>
          </div>
        )}
      </Modal>

      {/* المرتجع */}
      <Modal
        open={!!returnModal} onClose={() => setReturnModal(null)} size="md"
        title={`مرتجع من الفاتورة ${returnModal?.sale?.invoice_no || ''}`}
        subtitle="حدد الكميات المراد إرجاعها — ستُعاد للمخزون تلقائياً"
        footer={<>
          <button className="btn-ghost" onClick={() => setReturnModal(null)}>إلغاء</button>
          <button className="btn-primary" onClick={submitReturn}><Undo2 className="h-4 w-4" /> تأكيد المرتجع</button>
        </>}
      >
        {returnModal && (
          <div className="space-y-3">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>الصنف</th><th>المباع</th><th>المرتجع سابقاً</th><th>المتاح للإرجاع</th><th>كمية الإرجاع</th></tr></thead>
                <tbody>
                  {returnModal.items.map((i, idx) => {
                    const remaining = +(i.qty - i.returned_qty).toFixed(3);
                    return (
                      <tr key={i.id}>
                        <td className="font-bold">{i.name}</td>
                        <td className="num">{fmtNum(i.qty, 0)}</td>
                        <td className="num">{fmtNum(i.returned_qty, 0)}</td>
                        <td className="num font-bold text-brand-700">{fmtNum(remaining, 0)}</td>
                        <td>
                          <Input
                            type="number" min="0" max={remaining} step="1" className="num w-24 py-1.5 text-center"
                            value={i.returnQty}
                            onChange={(e) => {
                              const v = Math.min(remaining, Math.max(0, Number(e.target.value) || 0));
                              const items = [...returnModal.items];
                              items[idx] = { ...i, returnQty: v };
                              setReturnModal({ ...returnModal, items });
                            }}
                            disabled={remaining <= 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Field label="سبب الإرجاع">
              <Input value={returnModal.reason} onChange={(e) => setReturnModal({ ...returnModal, reason: e.target.value })} placeholder="مثال: خطأ في الصرف / رغبة العميل" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelId} onClose={() => setCancelId(null)} onConfirm={cancelSale} danger
        title="إلغاء الفاتورة" confirmLabel="نعم، ألغِ الفاتورة"
        message="سيتم إلغاء الفاتورة بالكامل وإرجاع جميع الأصناف إلى المخزون. هل أنت متأكد؟"
      />
    </div>
  );
}

const Info = ({ label, value }) => (
  <div className="rounded-xl bg-ink-50 px-3 py-2">
    <p className="text-[11px] font-bold text-ink-400">{label}</p>
    <p className="font-extrabold text-ink-800">{value}</p>
  </div>
);
