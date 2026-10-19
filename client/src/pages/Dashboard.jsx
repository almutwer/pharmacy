import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Receipt, TrendingUp, Wallet, Boxes, AlertTriangle, CalendarClock, PackageX,
  ArrowUpRight, ShoppingBag, BookOpen, CircleDollarSign, Users,
} from 'lucide-react';
import api from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Card, CardHeader, StatCard, Loading, Badge, EmptyState } from '../components/ui.jsx';
import { fmtNum, fmtInt, fmtDate, cn } from '../lib/format.js';

const COLORS = ['#12856b', '#1fa583', '#42c09c', '#78d9ba', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6'];

export default function Dashboard() {
  const { currency, user } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/dashboard')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <Loading label="جاري تحميل لوحة المعلومات..." />;

  const { today, month, stock, alerts, sales_trend: trend, top_products: top, recent_sales: recent } = data;

  const alertCards = [
    { label: 'أصناف منخفضة', value: alerts.low_stock, icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50', to: '/inventory?status=low' },
    { label: 'أصناف نفدت', value: alerts.out_of_stock, icon: PackageX, tone: 'text-rose-600 bg-rose-50', to: '/inventory?status=out' },
    { label: 'قاربت الانتهاء', value: alerts.expiring_soon, icon: CalendarClock, tone: 'text-orange-600 bg-orange-50', to: '/inventory?tab=expiry' },
    { label: 'منتهية الصلاحية', value: alerts.expired, icon: AlertTriangle, tone: 'text-rose-600 bg-rose-50', to: '/inventory?tab=expiry' },
  ];

  return (
    <div className="space-y-5">
      {/* ترحيب */}
      <div className="card relative overflow-hidden bg-ink-950 p-6 text-white">
        <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-brand-300">أهلاً بك مجدداً 👋</p>
            <h2 className="mt-1 text-2xl font-extrabold">{user?.full_name}</h2>
            <p className="mt-1 text-xs text-ink-300">
              مبيعات اليوم: <span className="num font-extrabold text-white">{fmtNum(today.sales)} {currency}</span> ·
              عدد الفواتير: <span className="num font-extrabold text-white">{today.invoices}</span> ·
              ربح اليوم: <span className="num font-extrabold text-brand-300">{fmtNum(today.gross_profit)} {currency}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/pos" className="btn bg-brand-600 text-white hover:bg-brand-500">
              <Receipt className="h-4 w-4" /> فاتورة بيع جديدة
            </Link>
            <Link to="/purchases" className="btn bg-white/10 text-white hover:bg-white/20">
              <ShoppingBag className="h-4 w-4" /> فاتورة شراء
            </Link>
          </div>
        </div>
      </div>

      {/* مؤشرات الشهر */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="مبيعات الشهر" value={`${fmtNum(month.sales)} ${currency}`}
          sub={`${month.invoices} فاتورة · مرتجعات ${fmtNum(month.returns)}`} icon={CircleDollarSign} tone="brand"
        />
        <StatCard
          label="مجمل الربح (الشهر)" value={`${fmtNum(month.gross_profit)} ${currency}`}
          sub={`هامش ${month.sales > 0 ? fmtNum((month.gross_profit / month.sales) * 100, 1) : 0}%`} icon={TrendingUp} tone="blue"
        />
        <StatCard
          label="مصروفات الشهر" value={`${fmtNum(month.expenses)} ${currency}`}
          sub={`مشتريات ${fmtNum(month.purchases)} ${currency}`} icon={Wallet} tone="amber"
        />
        <StatCard
          label="صافي ربح الشهر" value={`${fmtNum(month.net_profit)} ${currency}`}
          sub={month.net_profit >= 0 ? 'ربح تشغيلي موجب' : 'تنبيه: صافي سالب'}
          icon={ArrowUpRight} tone={month.net_profit >= 0 ? 'brand' : 'rose'}
        />
      </div>

      {/* مؤشرات المخزون والتنبيهات */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-4 lg:col-span-1 lg:grid-cols-1">
          <StatCard label="قيمة المخزون (تكلفة)" value={`${fmtNum(stock.cost_value)} ${currency}`} sub={`${stock.products} صنف نشط`} icon={Boxes} tone="violet" />
          <StatCard label="أدوية في الدليل" value={fmtInt(data.catalog_count)} sub="مرجع للإدخال السريع" icon={BookOpen} tone="ink" />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="حركة المبيعات والأرباح" subtitle="آخر 14 يوماً" icon={TrendingUp} />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#12856b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#12856b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #eef1f5', fontSize: 12, fontFamily: 'Tajawal' }}
                  formatter={(v, n) => [`${fmtNum(v)} ${currency}`, n === 'sales' ? 'المبيعات' : 'الربح']}
                  labelFormatter={(l) => fmtDate(l)}
                />
                <Area type="monotone" dataKey="sales" stroke="#12856b" strokeWidth={2.5} fill="url(#gSales)" />
                <Area type="monotone" dataKey="profit" stroke="#0ea5e9" strokeWidth={2} fill="url(#gProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* التنبيهات */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {alertCards.map((a) => (
          <Link key={a.label} to={a.to} className="card flex items-center gap-3 p-4 transition hover:shadow-pop">
            <div className={cn('rounded-xl p-2.5', a.tone)}><a.icon className="h-5 w-5" /></div>
            <div>
              <p className="num text-xl font-extrabold text-ink-900">{a.value}</p>
              <p className="text-xs font-bold text-ink-400">{a.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* الأكثر مبيعاً */}
        <Card>
          <CardHeader title="الأكثر مبيعاً هذا الشهر" subtitle="حسب قيمة المبيعات" icon={TrendingUp} />
          <div className="p-4">
            {top.length === 0 ? <EmptyState title="لا توجد مبيعات بعد" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8695ae' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category" dataKey="name" width={110} tickLine={false} axisLine={false}
                    tick={{ fontSize: 11, fill: '#434d63' }}
                    tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #eef1f5', fontSize: 12, fontFamily: 'Tajawal' }}
                    formatter={(v, n) => [`${fmtNum(v)} ${currency}`, n === 'revenue' ? 'الإيراد' : 'الربح']}
                  />
                  <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                    {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* آخر الفواتير */}
        <Card>
          <CardHeader
            title="آخر فواتير البيع" icon={Receipt}
            action={<Link to="/sales" className="btn-outline btn-sm">عرض الكل</Link>}
          />
          <div className="divide-y divide-ink-50">
            {recent.length === 0 && <EmptyState title="لا توجد فواتير" />}
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-ink-800">{s.invoice_no}</p>
                  <p className="text-[11px] text-ink-400">
                    {s.customer_name || 'عميل نقدي'} · {fmtDate(s.date)} · {s.user_name}
                  </p>
                </div>
                <div className="text-left">
                  <p className="num text-sm font-extrabold text-ink-900">{fmtNum(s.total)} {currency}</p>
                  {s.status === 'cancelled'
                    ? <Badge tone="red">ملغاة</Badge>
                    : <span className="num text-[11px] font-bold text-brand-600">ربح {fmtNum(s.profit)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* الديون */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="ذمم العملاء (لنا)" value={`${fmtNum(alerts.debts)} ${currency}`} sub="فواتير بيع غير مسددة بالكامل" icon={Users} tone="blue" />
        <StatCard label="مستحقات الموردين (علينا)" value={`${fmtNum(alerts.supplier_debts)} ${currency}`} sub="فواتير شراء غير مسددة" icon={ShoppingBag} tone="rose" />
      </div>
    </div>
  );
}
