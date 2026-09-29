/**
 * تعريف أعمدة ملفات Excel للتصدير والاستيراد
 * readOnly  : يُصدَّر فقط ويُتجاهل عند الاستيراد
 * importOnly: يظهر في القالب فقط (لا يُصدَّر مع البيانات)
 */

export const CATALOG_COLUMNS = [
  { key: 'id', header: 'المعرف', width: 10, type: 'int', hint: 'اتركه فارغاً للأدوية الجديدة. وجود رقم يعني تحديث دواء موجود.' },
  { key: 'trade_name', header: 'الاسم التجاري', width: 26, required: true, aliases: ['الاسم', 'اسم الدواء', 'الصنف'], hint: 'إلزامي — اسم الدواء كما يُعرف تجارياً.' },
  { key: 'generic_name', header: 'الاسم العلمي', width: 24, aliases: ['المادة الفعالة', 'المادة الفعّالة'], hint: 'المادة الفعالة.' },
  { key: 'form', header: 'الشكل الصيدلاني', width: 16, aliases: ['الشكل'], hint: 'أقراص، شراب، كبسولات، حقن…' },
  { key: 'strength', header: 'التركيز', width: 14, aliases: ['الجرعة'], hint: 'مثال: 500 مجم' },
  { key: 'unit', header: 'الوحدة', width: 12, hint: 'علبة، زجاجة، شريط…' },
  { key: 'category', header: 'التصنيف', width: 22, aliases: ['الفئة'], hint: 'التصنيف الدوائي.' },
  { key: 'manufacturer', header: 'الشركة المصنعة', width: 20, aliases: ['الشركة', 'المصنع'], hint: 'اسم الشركة المنتجة.' },
  { key: 'country', header: 'بلد المنشأ', width: 16, aliases: ['البلد'], hint: 'بلد التصنيع.' },
  { key: 'barcode', header: 'الباركود', width: 18, type: 'text', hint: 'يجب ألا يتكرر بين الأدوية.' },
  { key: 'atc_code', header: 'كود ATC', width: 12, hint: 'التصنيف الدوائي العالمي (اختياري).' },
  { key: 'default_purchase_price', header: 'سعر الشراء', width: 13, type: 'money', aliases: ['التكلفة', 'سعر التكلفة'], hint: 'السعر الافتراضي عند الشراء.' },
  { key: 'default_sale_price', header: 'سعر البيع', width: 13, type: 'money', aliases: ['السعر'], hint: 'السعر الافتراضي عند البيع.' },
  { key: 'requires_prescription', header: 'يحتاج وصفة', width: 12, type: 'bool', hint: 'نعم / لا' },
  { key: 'storage_conditions', header: 'ظروف التخزين', width: 20, hint: 'مثال: يحفظ في الثلاجة.' },
  { key: 'notes', header: 'ملاحظات', width: 24 },
  { key: 'active', header: 'الحالة', width: 10, type: 'bool', hint: 'نعم = نشط، لا = موقوف' },
  { key: 'in_inventory', header: 'مضاف للمخزون', width: 13, type: 'bool', readOnly: true, hint: 'حقل معلوماتي فقط — يُتجاهل عند الاستيراد.' },
];

export const PRODUCT_COLUMNS = [
  { key: 'id', header: 'المعرف', width: 10, type: 'int', hint: 'اتركه فارغاً للأصناف الجديدة. وجود رقم يعني تحديث صنف موجود.' },
  { key: 'name', header: 'اسم الصنف', width: 26, required: true, aliases: ['الاسم', 'الصنف', 'الاسم التجاري'], hint: 'إلزامي.' },
  { key: 'generic_name', header: 'الاسم العلمي', width: 22, aliases: ['المادة الفعالة'] },
  { key: 'form', header: 'الشكل الصيدلاني', width: 15, aliases: ['الشكل'] },
  { key: 'strength', header: 'التركيز', width: 13 },
  { key: 'unit', header: 'الوحدة', width: 11 },
  { key: 'category', header: 'التصنيف', width: 20, aliases: ['الفئة'] },
  { key: 'manufacturer', header: 'الشركة المصنعة', width: 18, aliases: ['الشركة'] },
  { key: 'barcode', header: 'الباركود', width: 17, type: 'text', hint: 'يجب ألا يتكرر بين الأصناف.' },
  { key: 'purchase_price', header: 'سعر الشراء', width: 13, type: 'money', aliases: ['التكلفة'], hint: 'تكلفة الوحدة.' },
  { key: 'sale_price', header: 'سعر البيع', width: 13, type: 'money', aliases: ['السعر'], hint: 'سعر بيع الوحدة.' },
  { key: 'reorder_level', header: 'حد إعادة الطلب', width: 14, type: 'int', aliases: ['حد النقص', 'الحد الأدنى'], hint: 'ينبّهك النظام عند نزول الرصيد تحته.' },
  { key: 'location', header: 'موقع التخزين', width: 14, aliases: ['الرف', 'الموقع'] },
  { key: 'requires_prescription', header: 'يحتاج وصفة', width: 12, type: 'bool', hint: 'نعم / لا' },
  { key: 'active', header: 'الحالة', width: 10, type: 'bool', hint: 'نعم = نشط، لا = موقوف' },
  { key: 'notes', header: 'ملاحظات', width: 22 },

  // أعمدة معلوماتية عند التصدير
  { key: 'stock_qty', header: 'الكمية المتوفرة', width: 14, type: 'number', readOnly: true, hint: 'رصيد فعلي محسوب من الدفعات — يُتجاهل عند الاستيراد (استخدم التسويات المخزنية لتعديله).' },
  { key: 'stock_cost_value', header: 'قيمة التكلفة', width: 14, type: 'money', readOnly: true, hint: 'حقل معلوماتي فقط.' },
  { key: 'nearest_expiry', header: 'أقرب صلاحية', width: 14, type: 'date', readOnly: true, hint: 'حقل معلوماتي فقط.' },
  { key: 'catalog_name', header: 'مرتبط بالدليل', width: 18, readOnly: true, hint: 'اسم الدواء المرتبط في دليل الأدوية.' },

  // أعمدة تُستخدم عند الاستيراد فقط
  { key: 'opening_qty', header: 'رصيد افتتاحي', width: 13, type: 'number', importOnly: true, hint: 'يُسجَّل كدفعة افتتاحية للأصناف الجديدة فقط (يُتجاهل عند تحديث صنف موجود).' },
  { key: 'opening_batch_no', header: 'رقم الدفعة', width: 13, importOnly: true, hint: 'رقم دفعة الرصيد الافتتاحي (اختياري).' },
  { key: 'opening_expiry', header: 'تاريخ الصلاحية', width: 14, type: 'date', importOnly: true, hint: 'تاريخ صلاحية الرصيد الافتتاحي بصيغة YYYY-MM-DD.' },
];

/** أعمدة التصدير (كل شيء ما عدا خانات الاستيراد فقط) */
export const exportColumns = (cols) => cols.filter((c) => !c.importOnly);

/** أعمدة القالب (كل شيء ما عدا الحقول المحسوبة) */
export const templateColumns = (cols) => cols.filter((c) => !c.readOnly);

/** الأعمدة التي يمكن كتابتها فعلياً في قاعدة البيانات */
export const writableColumns = (cols) => cols.filter((c) => !c.readOnly && c.key !== 'id');
