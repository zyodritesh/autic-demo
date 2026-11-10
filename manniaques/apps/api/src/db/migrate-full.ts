import { pool, query } from './pool.js';

/** Full PRD schema additions (idempotent). Run after migrate.ts */
const sql = `
-- Broaden roles
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';
UPDATE memberships SET roles = ARRAY[role] WHERE roles = '{}' OR roles IS NULL;
ALTER TABLE memberships ALTER COLUMN role TYPE TEXT;

ALTER TABLE factories ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS state_code TEXT DEFAULT '24';
ALTER TABLE factories ADD COLUMN IF NOT EXISTS admin_mobile TEXT;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(6,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 30;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS trashed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  gstin TEXT,
  payment_terms_days INT DEFAULT 30,
  notes TEXT,
  is_karigar BOOLEAN NOT NULL DEFAULT false,
  trashed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_factory_client_uidx ON vendors (factory_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendors_factory_name_idx ON vendors (factory_id, lower(name));

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  mobile TEXT NOT NULL,
  name TEXT,
  roles TEXT[] NOT NULL DEFAULT '{sales}',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited',
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID REFERENCES users(id),
  accepted_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('raw', 'finished')),
  name TEXT NOT NULL,
  UNIQUE (factory_id, item_type, name)
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('raw', 'finished')),
  category_id UUID REFERENCES categories(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  colour TEXT,
  size_label TEXT,
  stock_unit TEXT NOT NULL DEFAULT 'piece',
  starting_unit_cost NUMERIC(12,2) DEFAULT 0,
  last_received_cost NUMERIC(12,2),
  hsn TEXT,
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved NUMERIC(14,3) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12,4) DEFAULT 0,
  style_id UUID,
  catalogue_item_id UUID REFERENCES catalogue_items(id),
  qr_payload TEXT,
  trashed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, code)
);

CREATE TABLE IF NOT EXISTS styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  design_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  photo_url TEXT,
  photo_thumb_url TEXT,
  stitching_cost NUMERIC(12,2) DEFAULT 0,
  finishing_cost NUMERIC(12,2) DEFAULT 0,
  packing_cost NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  trashed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, design_code)
);

ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS style_id UUID REFERENCES styles(id);
ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS estimated_unit_cost NUMERIC(12,2);
ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS hsn TEXT DEFAULT '6204';
ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS trashed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS style_bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  style_id UUID NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty_per_piece NUMERIC(14,4) NOT NULL,
  size_override TEXT,
  colour_override TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID NOT NULL,
  po_ref TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  vendor_snapshot JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  sync_status TEXT NOT NULL DEFAULT 'local',
  photo_url TEXT,
  notes TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  trashed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, client_id),
  UNIQUE (factory_id, po_ref)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id),
  item_id UUID REFERENCES items(id),
  item_code TEXT,
  item_name TEXT NOT NULL,
  stock_unit TEXT NOT NULL DEFAULT 'piece',
  qty NUMERIC(14,3) NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  line_amount NUMERIC(14,2) NOT NULL,
  qty_received NUMERIC(14,3) NOT NULL DEFAULT 0,
  uncertain BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  po_id UUID NOT NULL REFERENCES purchase_orders(id),
  receipt_ref TEXT NOT NULL,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, receipt_ref)
);

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES purchase_order_lines(id),
  item_id UUID REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  receipt_id UUID REFERENCES purchase_receipts(id),
  vendor_id UUID REFERENCES vendors(id),
  return_ref TEXT NOT NULL,
  reason TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',
  match_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, return_ref)
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  qty NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_amount NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS job_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID,
  jw_ref TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  vendor_snapshot JSONB NOT NULL DEFAULT '{}',
  style_id UUID REFERENCES styles(id),
  catalogue_item_id UUID REFERENCES catalogue_items(id),
  process TEXT NOT NULL DEFAULT 'stitching',
  target_qty INT NOT NULL DEFAULT 0,
  rate_basis TEXT NOT NULL DEFAULT 'per_piece',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  photo_url TEXT,
  notes TEXT,
  accepted_qty INT NOT NULL DEFAULT 0,
  rework_qty INT NOT NULL DEFAULT 0,
  rejected_qty INT NOT NULL DEFAULT 0,
  billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  trashed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, jw_ref)
);

CREATE TABLE IF NOT EXISTS job_work_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  jw_id UUID NOT NULL REFERENCES job_work_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  item_name TEXT NOT NULL,
  stock_unit TEXT NOT NULL,
  qty_planned NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_issued NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_returned NUMERIC(14,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_work_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  jw_id UUID NOT NULL REFERENCES job_work_orders(id),
  challan_ref TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lines JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS job_work_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  jw_id UUID NOT NULL REFERENCES job_work_orders(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_qty INT NOT NULL DEFAULT 0,
  rework_qty INT NOT NULL DEFAULT 0,
  rejected_qty INT NOT NULL DEFAULT 0,
  material_returned JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  item_id UUID NOT NULL REFERENCES items(id),
  movement_type TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(12,4) DEFAULT 0,
  ref_type TEXT,
  ref_id UUID,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  order_id UUID NOT NULL REFERENCES sales_orders(id),
  dispatch_ref TEXT NOT NULL,
  dispatched_at DATE NOT NULL DEFAULT CURRENT_DATE,
  lines JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, dispatch_ref)
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  order_id UUID REFERENCES sales_orders(id),
  dispatch_id UUID REFERENCES dispatches(id),
  return_ref TEXT NOT NULL,
  reason TEXT,
  condition TEXT DEFAULT 'saleable',
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, return_ref)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'vendor', 'agent')),
  party_id UUID NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  allocations JSONB NOT NULL DEFAULT '[]',
  unallocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  photo_url TEXT,
  voucher_ref TEXT NOT NULL,
  reversed_of UUID REFERENCES payments(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, voucher_ref)
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  photo_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS other_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  agent_id UUID NOT NULL REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),
  order_id UUID REFERENCES sales_orders(id),
  dispatch_id UUID REFERENCES dispatches(id),
  base_amount NUMERIC(14,2) NOT NULL,
  rate_pct NUMERIC(6,2) NOT NULL,
  earned NUMERIC(14,2) NOT NULL,
  reversed NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  party_type TEXT NOT NULL,
  party_id UUID NOT NULL,
  bill_ref TEXT,
  outstanding NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date DATE,
  promised_date DATE,
  promised_amount NUMERIC(14,2),
  owner_user_id UUID REFERENCES users(id),
  last_outcome TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  order_id UUID REFERENCES sales_orders(id),
  invoice_ref TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  place_of_supply TEXT,
  taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]',
  irn TEXT,
  eway_bill TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, invoice_ref)
);

CREATE TABLE IF NOT EXISTS document_sequences (
  factory_id UUID NOT NULL REFERENCES factories(id),
  doc_type TEXT NOT NULL,
  fy TEXT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (factory_id, doc_type, fy)
);
`;

async function main() {
  await query(sql);
  console.log('Full PRD migration complete');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
