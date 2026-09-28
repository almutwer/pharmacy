/** أدوات التنسيق والعرض */

export const PAYMENT_METHODS = {
  cash: 'نقداً',
  card: 'شبكة / بطاقة',
  transfer: 'تحويل بنكي',
  credit: 'آجل',
};

export const MOVEMENT_TYPES = {
  purchase: 'شراء',
  sale: 'بيع',
  sale_return: 'مرتجع بيع',
  purchase_cancel: 'إلغاء شراء',
  adjust_in: 'تسوية إدخال',
  adjust_out: 'تسوية إخراج',
  damage: 'تالف',
  expired: 'منتهي الصلاحية',
};

export const ROLE_LABELS = {
  admin: 'مدير النظام',
  manager: 'مدير الصيدلية',
  pharmacist: 'صيدلي',
  cashier: 'كاشير',
};

export const DOSAGE_FORMS = [
  'أقراص', 'كبسولات', 'شراب', 'شراب معلق', 'نقط', 'حقن', 'كريم', 'مرهم', 'جل موضعي',
  'بخاخ', 'بخاخ أنف', 'قطرة عين', 'قطرة أذن', 'تحاميل', 'أكياس', 'لصقات', 'جهاز', 'أخرى',
];

export const UNITS = ['علبة', 'شريط', 'زجاجة', 'أنبوب', 'قطعة', 'كيس', 'أمبولة', 'جهاز'];

export const fmtNum = (n, digits = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtInt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });

export const money = (n, currency = '') => `${fmtNum(n)}${currency ? ` ${currency}` : ''}`;

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(d);
  return `${fmtDate(d)} · ${date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const monthStartStr = () => `${new Date().toISOString().slice(0, 8)}01`;

export const daysAgoStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

/** حالة الصلاحية للدفعة */
export function expiryState(date) {
  if (!date) return { key: 'none', label: 'غير محدد', cls: 'bg-ink-100 text-ink-500' };
  const days = Math.ceil((new Date(date) - new Date()) / 86400000);
  if (days < 0) return { key: 'expired', label: `منتهي منذ ${Math.abs(days)} يوم`, cls: 'bg-rose-100 text-rose-700', days };
  if (days <= 30) return { key: 'critical', label: `ينتهي خلال ${days} يوم`, cls: 'bg-rose-100 text-rose-700', days };
  if (days <= 90) return { key: 'soon', label: `ينتهي خلال ${days} يوم`, cls: 'bg-amber-100 text-amber-700', days };
  return { key: 'ok', label: 'سارٍ', cls: 'bg-emerald-100 text-emerald-700', days };
}

/** حالة المخزون للصنف */
export function stockState(qty, reorder = 10) {
  const level = reorder > 0 ? reorder : 10;
  if (qty <= 0) return { label: 'نفد', cls: 'bg-rose-100 text-rose-700' };
  if (qty <= level) return { label: 'منخفض', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'متوفر', cls: 'bg-emerald-100 text-emerald-700' };
}

export const cn = (...classes) => classes.filter(Boolean).join(' ');
