-- Sample data for Local Pharmacy Management System.
-- Contains: 50 catalog medicines, 10 inventory records, 5 sales transactions.

PRAGMA foreign_keys = ON;

UPDATE app_context
SET current_username = 'sample_loader', catalog_write_enabled = 1, catalog_write_reason = 'sample_catalog_seed', updated_at = datetime('now')
WHERE id = 1;

INSERT INTO medicines_catalog (barcode, trade_name, active_ingredient, dosage_form, strength, manufacturer, official_price, category, requires_prescription) VALUES
('6221000000011', 'بانادول إكسترا', 'باراسيتامول + كافيين', 'أقراص', '500mg/65mg', 'GSK', 35.00, 'مسكن وخافض حرارة', 0),
('6221000000028', 'بنادول أدفانس', 'باراسيتامول', 'أقراص', '500mg', 'GSK', 28.00, 'مسكن وخافض حرارة', 0),
('6221000000035', 'أوجمنتين', 'أموكسيسيللين + كلافولانيك', 'أقراص', '1g', 'GSK', 155.00, 'مضاد حيوي', 1),
('6221000000042', 'أوجمنتين شراب', 'أموكسيسيللين + كلافولانيك', 'شراب معلق', '457mg/5ml', 'GSK', 120.00, 'مضاد حيوي', 1),
('6221000000059', 'أموكسيل', 'أموكسيسيللين', 'كبسولات', '500mg', 'EIPICO', 45.00, 'مضاد حيوي', 1),
('6221000000066', 'زيثروماكس', 'أزيثرومايسين', 'أقراص', '500mg', 'Pfizer', 135.00, 'مضاد حيوي', 1),
('6221000000073', 'كتافلام', 'ديكلوفيناك بوتاسيوم', 'أقراص', '50mg', 'Novartis', 48.00, 'مسكن ومضاد التهاب', 0),
('6221000000080', 'فولتارين جل', 'ديكلوفيناك', 'جل موضعي', '1%', 'Novartis', 65.00, 'مسكن موضعي', 0),
('6221000000097', 'بروفين', 'إيبوبروفين', 'أقراص', '400mg', 'Abbott', 42.00, 'مسكن ومضاد التهاب', 0),
('6221000000103', 'بروفين شراب', 'إيبوبروفين', 'شراب', '100mg/5ml', 'Abbott', 38.00, 'مسكن أطفال', 0),
('6221000000110', 'كونجستال', 'باراسيتامول + سودوافدرين + كلورفينيرامين', 'أقراص', 'تركيبة', 'SIGMA', 30.00, 'برد وزكام', 0),
('6221000000127', 'فلورست إن', 'باراسيتامول + كلورفينيرامين', 'أقراص', 'تركيبة', 'EIPICO', 26.00, 'برد وزكام', 0),
('6221000000134', 'تلفاست', 'فيكسوفينادين', 'أقراص', '120mg', 'Sanofi', 92.00, 'حساسية', 0),
('6221000000141', 'زيرتك', 'سيتريزين', 'أقراص', '10mg', 'UCB', 48.00, 'حساسية', 0),
('6221000000158', 'كلاريتين', 'لوراتادين', 'أقراص', '10mg', 'Bayer', 55.00, 'حساسية', 0),
('6221000000165', 'اوتريفين', 'زيلوميتازولين', 'نقط أنف', '0.1%', 'GSK', 32.00, 'أنف وأذن', 0),
('6221000000172', 'رينو برو', 'زيلوميتازولين', 'بخاخ أنف', '0.05%', 'Local Pharma', 29.00, 'أنف وأذن', 0),
('6221000000189', 'فنتولين بخاخ', 'سالبوتامول', 'بخاخ', '100mcg', 'GSK', 85.00, 'صدر وربو', 1),
('6221000000196', 'سيمبيكورت', 'بوديزونيد + فورموتيرول', 'بخاخ', '160/4.5mcg', 'AstraZeneca', 360.00, 'صدر وربو', 1),
('6221000000202', 'أوميز', 'أوميبرازول', 'كبسولات', '20mg', 'Dr. Reddy', 50.00, 'معدة وحموضة', 0),
('6221000000219', 'نيكسيوم', 'إيزوميبرازول', 'أقراص', '40mg', 'AstraZeneca', 145.00, 'معدة وحموضة', 0),
('6221000000226', 'جافيسكون', 'ألجينات الصوديوم', 'شراب', '150ml', 'Reckitt', 78.00, 'معدة وحموضة', 0),
('6221000000233', 'موتيليوم', 'دومبيريدون', 'أقراص', '10mg', 'Janssen', 40.00, 'قيء وغثيان', 0),
('6221000000240', 'فلاجيل', 'ميترونيدازول', 'أقراص', '500mg', 'Sanofi', 36.00, 'مضاد طفيليات', 1),
('6221000000257', 'انتينال', 'نيفوروكسازيد', 'كبسولات', '200mg', 'EIPICO', 46.00, 'إسهال ومطهر معوي', 0),
('6221000000264', 'ستربسلز عسل وليمون', 'مطهر حلق', 'أقراص استحلاب', 'علبة', 'Reckitt', 44.00, 'حلق', 0),
('6221000000271', 'بيتادين غرغرة', 'بوفيدون أيودين', 'غرغرة', '1%', 'Mundipharma', 52.00, 'مطهرات', 0),
('6221000000288', 'بيتادين محلول', 'بوفيدون أيودين', 'محلول موضعي', '10%', 'Mundipharma', 60.00, 'مطهرات', 0),
('6221000000295', 'ميبو مرهم', 'بيتا سيتوستيرول', 'مرهم', '30g', 'Julphar', 72.00, 'حروق وجروح', 0),
('6221000000301', 'فيوسيدين كريم', 'حمض الفيوسيديك', 'كريم', '2%', 'LEO Pharma', 88.00, 'جلدية ومضاد حيوي', 1),
('6221000000318', 'دكتارين جل فم', 'ميكونازول', 'جل فموي', '2%', 'Janssen', 70.00, 'فطريات', 0),
('6221000000325', 'كانستين كريم', 'كلوتريمازول', 'كريم', '1%', 'Bayer', 62.00, 'فطريات', 0),
('6221000000332', 'لانتوس', 'إنسولين جلارجين', 'حقن', '100IU/ml', 'Sanofi', 420.00, 'سكري', 1),
('6221000000349', 'نوفورابيد', 'إنسولين أسبارت', 'حقن', '100IU/ml', 'Novo Nordisk', 390.00, 'سكري', 1),
('6221000000356', 'جلوكوفاج', 'ميتفورمين', 'أقراص', '500mg', 'Merck', 52.00, 'سكري', 1),
('6221000000363', 'جالفس مت', 'فيلداجليبتين + ميتفورمين', 'أقراص', '50/1000mg', 'Novartis', 185.00, 'سكري', 1),
('6221000000370', 'كونكور', 'بيسوبرولول', 'أقراص', '5mg', 'Merck', 68.00, 'ضغط وقلب', 1),
('6221000000387', 'نورفاسك', 'أملوديبين', 'أقراص', '5mg', 'Pfizer', 78.00, 'ضغط وقلب', 1),
('6221000000394', 'كابوتين', 'كابتوبريل', 'أقراص', '25mg', 'Bristol Myers', 34.00, 'ضغط وقلب', 1),
('6221000000400', 'ليبيتور', 'أتورفاستاتين', 'أقراص', '20mg', 'Pfizer', 125.00, 'كوليسترول', 1),
('6221000000417', 'كريستور', 'روزوفاستاتين', 'أقراص', '10mg', 'AstraZeneca', 150.00, 'كوليسترول', 1),
('6221000000424', 'أسبرين بروتكت', 'أسبرين', 'أقراص مغلفة', '100mg', 'Bayer', 45.00, 'سيولة وقلب', 1),
('6221000000431', 'بلافيكس', 'كلوبيدوجريل', 'أقراص', '75mg', 'Sanofi', 210.00, 'سيولة وقلب', 1),
('6221000000448', 'كالسي مات', 'كالسيوم + فيتامين د', 'أقراص', '600mg/400IU', 'Local Pharma', 58.00, 'فيتامينات ومكملات', 0),
('6221000000455', 'فيتامين سي فوار', 'أسكوربيك أسيد', 'أقراص فوارة', '1000mg', 'Local Pharma', 42.00, 'فيتامينات ومكملات', 0),
('6221000000462', 'سنتروم', 'متعدد الفيتامينات', 'أقراص', '30 قرص', 'Pfizer', 160.00, 'فيتامينات ومكملات', 0),
('6221000000479', 'فيروجلوبين', 'حديد + فيتامينات', 'كبسولات', 'علبة', 'Vitabiotics', 95.00, 'أنيميا ومكملات', 0),
('6221000000486', 'أوتوكالم', 'مضاد التهاب للأذن', 'نقط أذن', '10ml', 'Local Pharma', 36.00, 'أنف وأذن', 1),
('6221000000493', 'تيراميسين مرهم عين', 'أوكسي تتراسيكلين', 'مرهم عين', '5g', 'Pfizer', 54.00, 'عيون', 1),
('6221000000509', 'ريفريش تيرز', 'كاربوكسي ميثيل سيليلوز', 'قطرة عين', '15ml', 'Allergan', 82.00, 'عيون', 0);

UPDATE app_context
SET catalog_write_enabled = 0, catalog_write_reason = NULL, updated_at = datetime('now')
WHERE id = 1;

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-PAN-2701', 45, 10, 22.00, 35.00, '2028-01-31', 'رف 1', 'شركة النيل للتوزيع', '2026-09-01', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000011';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000011';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-AUG-2704', 12, 5, 112.00, 155.00, '2027-04-30', 'رف 2', 'مستودع الشفاء', '2026-09-03', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000035';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000035';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-BRU-2805', 30, 8, 30.00, 42.00, '2028-05-31', 'رف 1', 'شركة النيل للتوزيع', '2026-09-04', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000097';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000097';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-OTR-2611', 20, 5, 21.00, 32.00, '2026-11-30', 'رف 4', 'مستودع الشفاء', '2026-09-06', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000165';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000165';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-NEX-2802', 10, 4, 105.00, 145.00, '2028-02-28', 'رف 3', 'توزيع الخرطوم الطبي', '2026-09-08', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000219';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000219';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-FLA-2708', 18, 5, 24.00, 36.00, '2027-08-31', 'رف 5', 'مستودع الشفاء', '2026-09-10', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000240';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000240';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-MEB-2712', 8, 3, 48.00, 72.00, '2027-12-31', 'درج الجلدية', 'شركة النيل للتوزيع', '2026-09-12', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000295';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000295';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-GLU-2803', 25, 6, 36.00, 52.00, '2028-03-31', 'رف الأمراض المزمنة', 'توزيع الخرطوم الطبي', '2026-09-14', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000356';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000356';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-CON-2706', 16, 5, 46.00, 68.00, '2027-06-30', 'رف الأمراض المزمنة', 'توزيع الخرطوم الطبي', '2026-09-15', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000370';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000370';

INSERT INTO pharmacy_inventory (catalog_id, batch_number, quantity, min_stock_alert, purchase_price, selling_price, expiry_date, storage_location, supplier_name, date_received, created_by)
SELECT id, 'B-CEN-2809', 14, 4, 115.00, 160.00, '2028-09-30', 'رف الفيتامينات', 'شركة النيل للتوزيع', '2026-09-16', 'sample_loader' FROM medicines_catalog WHERE barcode = '6221000000462';
INSERT INTO stock_movements (inventory_id, catalog_id, movement_type, quantity_change, quantity_before, quantity_after, reference_number, reason, created_by)
SELECT pi.id, pi.catalog_id, 'receive', pi.quantity, 0, pi.quantity, 'SAMPLE-STOCK', 'Sample opening balance', 'sample_loader' FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id = pi.catalog_id WHERE mc.barcode = '6221000000462';

-- Five sample sale transactions using the production tables/triggers.
INSERT INTO invoice_sequences (invoice_year, last_number) VALUES (2026, 5)
ON CONFLICT(invoice_year) DO UPDATE SET last_number = excluded.last_number;

INSERT INTO sales (invoice_number, invoice_year, invoice_sequence, sale_date, total_amount, discount_amount, tax_amount, final_amount, payment_method, customer_name, created_by)
VALUES ('INV-2026-000001', 2026, 1, '2026-09-20 10:15:00', 70.00, 0.00, 9.80, 79.80, 'cash', 'عميل نقدي', 'sample_loader');
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000001'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 2, pi.selling_price, pi.purchase_price, 2*pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000011';

INSERT INTO sales (invoice_number, invoice_year, invoice_sequence, sale_date, total_amount, discount_amount, tax_amount, final_amount, payment_method, customer_name, created_by)
VALUES ('INV-2026-000002', 2026, 2, '2026-09-21 12:40:00', 187.00, 7.00, 25.20, 205.20, 'card', 'أحمد محمد', 'sample_loader');
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000002'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 1, pi.selling_price, pi.purchase_price, pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000035';
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000002'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 1, pi.selling_price, pi.purchase_price, pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000165';

INSERT INTO sales (invoice_number, invoice_year, invoice_sequence, sale_date, total_amount, discount_amount, tax_amount, final_amount, payment_method, customer_name, created_by)
VALUES ('INV-2026-000003', 2026, 3, '2026-09-22 18:05:00', 145.00, 0.00, 20.30, 165.30, 'cash', 'عميل نقدي', 'sample_loader');
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000003'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 1, pi.selling_price, pi.purchase_price, pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000219';

INSERT INTO sales (invoice_number, invoice_year, invoice_sequence, sale_date, total_amount, discount_amount, tax_amount, final_amount, payment_method, customer_name, created_by)
VALUES ('INV-2026-000004', 2026, 4, '2026-09-23 09:30:00', 104.00, 0.00, 14.56, 118.56, 'insurance', 'شركة التأمين - عميل', 'sample_loader');
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000004'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 2, pi.selling_price, pi.purchase_price, 2*pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000356';

INSERT INTO sales (invoice_number, invoice_year, invoice_sequence, sale_date, total_amount, discount_amount, tax_amount, final_amount, payment_method, customer_name, created_by)
VALUES ('INV-2026-000005', 2026, 5, '2026-09-24 20:10:00', 232.00, 12.00, 30.80, 250.80, 'cash', 'عميل نقدي', 'sample_loader');
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000005'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 1, pi.selling_price, pi.purchase_price, pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000462';
INSERT INTO sale_items (sale_id, inventory_id, catalog_id, medicine_name, quantity_sold, unit_price, unit_cost, subtotal, batch_number, expiry_date)
SELECT (SELECT id FROM sales WHERE invoice_number='INV-2026-000005'), pi.id, pi.catalog_id, mc.trade_name || ' ' || COALESCE(mc.strength,''), 1, pi.selling_price, pi.purchase_price, pi.selling_price, pi.batch_number, pi.expiry_date
FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000295';

UPDATE app_context
SET current_username = 'system', catalog_write_enabled = 0, catalog_write_reason = NULL, updated_at = datetime('now')
WHERE id = 1;
