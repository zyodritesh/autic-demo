import { pool, query } from './pool.js';

const sql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('sales', 'factory_admin', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (factory_id, user_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  branch TEXT,
  buyer_contact TEXT,
  delivery_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_factory_client_uidx
  ON customers (factory_id, client_id) WHERE client_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS customers_factory_name_idx ON customers (factory_id, lower(name));
CREATE INDEX IF NOT EXISTS customers_factory_mobile_idx ON customers (factory_id, mobile);

CREATE TABLE IF NOT EXISTS catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  design_code TEXT NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  qr_payload TEXT NOT NULL,
  pack_size INT NOT NULL CHECK (pack_size IN (4, 5)),
  size_breakdown JSONB NOT NULL,
  wholesale_price_per_set NUMERIC(12,2) NOT NULL,
  photo_url TEXT,
  photo_thumb_url TEXT,
  available_sets INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, design_code, colour)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID NOT NULL,
  order_ref TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  customer_snapshot JSONB NOT NULL,
  delivery_note TEXT,
  channel TEXT DEFAULT 'showroom',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  sync_status TEXT NOT NULL DEFAULT 'synced',
  total_sets INT NOT NULL DEFAULT 0,
  total_pieces INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  version INT NOT NULL DEFAULT 1,
  review_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, client_id),
  UNIQUE (factory_id, order_ref)
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id),
  catalogue_item_id UUID REFERENCES catalogue_items(id),
  design_code TEXT NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  photo_url TEXT,
  pack_size INT NOT NULL,
  size_breakdown JSONB NOT NULL,
  wholesale_price_per_set NUMERIC(12,2) NOT NULL,
  set_qty INT NOT NULL,
  pieces INT NOT NULL,
  line_amount NUMERIC(14,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id),
  client_id UUID,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attachments_factory_client_uidx
  ON sales_order_attachments (factory_id, client_id) WHERE client_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  catalogue_item_id UUID NOT NULL REFERENCES catalogue_items(id),
  sets_reserved INT NOT NULL,
  UNIQUE (order_id, catalogue_item_id)
);

CREATE TABLE IF NOT EXISTS sync_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL,
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, user_id, idempotency_key)
);
`;

async function migrate() {
  await query(sql);
  console.log('Migration complete');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
