import React, { useCallback, useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart,
} from 'recharts';
import {
  TrendingUp, Printer, Download, CircleDollarSign, Wallet, Boxes, ShoppingBag,
  Percent, Undo2, PackageX, Calendar,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, CardHeader, Tabs, Field, Input, Select, Table, StatCard, Loading, EmptyState, Badge,
} from '../components/ui.jsx';
import { fmtNum, fmtDate, todayStr, monthStartStr, daysAgoStr, PAYMENT_METHODS, cn } from '../lib/format.js';

const COLORS = ['#12856b', '#1fa583', '#42c09c', '#78d9ba', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b'];

export default function Reports() {
  const { currency } = useApp();
  const [tab, setTab] = useState('profit');
  const [range, setRange] = useState({ from: monthStartStr(), to: todayStr() });
  const [group, setGroup] = useState('day');

  const quick = [
    ['اليوم', todayStr(), todayStr()],
    ['آخر 7 أيام', daysAgoStr(6), todayStr()],
    ['آخر 30 يوم', daysAgoStr(29), todayStr()],
    ['هذا الشهر', monthStartStr(), todayStr()],
    ['هذه السنة', `${new Date().getFullYear()}-01-01`, todayStr()],
  ];

  return (
    <div>
      <PageHeader
        title="التقارير والأرباح" subtitle="تحليل شامل للأداء المالي والتشغيلي للصيدلية" icon={TrendingUp}
        actions={<button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة التقرير</button>}
      />

      <Card className="mb-4 p-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="من تاريخ"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="إلى تاريخ"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          {tab === 'profit' && (
            <Field label="التجميع">
              <Select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="day">يومي</option><option value="month">شهري</option>
              </Select>
            </Field>
          )}
          <div className="flex flex-wrap gap-1.5">
            {quick.map(([label, from, to]) => (
              <button key={label} onClick={() => setRange({ from, to })}
                className={cn('rounded-lg border px-3 py-2 text-xs font-bold transition',
                  range.from === from && range.to === to ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50')}>
                <Calendar className="ml-1 inline h-3 w-3" />{label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'profit', label: 'الأرباح والخسائر', icon: CircleDollarSign },
          { value: 'sales', label: 'تقرير المبيعات', icon: TrendingUp },
          { value: 'purchases', label: 'تقرير المشتريات', icon: ShoppingBag },
          { value: 'inventory', label: 'تقييم المخزون', icon: Boxes },
        ]}
      />

      {tab === 'profit' && <ProfitReport range={range} group={group} currency={currency} />}
      {tab === 'sales' && <SalesReport range={range} currency={currency} />}
      {tab === 'purchases' && <PurchasesReport range={range} currency={currency} />}
      {tab === 'inventory' && <InventoryReport currency={currency} />}
    </div>
  );
}

/* ================== تقرير الأرباح ================== */
function ProfitReport({ range, group, currency }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/reports/profit', { ...range, group }).then(setData).finally(() => setLoading(false));
  }, [range, group]);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <Loading />;
  const s = data.summary;

  const lines = [
    ['إجمالي المبيعات', s.gross_sales, 'text-ink-900'],
    ['مرتجعات المبيعات', -s.returns, 'text-rose-600'],
    ['صافي المبيعات', s.net_sales, 'font-extrabold text-ink-900'],
    ['ضريبة محصّلة', -s.tax, 'text-ink-500'],
    ['تكلفة البضاعة المباعة', -s.cogs, 'text-rose-600'],
    ['مجمل الربح', s.gross_profit, 'font-extrabold text-brand-700'],
    ['المصروفات التشغيلية', -s.expenses, 'text-rose-600'],
    ['خسائر التالف والمنتهي', -s.losses, 'text-rose-600'],
  ];

  return (
    <div className="space-y-4 print-area">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="صافي المبيعات" value={`${fmtNum(s.net_sales)} ${currency}`} sub={`${s.invoices} فاتورة`} icon={CircleDollarSign} tone="brand" />
        <StatCard label="مجمل الربح" value={`${fmtNum(s.gross_profit)} ${currency}`} sub={`تكلفة ${fmtNum(s.cogs)}`} icon={TrendingUp} tone="blue" />
        <StatCard label="المصروفات" value={`${fmtNum(s.expenses)} ${currency}`} sub={`تالف ${fmtNum(s.losses)}`} icon={Wallet} tone="amber" />
        <StatCard
          label="صافي الربح" value={`${fmtNum(s.net_profit)} ${currency}`}
          sub={`هامش صافي ${fmtNum(s.margin, 1)}%`} icon={Percent} tone={s.net_profit >= 0 ? 'brand' : 'rose'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="تطور الإيرادات والأرباح" subtitle={`${fmtDate(data.from)} — ${fmtDate(data.to)}`} icon={TrendingUp} />
          <div className="p-4">
            {data.series.length === 0 ? <EmptyState title="لا توجد بيانات خلال الفترة" /> : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v) => `${fmtNum(v)} ${currency}`} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Tajawal' }} />
                  <Bar name="المبيعات" dataKey="sales" fill="#42c09c" radius={[6, 6, 0, 0]} />
                  <Bar name="المصروفات" dataKey="expenses" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Line name="صافي الربح" type="monotone" dataKey="net_profit" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="قائمة الدخل" subtitle="ملخص الأرباح والخسائر" icon={CircleDollarSign} />
          <div className="space-y-2 p-5 text-sm">
            {lines.map(([label, value, cls]) => (
              <div key={label} className="flex items-center justify-between border-b border-dashed border-ink-100 pb-2">
                <span className="text-ink-500">{label}</span>
                <span className={cn('num font-bold', cls)}>{fmtNum(value)} {currency}</span>
              </div>
            ))}
            <div className={cn('mt-3 flex items-center justify-between rounded-xl p-3',
              s.net_profit >= 0 ? 'bg-brand-50 text-brand-800' : 'bg-rose-50 text-rose-800')}>
              <span className="font-extrabold">صافي الربح</span>
              <span className="num text-xl font-extrabold">{fmtNum(s.net_profit)} {currency}</span>
            </div>
            <p className="pt-2 text-[11px] leading-6 text-ink-400">
              * إجمالي المشتريات خلال الفترة: <span className="num font-bold">{fmtNum(s.purchases)} {currency}</span> ({s.purchases_count} فاتورة) —
              لا تُحتسب ضمن المصروفات لأنها تتحول إلى مخزون، وتظهر تكلفتها عند البيع.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الربحية حسب التصنيف الدوائي" icon={Boxes} />
          <div className="p-4">
            {data.by_category.length === 0 ? <EmptyState title="لا توجد بيانات" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.by_category} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 11, fill: '#434d63' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v, n) => [`${fmtNum(v)} ${currency}`, n === 'revenue' ? 'الإيراد' : 'الربح']} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Tajawal' }} />
                  <Bar name="الإيراد" dataKey="revenue" fill="#78d9ba" radius={[0, 6, 6, 0]} />
                  <Bar name="الربح" dataKey="profit" fill="#12856b" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="المصروفات حسب البند" icon={Wallet} />
          <div className="p-4">
            {data.expenses_by_category.length === 0 ? <EmptyState title="لا توجد مصروفات" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={data.expenses_by_category} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
                    {data.expenses_by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v) => `${fmtNum(v)} ${currency}`} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tajawal' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================== تقرير المبيعات ================== */
function SalesReport({ range, currency }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/reports/sales', range).then(setData); }, [range]);
  if (!data) return <Loading />;

  const totals = data.by_day.reduce((a, d) => ({ total: a.total + d.total, profit: a.profit + d.profit, invoices: a.invoices + d.invoices }), { total: 0, profit: 0, invoices: 0 });

  return (
    <div className="space-y-4 print-area">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={`${fmtNum(totals.total)} ${currency}`} icon={CircleDollarSign} tone="brand" />
        <StatCard label="إجمالي الأرباح" value={`${fmtNum(totals.profit)} ${currency}`} icon={TrendingUp} tone="blue" />
        <StatCard label="عدد الفواتير" value={totals.invoices} icon={Undo2} tone="violet" />
        <StatCard label="متوسط الفاتورة" value={`${fmtNum(totals.invoices ? totals.total / totals.invoices : 0)} ${currency}`} icon={Percent} tone="amber" />
      </div>

      <Card>
        <CardHeader title="المبيعات اليومية" icon={TrendingUp} />
        <div className="p-4">
          {data.by_day.length === 0 ? <EmptyState title="لا توجد مبيعات" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8695ae' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v) => `${fmtNum(v)} ${currency}`} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Tajawal' }} />
                <Bar name="المبيعات" dataKey="total" fill="#42c09c" radius={[6, 6, 0, 0]} />
                <Line name="الربح" type="monotone" dataKey="profit" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الأصناف الأكثر مبيعاً" icon={Boxes} />
          <Table
            columns={['الصنف', 'الكمية', 'الإيراد', 'الربح']}
            rows={data.top_products}
            renderRow={(p, i) => (
              <tr key={i}>
                <td className="font-bold">{p.name}</td>
                <td className="num">{fmtNum(p.qty, 0)} {p.unit}</td>
                <td className="num font-extrabold">{fmtNum(p.revenue)} {currency}</td>
                <td className="num text-brand-700">{fmtNum(p.profit)}</td>
              </tr>
            )}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="حسب طريقة الدفع" icon={Wallet} />
            <Table
              columns={['الطريقة', 'الفواتير', 'الإجمالي']}
              rows={data.by_payment}
              renderRow={(p, i) => (
                <tr key={i}>
                  <td><Badge tone="gray">{PAYMENT_METHODS[p.payment_method] || p.payment_method}</Badge></td>
                  <td className="num">{p.invoices}</td>
                  <td className="num font-extrabold">{fmtNum(p.total)} {currency}</td>
                </tr>
              )}
            />
          </Card>
          <Card>
            <CardHeader title="أداء الموظفين" icon={TrendingUp} />
            <Table
              columns={['الموظف', 'الفواتير', 'المبيعات', 'الأرباح']}
              rows={data.by_user}
              renderRow={(u, i) => (
                <tr key={i}>
                  <td className="font-bold">{u.user_name || '—'}</td>
                  <td className="num">{u.invoices}</td>
                  <td className="num font-extrabold">{fmtNum(u.total)} {currency}</td>
                  <td className="num text-brand-700">{fmtNum(u.profit)}</td>
                </tr>
              )}
            />
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="أفضل العملاء" icon={Undo2} />
        <Table
          columns={['العميل', 'عدد الفواتير', 'إجمالي المشتريات']}
          rows={data.top_customers}
          empty={<EmptyState title="لا يوجد عملاء مسجلون في الفترة" />}
          renderRow={(c, i) => (
            <tr key={i}>
              <td className="font-bold">{c.name}</td>
              <td className="num">{c.invoices}</td>
              <td className="num font-extrabold">{fmtNum(c.total)} {currency}</td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

/* ================== تقرير المشتريات ================== */
function PurchasesReport({ range, currency }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/reports/purchases', range).then(setData); }, [range]);
  if (!data) return <Loading />;

  return (
    <div className="space-y-4 print-area">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي المشتريات" value={`${fmtNum(data.summary.total)} ${currency}`} icon={ShoppingBag} tone="brand" />
        <StatCard label="المدفوع" value={`${fmtNum(data.summary.paid)} ${currency}`} icon={Wallet} tone="blue" />
        <StatCard label="المستحق" value={`${fmtNum(data.summary.due)} ${currency}`} icon={Wallet} tone="rose" />
        <StatCard label="عدد الفواتير" value={data.summary.invoices} icon={ShoppingBag} tone="violet" />
      </div>

      <Card>
        <CardHeader title="المشتريات اليومية" icon={ShoppingBag} />
        <div className="p-4">
          {data.by_day.length === 0 ? <EmptyState title="لا توجد مشتريات" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8695ae' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v) => `${fmtNum(v)} ${currency}`} />
                <Bar name="المشتريات" dataKey="total" fill="#12856b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="حسب المورد" icon={ShoppingBag} />
          <Table
            columns={['المورد', 'الفواتير', 'الإجمالي', 'المستحق']}
            rows={data.by_supplier}
            renderRow={(s, i) => (
              <tr key={i}>
                <td className="font-bold">{s.supplier}</td>
                <td className="num">{s.invoices}</td>
                <td className="num font-extrabold">{fmtNum(s.total)} {currency}</td>
                <td className="num text-rose-600">{fmtNum(s.due)}</td>
              </tr>
            )}
          />
        </Card>
        <Card>
          <CardHeader title="أكثر الأصناف توريداً" icon={Boxes} />
          <Table
            columns={['الصنف', 'الكمية', 'التكلفة']}
            rows={data.top_products}
            renderRow={(p, i) => (
              <tr key={i}>
                <td className="font-bold">{p.name}</td>
                <td className="num">{fmtNum(p.qty, 0)}</td>
                <td className="num font-extrabold">{fmtNum(p.total)} {currency}</td>
              </tr>
            )}
          />
        </Card>
      </div>
    </div>
  );
}

/* ================== تقييم المخزون ================== */
function InventoryReport({ currency }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/reports/inventory-valuation').then(setData); }, []);
  if (!data) return <Loading />;

  const exportCsv = () => {
    const header = 'الصنف,التصنيف,الكمية,قيمة التكلفة,قيمة البيع\n';
    const body = data.data.map((r) => `"${r.name}","${r.category}",${r.qty},${r.cost_value},${r.sale_value}`).join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inventory-valuation-${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 print-area">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="قيمة المخزون (تكلفة)" value={`${fmtNum(data.totals.cost_value)} ${currency}`} icon={Boxes} tone="brand" />
        <StatCard label="قيمة البيع المتوقعة" value={`${fmtNum(data.totals.sale_value)} ${currency}`} icon={CircleDollarSign} tone="blue" />
        <StatCard label="الربح المتوقع" value={`${fmtNum(data.totals.expected_profit)} ${currency}`} icon={TrendingUp} tone="violet" />
        <StatCard label="إجمالي الوحدات" value={fmtNum(data.totals.qty, 0)} icon={PackageX} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="تقييم المخزون حسب الصنف" subtitle={`${data.data.length} صنف`} icon={Boxes}
          action={<button className="btn-outline btn-sm no-print" onClick={exportCsv}><Download className="h-4 w-4" /> تصدير CSV</button>}
        />
        <div className="max-h-[560px] overflow-y-auto">
          <Table
            columns={['الصنف', 'التصنيف', 'الكمية', 'قيمة التكلفة', 'قيمة البيع', 'الربح المتوقع']}
            rows={data.data}
            renderRow={(r) => (
              <tr key={r.id}>
                <td className="font-bold">{r.name}</td>
                <td className="text-ink-500">{r.category}</td>
                <td className="num">{fmtNum(r.qty, 0)} {r.unit}</td>
                <td className="num">{fmtNum(r.cost_value)} {currency}</td>
                <td className="num">{fmtNum(r.sale_value)} {currency}</td>
                <td className="num font-extrabold text-brand-700">{fmtNum(r.sale_value - r.cost_value)}</td>
              </tr>
            )}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="التوزيع حسب التصنيف" icon={Boxes} />
        <div className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.by_category} dataKey="cost_value" nameKey="category" cx="50%" cy="50%" outerRadius={110} innerRadius={60} paddingAngle={2}>
                {data.by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, fontFamily: 'Tajawal' }} formatter={(v) => `${fmtNum(v)} ${currency}`} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tajawal' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
