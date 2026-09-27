export type PaymentMethod = 'cash' | 'card' | 'insurance' | 'mixed';

export interface CatalogMedicine {
  id: number;
  barcode: string;
  trade_name: string;
  active_ingredient?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
  official_price?: number | null;
  category?: string | null;
  requires_prescription: number;
  is_active: number;
}

export interface InventoryRecord {
  inventory_id: number;
  catalog_id: number;
  barcode: string;
  trade_name: string;
  active_ingredient?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
  batch_number?: string | null;
  quantity: number;
  min_stock_alert: number;
  purchase_price: number;
  selling_price: number;
  expiry_date: string;
  storage_location?: string | null;
  supplier_name?: string | null;
  days_to_expiry: number;
  stock_status: string;
}

export interface AddStockInput {
  catalog_id: number;
  quantity: number;
  min_stock_alert?: number;
  purchase_price: number;
  selling_price: number;
  expiry_date: string;
  batch_number?: string | null;
  storage_location?: string | null;
  supplier_name?: string | null;
  date_received?: string | null;
  username?: string;
  movement_type?: 'receive' | 'quick_add';
  reference_number?: string | null;
}

export interface CartItem {
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

export interface CompleteSaleInput {
  cart_items: CartItem[];
  discount_amount?: number;
  tax_rate?: number;
  payment_method: PaymentMethod;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  username?: string;
}

export interface SaleResult {
  sale_id: number;
  invoice_number: string;
  final_amount: number;
  receipt_path?: string | null;
}

export interface FilePreview {
  filePath: string;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface CatalogImportResult {
  import_job_id: number;
  total_rows: number;
  valid_rows: number;
  inserted_rows: number;
  duplicate_rows: number;
  missing_required_rows: number;
  errors: Array<{ row_number: number; error_type: string; error_message: string }>;
}

export interface BulkInventoryResult {
  import_job_id: number;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  inserted_rows: number;
  errors: string[];
}
