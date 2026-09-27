import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const catalogFields = [
  'barcode', 'trade_name', 'active_ingredient', 'dosage_form', 'strength',
  'manufacturer', 'official_price', 'category', 'requires_prescription', 'is_active',
];

interface Props { onBackupCreated?: () => void; }

export default function SettingsPage({ onBackupCreated }: Props) {
  const [tab, setTab] = useState<'catalog' | 'backup' | 'about'>('catalog');

  return (
    <div className="settings-layout">
      <div className="settings-tabs">
        <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>استيراد دليل الأدوية</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>النسخ الاحتياطي</button>
        <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>معلومات النظام</button>
      </div>
      {tab === 'catalog' && <CatalogImportPanel />}
      {tab === 'backup' && <BackupPanel onBackupCreated={onBackupCreated} />}
      {tab === 'about' && <AboutPanel />}
    </div>
  );
}

function CatalogImportPanel() {
  const [preview, setPreview] = useState<any | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  async function chooseFile() {
    const result = await window.pharmacy.catalog.chooseFile() as any;
    if (!result) return;
    setPreview(result);
    const guessed: Record<string, string> = {};
    const patterns: Record<string, string[]> = {
      barcode: ['barcode', 'باركود', 'الكود'],
      trade_name: ['trade', 'name', 'اسم', 'الاسم التجاري'],
      active_ingredient: ['active', 'ingredient', 'مادة', 'المادة الفعالة'],
      official_price: ['price', 'سعر', 'السعر الرسمي'],
      strength: ['strength', 'تركيز'],
      dosage_form: ['form', 'شكل'],
      manufacturer: ['manufacturer', 'company', 'شركة'],
      category: ['category', 'تصنيف'],
    };
    for (const [field, fieldPatterns] of Object.entries(patterns)) {
      const found = result.headers.find((header: string) => fieldPatterns.some((pattern) => header.toLowerCase().includes(pattern.toLowerCase())));
      if (found) guessed[field] = found;
    }
    setMapping(guessed);
  }

  async function importCatalog() {
    if (!preview) return;
    if (!mapping.barcode || !mapping.trade_name) {
      alert('يجب مطابقة الباركود والاسم التجاري');
      return;
    }
    try {
      const result = await window.pharmacy.catalog.importFile(preview.filePath, mapping, 'admin') as any;
      alert(`تم الاستيراد\nتم إدخال: ${result.inserted_rows}\nإجمالي الصفوف: ${result.total_rows}\nالمكرر/المرفوض: ${result.duplicate_rows}\nناقص بيانات: ${result.missing_required_rows}`);
    } catch (error) {
      alert((error as Error).message);
    }
  }

  const previewColumns = useMemo(() => (preview?.headers || []).map((h: string) => ({ key: h, label: h })), [preview]);

  return (
    <section className="form-card">
      <h2>استيراد دليل الأدوية العام</h2>
      <p className="note">هذا الاستيراد يملأ جدول medicines_catalog فقط، ولا يضيف أي كمية للمخزون.</p>
      <button onClick={chooseFile}>اختيار ملف Excel / CSV / JSON</button>
      {preview && (
        <>
          <div className="inline-message">الملف: {preview.fileName} - إجمالي الصفوف: {preview.totalRows}</div>
          <DataTable rows={preview.rows} columns={previewColumns} />
          <h3>مطابقة الأعمدة</h3>
          <div className="mapping-grid">
            {catalogFields.map((field) => (
              <label key={field}>
                <span>{catalogFieldArabic(field)}</span>
                <select value={mapping[field] || ''} onChange={(e) => setMapping((old) => ({ ...old, [field]: e.target.value }))}>
                  <option value="">-- بدون --</option>
                  {preview.headers.map((header: string) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="success" onClick={importCatalog}>تأكيد الاستيراد</button>
        </>
      )}
    </section>
  );
}

function BackupPanel({ onBackupCreated }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setRows(await window.pharmacy.backup.list() as any[]);
  }
  async function createBackup() {
    const path = await window.pharmacy.backup.create() as string;
    alert(`تم إنشاء النسخة الاحتياطية:\n${path}`);
    onBackupCreated?.();
    refresh();
  }
  async function copyUsb() {
    const path = await window.pharmacy.backup.chooseUsbAndCopy() as string | null;
    if (path) alert(`تم نسخ النسخة إلى:\n${path}`);
    refresh();
  }

  return (
    <section className="form-card">
      <h2>النسخ الاحتياطي</h2>
      <div className="action-row">
        <button className="success" onClick={createBackup}>إنشاء نسخة احتياطية الآن</button>
        <button onClick={copyUsb}>نسخ إلى USB</button>
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: 'backup_date', label: 'التاريخ' },
          { key: 'backup_type', label: 'النوع' },
          { key: 'backup_path', label: 'المسار' },
          { key: 'database_size_bytes', label: 'الحجم', render: (r) => `${Math.round(Number(r.database_size_bytes || 0) / 1024)} KB` },
        ]}
      />
    </section>
  );
}

function AboutPanel() {
  const [info, setInfo] = useState<any>({});
  useEffect(() => { window.pharmacy.app.getInfo().then(setInfo); }, []);
  async function sample() {
    if (!confirm('سيتم تحميل بيانات تجريبية. لا تستخدم هذا في قاعدة بيانات الصيدلية الحقيقية. هل تريد المتابعة؟')) return;
    await window.pharmacy.app.loadSampleData();
    alert('تم تحميل البيانات التجريبية');
  }
  return (
    <section className="form-card">
      <h2>معلومات النظام</h2>
      <p><strong>مسار قاعدة البيانات:</strong> {info.dbPath}</p>
      <p><strong>مجلد النسخ الاحتياطية:</strong> {info.backupDir}</p>
      <p><strong>مجلد الإيصالات:</strong> {info.receiptDir}</p>
      <button onClick={sample}>تحميل بيانات تجريبية للاختبار</button>
    </section>
  );
}

function catalogFieldArabic(field: string): string {
  return {
    barcode: 'الباركود', trade_name: 'الاسم التجاري', active_ingredient: 'المادة الفعالة', dosage_form: 'الشكل الدوائي', strength: 'التركيز', manufacturer: 'الشركة المصنعة', official_price: 'السعر الرسمي', category: 'التصنيف', requires_prescription: 'يحتاج روشتة؟', is_active: 'نشط؟',
  }[field] || field;
}
