/** فاتورة قابلة للطباعة */
import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { fmtNum, fmtDateTime, PAYMENT_METHODS, fmtSoldQty } from '../lib/format.js';

export default function Receipt({ sale, items, change }) {
  const { settings, currency } = useApp();

  return (
    <div className="print-area mx-auto max-w-sm bg-white text-ink-900" dir="rtl">
      <div className="border-b-2 border-dashed border-ink-200 pb-3 text-center">
        <h2 className="text-xl font-extrabold">{settings.pharmacy_name || 'الصيدلية'}</h2>
        {settings.pharmacy_address && <p className="text-[11px] text-ink-500">{settings.pharmacy_address}</p>}
        {settings.pharmacy_phone && <p className="text-[11px] text-ink-500">هاتف: {settings.pharmacy_phone}</p>}
        {settings.tax_number && <p className="text-[11px] text-ink-500">الرقم الضريبي: {settings.tax_number}</p>}
        <p className="mt-2 inline-block rounded-lg bg-ink-100 px-3 py-1 text-xs font-extrabold">فاتورة مبيعات</p>
      </div>

      <div className="grid grid-cols-2 gap-1 border-b border-dashed border-ink-200 py-2 text-[11px]">
        <Info label="رقم الفاتورة" value={sale.invoice_no} />
        <Info label="التاريخ" value={fmtDateTime(sale.created_at || sale.date)} />
        <Info label="العميل" value={sale.customer_name || 'عميل نقدي'} />
        <Info label="الكاشير" value={sale.user_name || '—'} />
        <Info label="طريقة الدفع" value={PAYMENT_METHODS[sale.payment_method] || sale.payment_method} />
      </div>

      <table className="w-full py-2 text-[11px]">
        <thead>
          <tr className="border-b border-ink-200 text-right">
            <th className="py-1.5">الصنف</th>
            <th className="py-1.5 text-center">الكمية</th>
            <th className="py-1.5 text-center">السعر</th>
            <th className="py-1.5 text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-dashed border-ink-100">
              <td className="py-1.5">
                {i.name || i.product_name}
                {i.unit_mode === 'sub' && <span className="text-[9px] text-ink-500"> (تجزئة)</span>}
              </td>
              <td className="num py-1.5 text-center">{fmtSoldQty(i)}</td>
              <td className="num py-1.5 text-center">{fmtNum(i.unit_price_display ?? i.unit_price)}</td>
              <td className="num py-1.5 text-left font-bold">{fmtNum(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 border-t-2 border-dashed border-ink-200 pt-2 text-xs">
        <Line label="الإجمالي" value={fmtNum(sale.subtotal)} currency={currency} />
        {sale.discount > 0 && <Line label="الخصم" value={`− ${fmtNum(sale.discount)}`} currency={currency} />}
        {sale.tax > 0 && <Line label="الضريبة" value={fmtNum(sale.tax)} currency={currency} />}
        <div className="flex items-center justify-between border-t border-ink-300 pt-1.5 text-base font-extrabold">
          <span>الصافي</span>
          <span className="num">{fmtNum(sale.total)} {currency}</span>
        </div>
        <Line label="المدفوع" value={fmtNum(sale.paid)} currency={currency} />
        {change > 0 && <Line label="المتبقي للعميل" value={fmtNum(change)} currency={currency} />}
        {sale.total - sale.paid > 0 && <Line label="آجل على العميل" value={fmtNum(sale.total - sale.paid)} currency={currency} />}
      </div>

      <p className="mt-4 border-t border-dashed border-ink-200 pt-3 text-center text-[11px] font-bold text-ink-500">
        {settings.invoice_footer || 'شكراً لزيارتكم'}
      </p>
    </div>
  );
}

const Info = ({ label, value }) => (
  <div className="flex gap-1">
    <span className="text-ink-400">{label}:</span>
    <span className="font-bold">{value}</span>
  </div>
);

const Line = ({ label, value, currency }) => (
  <div className="flex items-center justify-between">
    <span className="text-ink-500">{label}</span>
    <span className="num font-bold">{value} {currency}</span>
  </div>
);
