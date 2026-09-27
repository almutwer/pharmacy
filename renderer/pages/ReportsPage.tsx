import { useEffect, useState } from 'react';

export default function ReportsPage() {
  const [output, setOutput] = useState('');

  useEffect(() => { showDaily(); }, []);

  async function showDaily() {
    const r = await window.pharmacy.reports.dailySales() as any;
    setOutput(`تقرير المبيعات اليومي: ${r.sale_day}\nعدد الفواتير: ${r.invoices_count}\nإجمالي البيع: ${Number(r.total_final_amount).toFixed(2)}\nإجمالي الأصناف: ${r.total_items_sold}\nالربح الإجمالي: ${Number(r.gross_profit).toFixed(2)}`);
  }

  async function showInventory() {
    const rows = await window.pharmacy.reports.inventoryStatus() as any[];
    setOutput(['تقرير المخزون الحالي', '='.repeat(40), ...rows.map((i) => `${i.trade_name} | كمية: ${i.quantity} | حالة: ${statusArabic(i.stock_status)} | صلاحية: ${i.expiry_date}`)].join('\n'));
  }

  async function showExpiry() {
    const lines = ['تقرير الصلاحية', '='.repeat(40)];
    for (const days of [30, 60, 90]) {
      const rows = await window.pharmacy.reports.expiring(days) as any[];
      lines.push(`\nينتهي خلال ${days} يوم:`);
      rows.forEach((i) => lines.push(`- ${i.trade_name} | ${i.quantity} | ${i.expiry_date}`));
    }
    setOutput(lines.join('\n'));
  }

  async function showProfit() {
    const r = await window.pharmacy.reports.profit() as any;
    setOutput(`تقرير الأرباح من ${r.start_date} إلى ${r.end_date}\nالإيراد: ${Number(r.revenue).toFixed(2)}\nالتكلفة: ${Number(r.cost).toFixed(2)}\nصافي/مجمل الربح: ${Number(r.gross_profit).toFixed(2)}\nعدد الفواتير: ${r.invoices_count}`);
  }

  async function showSuppliers() {
    const rows = await window.pharmacy.reports.suppliers() as any[];
    setOutput(['تقرير الموردين', '='.repeat(40), ...rows.map((i) => `${i.supplier_name} | دفعات: ${i.batches_count} | تكلفة المخزون الحالية: ${Number(i.current_stock_cost || 0).toFixed(2)}`)].join('\n'));
  }

  async function showStagnant() {
    const rows = await window.pharmacy.reports.stagnant() as any[];
    setOutput(['تقرير الأصناف الراكدة', '='.repeat(40), ...rows.map((i) => `${i.trade_name} | كمية: ${i.quantity} | آخر بيع: ${i.last_sale_date || 'لم يباع'}`)].join('\n'));
  }

  return (
    <div>
      <div className="report-actions">
        <button onClick={showDaily}>تقرير المبيعات اليومي</button>
        <button onClick={showInventory}>تقرير المخزون</button>
        <button onClick={showExpiry}>تقرير الصلاحية 30/60/90</button>
        <button onClick={showProfit}>تقرير الأرباح</button>
        <button onClick={showSuppliers}>تقرير الموردين</button>
        <button onClick={showStagnant}>الأصناف الراكدة</button>
      </div>
      <pre className="report-output">{output}</pre>
    </div>
  );
}

function statusArabic(status: string): string {
  return { in_stock: 'متوفر', low_stock: 'كمية منخفضة', out_of_stock: 'نفد المخزون', expired: 'منتهي', expiring_soon: 'قرب الانتهاء' }[status] || status;
}
