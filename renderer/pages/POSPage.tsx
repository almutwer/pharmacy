import { useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../components/DataTable';

interface CartItem {
  inventory_id?: number | null;
  catalog_id?: number | null;
  medicine_name: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  is_one_off?: boolean;
  one_off_barcode?: string | null;
  notes?: string | null;
}

export default function POSPage() {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [discount, setDiscount] = useState(0);
  const [message, setMessage] = useState('');
  const discountRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const tax = Math.max(subtotal - discount, 0) * 0.14;
    return { subtotal, tax, final: Math.max(subtotal - discount, 0) + tax };
  }, [cart, discount]);

  useEffect(() => {
    const newInvoice = () => resetInvoice();
    const focusDiscount = () => discountRef.current?.focus();
    const complete = () => completeSale('cash');
    const cancel = () => cart.length && confirm('هل تريد إلغاء الفاتورة الحالية؟') && resetInvoice();
    const remove = () => removeSelected();
    window.addEventListener('pos:new-invoice', newInvoice);
    window.addEventListener('pos:focus-discount', focusDiscount);
    window.addEventListener('pos:complete-sale', complete);
    window.addEventListener('pos:cancel-invoice', cancel);
    window.addEventListener('pos:delete-selected', remove);
    return () => {
      window.removeEventListener('pos:new-invoice', newInvoice);
      window.removeEventListener('pos:focus-discount', focusDiscount);
      window.removeEventListener('pos:complete-sale', complete);
      window.removeEventListener('pos:cancel-invoice', cancel);
      window.removeEventListener('pos:delete-selected', remove);
    };
  }, [cart, selectedRow]);

  function resetInvoice() {
    setCart([]);
    setDiscount(0);
    setSelectedRow(null);
    setMessage('فاتورة جديدة جاهزة');
    setTimeout(() => document.getElementById('pos-search')?.focus(), 50);
  }

  function removeSelected() {
    if (selectedRow === null) return;
    setCart((old) => old.filter((_, index) => index !== selectedRow));
    setSelectedRow(null);
  }

  async function addFromSearch() {
    const cleaned = query.trim();
    if (!cleaned) return;
    try {
      const matches = await window.pharmacy.sales.searchPOS(cleaned, 10) as any[];
      if (!matches.length) {
        await offerOneOff(cleaned);
        return;
      }
      const chosen = matches[0];
      if (!chosen.inventory_id) {
        await offerQuickAddOrOneOff(chosen);
        return;
      }
      if (chosen.stock_status === 'expired') {
        alert('🚫 الدواء منتهي الصلاحية ولا يمكن بيعه.');
        return;
      }
      if (Number(chosen.quantity) <= 0) {
        alert('❌ نفدت الكمية ولا يمكن البيع.');
        return;
      }
      if (chosen.days_to_expiry !== null && Number(chosen.days_to_expiry) <= 30) {
        alert('⚠️ تحذير: هذا الدواء ينتهي خلال 30 يوم.');
      }
      const item = await window.pharmacy.sales.buildCartItemFromInventory(Number(chosen.inventory_id), 1) as CartItem;
      setCart((old) => {
        const index = old.findIndex((existing) => existing.inventory_id === item.inventory_id);
        if (index >= 0) {
          const copy = [...old];
          copy[index] = { ...copy[index], quantity: copy[index].quantity + 1 };
          return copy;
        }
        return [...old, item];
      });
      setQuery('');
      setMessage('تمت إضافة الصنف للفاتورة');
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function offerQuickAddOrOneOff(row: any) {
    const addToStock = confirm('⚠️ الدواء مسجل في الدليل لكنه غير موجود بالمخزون.\nاضغط OK لإضافة للمخزون والبيع الآن.\nاضغط Cancel للبيع بدون تسجيل مخزون.');
    if (addToStock) {
      const quantity = Number(prompt('الكمية المستلمة:', '1') || '0');
      const purchase_price = Number(prompt('سعر الشراء:', '0') || '0');
      const selling_price = Number(prompt('سعر البيع:', String(row.official_price || 0)) || '0');
      const expiry_date = prompt('تاريخ الانتهاء YYYY-MM-DD:', '') || '';
      const batch_number = prompt('رقم الدفعة:', '') || '';
      const supplier_name = prompt('اسم المورد:', '') || '';
      const result = await window.pharmacy.inventory.addStock({
        catalog_id: Number(row.catalog_id),
        quantity,
        purchase_price,
        selling_price,
        expiry_date,
        batch_number,
        supplier_name,
        movement_type: 'quick_add',
        username: 'admin',
      }) as any;
      const item = await window.pharmacy.sales.buildCartItemFromInventory(Number(result.inventory_id), 1) as CartItem;
      setCart((old) => [...old, item]);
      setQuery('');
      setMessage('تمت الإضافة السريعة للمخزون وإضافة صنف واحد للفاتورة');
    } else {
      const price = Number(prompt('سعر البيع:', String(row.official_price || 0)) || '0');
      const name = `${row.trade_name || ''} ${row.strength || ''}`.trim();
      setCart((old) => [...old, {
        inventory_id: null,
        catalog_id: Number(row.catalog_id),
        medicine_name: name,
        quantity: 1,
        unit_price: price,
        unit_cost: 0,
        is_one_off: true,
        one_off_barcode: row.barcode,
        notes: 'بيع استثنائي بدون تسجيل مخزون',
      }]);
      setQuery('');
    }
  }

  async function offerOneOff(barcode: string) {
    if (!confirm('هذا الباركود غير موجود في الدليل ولا المخزون. البيع بدون تسجيل مخزون غير موصى به. هل تريد المتابعة؟')) return;
    const name = prompt('اسم الصنف:', '') || '';
    if (!name.trim()) return;
    const price = Number(prompt('سعر البيع:', '0') || '0');
    setCart((old) => [...old, {
      inventory_id: null,
      catalog_id: null,
      medicine_name: name.trim(),
      quantity: 1,
      unit_price: price,
      unit_cost: 0,
      is_one_off: true,
      one_off_barcode: barcode,
      notes: 'بيع استثنائي بدون تسجيل مخزون',
    }]);
    setQuery('');
  }

  async function completeSale(payment_method: 'cash' | 'card' | 'insurance') {
    try {
      const result = await window.pharmacy.sales.completeSale({
        cart_items: cart,
        discount_amount: discount,
        payment_method,
        username: 'admin',
      }) as any;
      alert(`تم حفظ الفاتورة ${result.invoice_number}\nالإجمالي: ${Number(result.final_amount).toFixed(2)}\nالإيصال: ${result.receipt_path || ''}`);
      resetInvoice();
    } catch (error) {
      alert(`تعذر إتمام البيع: ${(error as Error).message}`);
    }
  }

  return (
    <div className="pos-layout">
      <div className="search-row">
        <input
          id="pos-search"
          className="search-input"
          placeholder="🔍 بحث بالاسم أو الباركود [F2]"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFromSearch()}
        />
        <button onClick={addFromSearch}>إضافة</button>
      </div>

      <div className="invoice-title">الفاتورة الحالية: جديدة</div>
      {message && <div className="inline-message">{message}</div>}

      <DataTable
        rows={cart.map((item, index) => ({ ...item, index, subtotal: item.quantity * item.unit_price }))}
        onRowClick={(row) => setSelectedRow(row.index)}
        columns={[
          { key: 'medicine_name', label: 'الصنف' },
          { key: 'quantity', label: 'الكمية' },
          { key: 'unit_price', label: 'السعر', render: (r) => Number(r.unit_price).toFixed(2) },
          { key: 'subtotal', label: 'الإجمالي', render: (r) => Number(r.subtotal).toFixed(2) },
          { key: 'batch_number', label: 'الدفعة' },
          { key: 'expiry_date', label: 'الصلاحية' },
        ]}
      />

      <section className="totals-grid">
        <span>المجموع:</span><strong>{totals.subtotal.toFixed(2)}</strong>
        <span>الخصم [F8]:</span><input ref={discountRef} type="number" min="0" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        <span>الضريبة 14%:</span><strong>{totals.tax.toFixed(2)}</strong>
        <span className="final-label">الإجمالي:</span><strong className="final-amount">{totals.final.toFixed(2)}</strong>
      </section>

      <div className="action-row">
        <button onClick={() => completeSale('cash')}>💵 كاش</button>
        <button onClick={() => completeSale('card')}>💳 فيزا</button>
        <button onClick={() => completeSale('insurance')}>🏥 تأمين</button>
        <button className="success" onClick={() => completeSale('cash')}>🧾 إتمام وطباعة [F12]</button>
        <button className="danger" onClick={resetInvoice}>إلغاء الفاتورة</button>
      </div>
    </div>
  );
}
