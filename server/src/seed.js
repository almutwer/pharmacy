/**
 * بيانات تجريبية واقعية لنظام إدارة الصيدليات
 * التشغيل:  npm run seed        (إضافة البيانات)
 *           npm run reset       (حذف قاعدة البيانات ثم إعادة البناء)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reset = process.argv.includes('--reset');

if (reset) {
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../data');
  for (const f of ['pharmacy.db', 'pharmacy.db-wal', 'pharmacy.db-shm']) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('🗑️  تم حذف قاعدة البيانات القديمة');
}

const { default: db } = await import('./lib/db.js');
const { migrate } = await import('./lib/schema.js');
const { addBatch, recordMovement, allocateFEFO, deductBatch } = await import('./lib/stock.js');
const { nextDocNumber, round } = await import('./lib/helpers.js');
const bcrypt = (await import('bcryptjs')).default;
const { DRUG_CATALOG } = await import('./lib/drug-catalog.js');

migrate();

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ============ دليل الأدوية ============
const CATALOG = DRUG_CATALOG;

const PRESCRIPTION_CATEGORIES = ['مضادات حيوية', 'أدوية السكري', 'أدوية الضغط والقلب'];

console.log('📚 إدخال دليل الأدوية...');
let catalogCount = 0;
db.tx(() => {
  for (const [trade, generic, form, strength, category, manufacturer, country, cost, price] of CATALOG) {
    const exists = db.get('SELECT id FROM drug_catalog WHERE trade_name = ? AND IFNULL(strength,\'\') = ?', [trade, strength === '-' ? '' : strength]);
    if (exists) continue;
    db.insert('drug_catalog', {
      trade_name: trade,
      generic_name: generic === '-' ? null : generic,
      form,
      strength: strength === '-' ? null : strength,
      unit: form.includes('شراب') || form.includes('نقط') ? 'زجاجة' : 'علبة',
      category,
      manufacturer,
      country,
      barcode: String(6221000000000 + rand(1000, 999999)),
      default_purchase_price: cost,
      default_sale_price: price,
      requires_prescription: PRESCRIPTION_CATEGORIES.includes(category) ? 1 : 0,
      storage_conditions: form.includes('حقن') || trade.includes('إنسولين') ? 'يحفظ مبرداً 2-8 مئوية' : 'يحفظ في درجة حرارة أقل من 30 مئوية',
      active: 1,
    });
    catalogCount++;
  }
});
console.log(`   ✔ ${catalogCount} دواء في الدليل`);

// ============ المستخدمون ============
console.log('👥 إنشاء المستخدمين...');
const USERS = [
  ['admin', 'مدير النظام', 'admin123', 'admin'],
  ['manager', 'أحمد الصيرفي - مدير الصيدلية', 'manager123', 'manager'],
  ['pharmacist', 'د. سارة العتيبي - صيدلانية', 'pharma123', 'pharmacist'],
  ['cashier', 'خالد المطيري - كاشير', 'cash123', 'cashier'],
];
for (const [username, fullName, password, role] of USERS) {
  const exists = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (exists) continue;
  db.insert('users', {
    username, full_name: fullName, password_hash: bcrypt.hashSync(password, 10), role, active: 1,
  });
}
const users = db.all('SELECT * FROM users');
const adminId = users.find((u) => u.username === 'admin').id;
const cashierIds = users.filter((u) => ['cashier', 'pharmacist', 'manager'].includes(u.role)).map((u) => u.id);

// ============ الموردون والعملاء ============
console.log('🚚 إنشاء الموردين والعملاء...');
const SUPPLIERS = [
  ['شركة النهدي الطبية', 'م. فهد العمري', '0112345678', 'info@nahdi-med.com', 'الرياض - طريق الملك فهد'],
  ['مؤسسة الدواء الحديث', 'أ. عبدالله السالم', '0126677889', 'sales@modern-pharma.com', 'جدة - شارع التحلية'],
  ['الشركة العربية للأدوية', 'أ. منى الحربي', '0133344556', 'contact@arabpharma.com', 'الدمام - المنطقة الصناعية'],
  ['مستودع الشفاء للتجهيزات', 'م. سامي القحطاني', '0119988776', 'shifa@depot.com', 'الرياض - العليا'],
];
for (const [name, contact, phone, email, address] of SUPPLIERS) {
  if (db.get('SELECT id FROM suppliers WHERE name = ?', [name])) continue;
  db.insert('suppliers', { name, contact, phone, email, address, active: 1 });
}

const CUSTOMERS = [
  ['عميل نقدي', ''],
  ['محمد عبدالرحمن', '0551234567'],
  ['نورة السبيعي', '0509876543'],
  ['مستوصف الرعاية الأهلي', '0114455667'],
  ['عبدالعزيز الدوسري', '0533221100'],
  ['هند الشمري', '0567788990'],
];
for (const [name, phone] of CUSTOMERS) {
  if (db.get('SELECT id FROM customers WHERE name = ?', [name])) continue;
  db.insert('customers', { name, phone, active: 1 });
}
const suppliers = db.all('SELECT * FROM suppliers');
const customers = db.all('SELECT * FROM customers');

// ============ الأصناف + فواتير الشراء ============
const existingProducts = db.value('SELECT COUNT(*) FROM products');
if (!existingProducts) {
  console.log('📦 إدخال المخزون عبر فواتير شراء...');
  // ~48 دواء من الدليل يدخل للمخزون (الباقي يبقى في الدليل فقط)
  const catalogRows = db.all('SELECT * FROM drug_catalog ORDER BY id');
  const stocked = catalogRows.filter((_, i) => i % 5 !== 4); // نستثني ~20% ليبقى في الدليل فقط

  const chunks = [];
  const perInvoice = Math.ceil(stocked.length / 6);
  for (let i = 0; i < stocked.length; i += perInvoice) chunks.push(stocked.slice(i, i + perInvoice));

  chunks.forEach((chunk, idx) => {
    const supplier = suppliers[idx % suppliers.length];
    const date = dateOffset(-60 + idx * 9);
    db.tx(() => {
      const invoiceNo = nextDocNumber('purchases', 'invoice_no', 'PUR');
      const purchaseId = db.insert('purchases', {
        invoice_no: invoiceNo,
        supplier_invoice: `S-${rand(10000, 99999)}`,
        supplier_id: supplier.id,
        date,
        subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0,
        payment_method: pick(['cash', 'credit', 'transfer']),
        status: 'posted',
        notes: 'فاتورة توريد',
        user_id: adminId,
      }).lastInsertRowid;

      let subtotal = 0;
      for (const drug of chunk) {
        const productId = db.insert('products', {
          catalog_id: drug.id,
          name: drug.trade_name,
          generic_name: drug.generic_name,
          form: drug.form,
          strength: drug.strength,
          unit: drug.unit,
          category: drug.category,
          manufacturer: drug.manufacturer,
          barcode: drug.barcode,
          purchase_price: drug.default_purchase_price,
          sale_price: drug.default_sale_price,
          reorder_level: rand(5, 20),
          location: `رف ${pick(['A', 'B', 'C', 'D'])}${rand(1, 9)}`,
          requires_prescription: drug.requires_prescription,
          active: 1,
        }).lastInsertRowid;

        const qty = rand(70, 260);
        const cost = drug.default_purchase_price;
        const lineTotal = round(qty * cost);
        subtotal = round(subtotal + lineTotal);

        // تواريخ صلاحية متنوعة (بعضها قريب الانتهاء وبعضها منتهٍ)
        const expiryRoll = Math.random();
        const expiry = expiryRoll < 0.06 ? dateOffset(-rand(5, 40))
          : expiryRoll < 0.2 ? dateOffset(rand(10, 80))
            : dateOffset(rand(200, 900));

        const batchId = addBatch({
          productId, batchNo: `B${rand(1000, 9999)}`, expiryDate: expiry, qty,
          costPrice: cost, salePrice: drug.default_sale_price,
          supplierId: supplier.id, purchaseId,
        });

        db.insert('purchase_items', {
          purchase_id: purchaseId, product_id: productId, batch_id: batchId,
          batch_no: `B${rand(1000, 9999)}`, expiry_date: expiry, qty,
          bonus_qty: 0, unit_cost: cost, sale_price: drug.default_sale_price,
          discount: 0, total: lineTotal,
        });

        recordMovement({
          productId, batchId, type: 'purchase', qty, unitCost: cost,
          refType: 'purchase', refId: purchaseId, note: `فاتورة شراء ${invoiceNo}`,
          userId: adminId, date,
        });
      }

      const total = subtotal;
      db.update('purchases', {
        subtotal, total, paid: Math.random() < 0.65 ? total : round(total * 0.6),
      }, 'id = ?', [purchaseId]);
    });
  });
  console.log(`   ✔ ${db.value('SELECT COUNT(*) FROM products')} صنف في المخزون / ${db.value('SELECT COUNT(*) FROM purchases')} فاتورة شراء`);
}

// ============ فواتير البيع ============
if (!db.value('SELECT COUNT(*) FROM sales')) {
  console.log('🧾 توليد فواتير المبيعات...');
  const products = db.all('SELECT * FROM products WHERE active = 1');
  let created = 0;

  for (let dayOffset = -55; dayOffset <= 0; dayOffset++) {
    const date = dateOffset(dayOffset);
    const invoicesToday = rand(6, 16);
    for (let i = 0; i < invoicesToday; i++) {
      const itemsCount = rand(1, 5);
      const userId = pick(cashierIds);
      const customer = Math.random() < 0.35 ? pick(customers) : null;

      try {
        db.tx(() => {
          const invoiceNo = nextDocNumber('sales', 'invoice_no', 'INV');
          const saleId = db.insert('sales', {
            invoice_no: invoiceNo, customer_id: customer?.id || null, date,
            subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, cogs: 0, profit: 0,
            payment_method: pick(['cash', 'cash', 'cash', 'card', 'transfer']),
            status: 'completed', user_id: userId,
          }).lastInsertRowid;

          let subtotal = 0;
          let cogs = 0;
          const used = new Set();

          for (let j = 0; j < itemsCount; j++) {
            const product = pick(products);
            if (used.has(product.id)) continue;
            used.add(product.id);
            const available = db.value('SELECT COALESCE(SUM(qty_available),0) FROM batches WHERE product_id = ?', [product.id]) || 0;
            if (available < 1) continue;
            const qty = Math.min(available, rand(1, 4));
            const price = product.sale_price;
            let allocations;
            try {
              allocations = allocateFEFO(product.id, qty);
            } catch {
              continue;
            }
            for (const alloc of allocations) {
              const lineTotal = round(alloc.qty * price);
              subtotal = round(subtotal + lineTotal);
              cogs = round(cogs + alloc.qty * alloc.costPrice);
              db.insert('sale_items', {
                sale_id: saleId, product_id: product.id, batch_id: alloc.batchId,
                product_name: product.name, qty: alloc.qty, unit_price: price,
                unit_cost: alloc.costPrice, discount: 0, total: lineTotal,
              });
              deductBatch(alloc.batchId, alloc.qty);
              recordMovement({
                productId: product.id, batchId: alloc.batchId, type: 'sale', qty: -alloc.qty,
                unitCost: alloc.costPrice, refType: 'sale', refId: saleId,
                note: `فاتورة بيع ${invoiceNo}`, userId, date,
              });
            }
          }

          if (subtotal === 0) throw new Error('empty');
          const discount = Math.random() < 0.15 ? round(subtotal * 0.05) : 0;
          const total = round(subtotal - discount);
          db.update('sales', {
            subtotal, discount, total, paid: total, cogs, profit: round(total - cogs),
          }, 'id = ?', [saleId]);
          created++;
        });
      } catch {
        /* تجاهل الفاتورة الفارغة */
      }
    }
  }
  console.log(`   ✔ ${created} فاتورة بيع`);
}

// ============ المصروفات ============
if (!db.value('SELECT COUNT(*) FROM expenses')) {
  console.log('💸 إدخال المصروفات...');
  const EXPENSES = [
    ['إيجار', 'إيجار المحل الشهري', 3500],
    ['رواتب', 'رواتب الموظفين', 6200],
    ['كهرباء وماء', 'فاتورة الكهرباء والماء', 620],
    ['اتصالات وإنترنت', 'اشتراك الإنترنت والهاتف', 240],
    ['صيانة', 'صيانة ثلاجة حفظ الأدوية', 320],
    ['نقل وتوصيل', 'مصاريف توصيل طلبات', 180],
    ['تسويق وإعلان', 'إعلان ممول', 380],
    ['مستلزمات مكتبية', 'أكياس وفواتير طباعة', 190],
    ['ضرائب ورسوم', 'رسوم ترخيص وتراخيص', 450],
  ];
  let count = 0;
  for (let m = 1; m >= 0; m--) {
    const base = new Date();
    base.setMonth(base.getMonth() - m);
    for (const [category, description, amount] of EXPENSES) {
      const d = new Date(base.getFullYear(), base.getMonth(), rand(1, 26));
      if (d > new Date()) continue;
      db.insert('expenses', {
        date: d.toISOString().slice(0, 10),
        category,
        description,
        amount: round(amount * (0.9 + Math.random() * 0.25)),
        payment_method: pick(['cash', 'transfer']),
        user_id: adminId,
      });
      count++;
    }
  }
  console.log(`   ✔ ${count} مصروف`);
}

console.log('\n✅ تم تجهيز البيانات التجريبية بنجاح');
console.log('   بيانات الدخول:');
for (const [username, name, password, role] of USERS) {
  console.log(`   • ${username} / ${password}  (${role}) — ${name}`);
}
