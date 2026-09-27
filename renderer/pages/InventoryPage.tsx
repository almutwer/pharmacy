import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';

interface CatalogRow {
  id: number;
  barcode: string;
  trade_name: string;
  strength?: string;
  official_price?: number;
}

export default function InventoryPage() {
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState<CatalogRow | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [expiryDate, setExpiryDate] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setRows(await window.pharmacy.inventory.list(500) as any[]);
  }

  async function lookup() {
    if (!barcode.trim()) return;
    const result = await window.pharmacy.inventory.findCatalogByBarcode(barcode.trim()) as CatalogRow | null;
    if (!result) {
      alert('الباركود غير موجود في دليل الأدوية. استورد دليل الأدوية أولاً.');
      setCatalog(null);
      return;
    }
    setCatalog(result);
    setSellingPrice(Number(result.official_price || 0));
  }

  async function saveStock() {
    if (!catalog) {
      alert('امسح باركود صحيح أولاً');
      return;
    }
    try {
      const result = await window.pharmacy.inventory.addStock({
        catalog_id: Number(catalog.id),
        quantity,
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
        expiry_date: expiryDate,
        batch_number: batchNumber || null,
        supplier_name: supplierName || null,
        storage_location: storageLocation || null,
        username: 'admin',
      }) as any;
      alert(`تمت إضافة المخزون بنجاح. رقم السجل: ${result.inventory_id}${result.warnings?.length ? '\n' + result.warnings.join('\n') : ''}`);
      clearForm();
      refresh();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function bulkImport() {
    const preview = await window.pharmacy.inventory.chooseSupplierFile() as any;
    if (!preview) return;
    const mapping = guessInventoryMapping(preview.headers);
    const supplier = prompt('اسم المورد:', '') || '';
    const invoice = prompt('رقم فاتورة المورد:', '') || '';
    const confirmText = `إجمالي الصفوف: ${preview.totalRows}\nسيتم استخدام المطابقة التلقائية:\n${Object.entries(mapping).map(([k, v]) => `${k} -> ${v}`).join('\n')}\nهل تريد المتابعة؟`;
    if (!confirm(confirmText)) return;
    try {
      const result = await window.pharmacy.inventory.importSupplierInvoice(preview.filePath, mapping, supplier, invoice, 'admin') as any;
      alert(`نتيجة الاستيراد\nإجمالي الصفوف: ${result.total_rows}\nمطابقة: ${result.matched_rows}\nغير موجودة في الدليل: ${result.unmatched_rows}\nتمت إضافتها: ${result.inserted_rows}\nأخطاء: ${result.errors.length}`);
      refresh();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  function clearForm() {
    setBarcode(''); setCatalog(null); setQuantity(1); setPurchasePrice(0); setSellingPrice(0);
    setExpiryDate(''); setBatchNumber(''); setSupplierName(''); setStorageLocation('');
  }

  return (
    <div className="inventory-layout">
      <section className="form-card">
        <h2>إضافة مخزون جديد - ماسح الباركود</h2>
        <div className="form-grid">
          <label>الباركود</label>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="امسح الباركود ثم Enter" />
          <label>بيانات الدواء</label>
          <div className="readonly-field">{catalog ? `${catalog.trade_name} ${catalog.strength || ''} - السعر الرسمي ${catalog.official_price || 0}` : 'لم يتم اختيار دواء'}</div>
          <label>الكمية</label><input type="number" min="0" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          <label>سعر الشراء</label><input type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(Number(e.target.value))} />
          <label>سعر البيع</label><input type="number" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(Number(e.target.value))} />
          <label>تاريخ الانتهاء</label><input value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} placeholder="YYYY-MM-DD" />
          <label>رقم الدفعة</label><input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          <label>المورد</label><input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <label>مكان التخزين</label><input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} />
        </div>
        <div className="action-row">
          <button onClick={lookup}>بحث الباركود</button>
          <button className="success" onClick={saveStock}>حفظ المخزون</button>
          <button onClick={bulkImport}>استيراد فاتورة مورد Excel/CSV</button>
        </div>
      </section>

      <DataTable
        rows={rows}
        columns={[
          { key: 'trade_name', label: 'الدواء' },
          { key: 'barcode', label: 'الباركود' },
          { key: 'batch_number', label: 'الدفعة' },
          { key: 'quantity', label: 'الكمية' },
          { key: 'selling_price', label: 'سعر البيع', render: (r) => Number(r.selling_price).toFixed(2) },
          { key: 'expiry_date', label: 'الصلاحية' },
          { key: 'stock_status', label: 'الحالة', render: (r) => stockStatusArabic(r.stock_status), className: (r) => `status-${r.stock_status}` },
          { key: 'supplier_name', label: 'المورد' },
        ]}
      />
    </div>
  );
}

function stockStatusArabic(status: string): string {
  return {
    in_stock: 'متوفر', low_stock: 'كمية منخفضة', out_of_stock: 'نفد المخزون', expired: 'منتهي', expiring_soon: 'قرب الانتهاء',
  }[status] || status;
}

function guessInventoryMapping(headers: string[]): Record<string, string> {
  const patterns: Record<string, string[]> = {
    barcode: ['barcode', 'باركود', 'الكود'],
    quantity: ['quantity', 'qty', 'كمية', 'الكمية'],
    purchase_price: ['purchase', 'cost', 'شراء', 'التكلفة'],
    selling_price: ['selling', 'sale', 'بيع', 'السعر'],
    expiry_date: ['expiry', 'expire', 'انتهاء', 'الصلاحية'],
    batch_number: ['batch', 'دفعة', 'التشغيلة'],
  };
  const mapping: Record<string, string> = {};
  for (const [field, fieldPatterns] of Object.entries(patterns)) {
    const found = headers.find((header) => fieldPatterns.some((pattern) => header.toLowerCase().includes(pattern.toLowerCase())));
    if (found) mapping[field] = found;
  }
  for (const required of ['barcode', 'quantity', 'purchase_price', 'expiry_date']) {
    if (!mapping[required]) throw new Error(`تعذر مطابقة العمود المطلوب تلقائياً: ${required}`);
  }
  return mapping;
}
