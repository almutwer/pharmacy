import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Printer, CheckCircle2, X,
  ScanBarcode, UserPlus, CreditCard, Banknote, Landmark, Clock, AlertTriangle,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useToast, Card, Field, Input, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui.jsx';
import { fmtNum, expiryState, PAYMENT_METHODS, cn } from '../lib/format.js';
import Receipt from '../components/Receipt.jsx';

export default function POS() {
  const { currency, settings } = useApp();
  const toast = useToast();
  const searchRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [payment, setPayment] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [newCustomer, setNewCustomer] = useState(null);

  const taxRate = Number(settings.tax_rate || 0);

  useEffect(() => { api.get('/customers', { active: 1 }).then((r) => setCustomers(r.data)); }, []);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // البحث المباشر
  useEffect(() => {
    if (!query.trim()) { setResults([]); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/products/search', { q: query.trim() })
        .then((r) => setResults(r.data))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const addToCart = (product) => {
    if (product.stock_qty <= 0) { toast.error(`الصنف «${product.name}» غير متوفر في المخزون`); return; }
    setCart((prev) => {
      const found = prev.find((i) => i.product_id === product.id);
      if (found) {
        if (found.qty + 1 > product.stock_qty) { toast.error('الكمية المطلوبة تتجاوز المتاح'); return prev; }
        return prev.map((i) => (i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        qty: 1,
        unit_price: product.sale_price,
        discount: 0,
        stock_qty: product.stock_qty,
        nearest_expiry: product.nearest_expiry,
      }];
    });
    setQuery('');
    setResults([]);
    searchRef.current?.focus();
  };

  const updateLine = (id, patch) => setCart((prev) => prev.map((i) => (i.product_id === id ? { ...i, ...patch } : i)));
  const removeLine = (id) => setCart((prev) => prev.filter((i) => i.product_id !== id));

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price - (Number(i.discount) || 0), 0);
    const afterDiscount = Math.max(0, subtotal - (Number(discount) || 0));
    const tax = +(afterDiscount * (taxRate / 100)).toFixed(2);
    const total = +(afterDiscount + tax).toFixed(2);
    const paidNum = paid === '' ? (payment === 'credit' ? 0 : total) : Number(paid) || 0;
    return { subtotal: +subtotal.toFixed(2), tax, total, paid: paidNum, change: +(paidNum - total).toFixed(2) };
  }, [cart, discount, taxRate, paid, payment]);

  const checkout = async () => {
    if (!cart.length) { toast.error('السلة فارغة'); return; }
    if (payment === 'credit' && !customerId) { toast.error('البيع الآجل يتطلب اختيار عميل'); return; }
    setBusy(true);
    try {
      const res = await api.post('/sales', {
        customer_id: customerId || null,
        discount: Number(discount) || 0,
        tax: totals.tax,
        paid: totals.paid,
        payment_method: payment,
        notes: notes || null,
        items: cart.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          unit_price: i.unit_price,
          discount: Number(i.discount) || 0,
        })),
      });
      const full = await api.get(`/sales/${res.id}`);
      setReceipt({ sale: full.data, items: full.items, change: totals.change });
      toast.success(`تم إصدار الفاتورة ${res.invoice_no}`);
      setCart([]); setDiscount(0); setPaid(''); setNotes(''); setCustomerId(''); setPayment('cash');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/customers', newCustomer);
      const list = await api.get('/customers', { active: 1 });
      setCustomers(list.data);
      setCustomerId(String(res.id));
      setNewCustomer(null);
      toast.success('تمت إضافة العميل');
    } catch (err) { toast.error(err.message); }
  };

  const payIcons = { cash: Banknote, card: CreditCard, transfer: Landmark, credit: Clock };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      {/* البحث والنتائج */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
            <input
              ref={searchRef}
              className="input py-3.5 pr-11 text-base"
              placeholder="ابحث بالاسم التجاري أو العلمي أو امسح الباركود..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) addToCart(results[0]); }}
            />
            {searching && <Spinner className="absolute left-3.5 top-1/2 -translate-y-1/2" />}
            <ScanBarcode className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          </div>

          {query && (
            <div className="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto">
              {!searching && results.length === 0 && (
                <p className="py-6 text-center text-sm font-bold text-ink-400">لا توجد نتائج مطابقة</p>
              )}
              {results.map((p) => {
                const exp = expiryState(p.nearest_expiry);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-right transition hover:border-brand-400 hover:bg-brand-50/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-ink-900">{p.name} <span className="text-xs font-bold text-ink-400">{p.strength || ''}</span></p>
                      <p className="truncate text-[11px] text-ink-400">{p.generic_name || '—'} · {p.form || ''} · {p.manufacturer || ''}</p>
                    </div>
                    {p.nearest_expiry && exp.key !== 'ok' && <Badge className={exp.cls}>{exp.label}</Badge>}
                    <Badge tone={p.stock_qty > 0 ? 'green' : 'red'}>{fmtNum(p.stock_qty, 0)} {p.unit}</Badge>
                    <span className="num shrink-0 font-extrabold text-brand-700">{fmtNum(p.sale_price)} {currency}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* السلة */}
        <Card>
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
            <div className="flex items-center gap-2 font-extrabold text-ink-900">
              <ShoppingCart className="h-5 w-5 text-brand-600" /> سلة البيع
              <Badge tone="brand">{cart.length} صنف</Badge>
            </div>
            {cart.length > 0 && (
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => setCart([])}>
                <X className="h-4 w-4" /> إفراغ السلة
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <EmptyState title="السلة فارغة" hint="ابحث عن الدواء وأضفه للسلة لبدء الفاتورة" icon={ShoppingCart} />
          ) : (
            <div className="divide-y divide-ink-50">
              {cart.map((item) => (
                <div key={item.product_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-ink-900">{item.name}</p>
                    <p className="text-[11px] text-ink-400">
                      المتاح: {fmtNum(item.stock_qty, 0)} {item.unit}
                      {item.qty > item.stock_qty && <span className="mr-1 font-bold text-rose-600"><AlertTriangle className="inline h-3 w-3" /> تجاوزت المتاح</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border border-ink-200 p-1">
                    <button className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => updateLine(item.product_id, { qty: Math.max(1, item.qty - 1) })}>
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      className="num w-14 border-0 text-center text-sm font-extrabold outline-none"
                      value={item.qty}
                      onChange={(e) => updateLine(item.product_id, { qty: Math.max(0.01, Number(e.target.value) || 0) })}
                    />
                    <button className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => updateLine(item.product_id, { qty: item.qty + 1 })}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <input
                    className="input num w-24 py-1.5 text-center text-sm"
                    value={item.unit_price}
                    onChange={(e) => updateLine(item.product_id, { unit_price: Number(e.target.value) || 0 })}
                    title="سعر الوحدة"
                  />
                  <input
                    className="input num w-20 py-1.5 text-center text-sm"
                    value={item.discount}
                    onChange={(e) => updateLine(item.product_id, { discount: Number(e.target.value) || 0 })}
                    title="خصم البند"
                  />
                  <span className="num w-24 text-left font-extrabold text-ink-900">
                    {fmtNum(item.qty * item.unit_price - (Number(item.discount) || 0))}
                  </span>
                  <button className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => removeLine(item.product_id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* الدفع */}
      <Card className="h-fit xl:sticky xl:top-20">
        <div className="border-b border-ink-100 px-5 py-3.5 font-extrabold text-ink-900">إتمام عملية البيع</div>
        <div className="space-y-4 p-5">
          <Field label="العميل">
            <div className="flex gap-2">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">عميل نقدي (بدون تسجيل)</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
              </Select>
              <button className="btn-outline px-3" title="عميل جديد" onClick={() => setNewCustomer({ name: '', phone: '' })}>
                <UserPlus className="h-4 w-4" />
              </button>
            </div>
          </Field>

          <Field label="طريقة الدفع">
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(PAYMENT_METHODS).map(([key, label]) => {
                const Icon = payIcons[key];
                return (
                  <button
                    key={key} onClick={() => setPayment(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-bold transition',
                      payment === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50',
                    )}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="خصم على الفاتورة">
              <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            <Field label="المبلغ المدفوع">
              <Input type="number" min="0" step="0.01" placeholder={String(totals.total)} value={paid} onChange={(e) => setPaid(e.target.value)} />
            </Field>
          </div>

          <Field label="ملاحظات">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
          </Field>

          <div className="space-y-2 rounded-2xl bg-ink-50 p-4 text-sm">
            <Row label="الإجمالي قبل الخصم" value={`${fmtNum(totals.subtotal)} ${currency}`} />
            <Row label="الخصم" value={`− ${fmtNum(discount || 0)} ${currency}`} />
            {taxRate > 0 && <Row label={`الضريبة (${taxRate}%)`} value={`${fmtNum(totals.tax)} ${currency}`} />}
            <div className="my-2 border-t border-dashed border-ink-200" />
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-ink-700">الإجمالي المستحق</span>
              <span className="num text-2xl font-extrabold text-brand-700">{fmtNum(totals.total)} {currency}</span>
            </div>
            {totals.change !== 0 && (
              <Row
                label={totals.change >= 0 ? 'المتبقي للعميل' : 'المتبقي على العميل'}
                value={`${fmtNum(Math.abs(totals.change))} ${currency}`}
                valueClass={totals.change >= 0 ? 'text-sky-700' : 'text-rose-700'}
              />
            )}
          </div>

          <button className="btn-primary w-full py-3.5 text-base" onClick={checkout} disabled={busy || !cart.length}>
            {busy ? <Spinner className="h-5 w-5 text-white" /> : <CheckCircle2 className="h-5 w-5" />}
            تأكيد البيع وطباعة الفاتورة
          </button>
        </div>
      </Card>

      {/* عميل جديد */}
      <Modal
        open={!!newCustomer} onClose={() => setNewCustomer(null)} title="إضافة عميل جديد" size="sm"
        footer={<><button className="btn-ghost" onClick={() => setNewCustomer(null)}>إلغاء</button>
          <button className="btn-primary" onClick={saveCustomer}>حفظ</button></>}
      >
        <form onSubmit={saveCustomer} className="space-y-3">
          <Field label="اسم العميل" required>
            <Input autoFocus value={newCustomer?.name || ''} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
          </Field>
          <Field label="رقم الجوال">
            <Input value={newCustomer?.phone || ''} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* الفاتورة */}
      <Modal
        open={!!receipt} onClose={() => setReceipt(null)} title="تمت عملية البيع بنجاح" size="sm"
        footer={<>
          <button className="btn-ghost" onClick={() => setReceipt(null)}>إغلاق</button>
          <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button>
        </>}
      >
        {receipt && <Receipt sale={receipt.sale} items={receipt.items} change={receipt.change} />}
      </Modal>
    </div>
  );
}

function Row({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className={cn('num font-bold text-ink-800', valueClass)}>{value}</span>
    </div>
  );
}
