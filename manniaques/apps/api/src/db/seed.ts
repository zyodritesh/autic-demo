import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './pool.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertDemoSeedAllowed() {
  if (process.env.SEED_DEMO !== '1') {
    throw new Error(
      'Demo seed is disabled. Set SEED_DEMO=1 for local demo data only (never on hosted publish).',
    );
  }
}

function svgThumb(label: string, colour: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
  <rect width="320" height="400" fill="${colour}"/>
  <text x="160" y="200" text-anchor="middle" fill="#fff" font-size="28" font-family="Georgia">${label}</text>
</svg>`);
}

/** Strong random 8-digit PIN — printed to stdout only, never hardcoded. */
function generateDemoPin(): string {
  return String(randomInt(10000000, 100000000));
}

export async function seed({ truncate = true }: { truncate?: boolean } = {}) {
  assertDemoSeedAllowed();
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  if (truncate) {
    await query(`
    TRUNCATE
      commission_lines, tax_invoices, follow_ups, other_income, expenses, payments,
      sales_returns, dispatches, stock_movements, job_work_receipts, job_work_issues,
      job_work_materials, job_work_orders, purchase_return_lines, purchase_returns,
      purchase_receipt_lines, purchase_receipts, purchase_order_lines, purchase_orders,
      style_bom_lines, stock_reservations, sales_order_attachments, sales_order_lines,
      sales_orders, sync_idempotency, catalogue_items, styles, items, categories,
      vendors, invitations, document_sequences, customers, memberships, users, factories
    RESTART IDENTITY CASCADE
  `);
  }

  const factories = await query<{ id: string; name: string }>(
    `INSERT INTO factories (name, status, gstin, state_code, admin_mobile)
     VALUES ('Manniaques','active','24AABCM1234A1Z5','24','9000000002'),
            ('Aurora Knits','active','24AABCA9999B1Z1','24','9000000003')
     RETURNING id, name`,
  );
  const [manniaques, aurora] = factories.rows;
  const demoPin = generateDemoPin();
  const pinHash = await bcrypt.hash(demoPin, 8);

  const users = await query<{ id: string; mobile: string; name: string }>(
    `INSERT INTO users (mobile, name, pin_hash) VALUES
      ('9000000001','Riya Sales',$1),
      ('9000000002','Amit Admin',$1),
      ('9000000003','Sara Aurora',$1),
      ('9000000004','Priya Purchase',$1),
      ('9000000005','Dev Production',$1),
      ('9000000006','Neha Stores',$1),
      ('9000000007','Arun Accounts',$1),
      ('9000000008','Vikram Agent',$1),
      ('9000000009','Super Admin',$1)
     RETURNING id, mobile, name`,
    [pinHash],
  );
  const [riya, amit, sara, priya, dev, neha, arun, vikram, superAdmin] = users.rows;

  await query(
    `INSERT INTO memberships (factory_id, user_id, role, roles) VALUES
      ($1,$2,'sales','{sales}'),
      ($1,$3,'factory_admin','{factory_admin}'),
      ($4,$5,'sales','{sales}'),
      ($1,$6,'purchase','{purchase}'),
      ($1,$7,'production','{production}'),
      ($1,$8,'stores','{stores,sales}'),
      ($1,$9,'accounts','{accounts}'),
      ($1,$10,'agent','{agent}'),
      ($1,$11,'super_admin','{super_admin}')`,
    [
      manniaques.id,
      riya.id,
      amit.id,
      aurora.id,
      sara.id,
      priya.id,
      dev.id,
      neha.id,
      arun.id,
      vikram.id,
      superAdmin.id,
    ],
  );

  const customers = await query<{ id: string }>(
    `INSERT INTO customers
      (factory_id, name, mobile, branch, buyer_contact, delivery_address, created_by, agent_id, commission_pct, gstin)
     VALUES
      ($1,'Kothari Showroom','9811111111','CG Road','Mrs Kothari','12 CG Road, Ahmedabad',$2,$3,5,'24AABCK1111K1Z1'),
      ($1,'Saree Palace','9822222222','Manek Chowk','Rajesh','45 Manek Chowk',$2,NULL,0,NULL),
      ($4,'Aurora Boutique','9833333333','SG Highway','Neha','88 SG Highway',$5,NULL,0,NULL)
     RETURNING id`,
    [manniaques.id, riya.id, vikram.id, aurora.id, sara.id],
  );

  await query(
    `INSERT INTO vendors (factory_id, name, mobile, is_karigar, notes, created_by) VALUES
      ($1,'Gujarat Fabrics','9876543210',false,'Main fabric supplier',$2),
      ($1,'Raju Karigar','9866666666',true,'Stitching unit',$2),
      ($1,'Trim House','9855555555',false,'Buttons and zippers',$2)`,
    [manniaques.id, priya.id],
  );

  const cats = await query<{ id: string; name: string; item_type: string }>(
    `INSERT INTO categories (factory_id, item_type, name) VALUES
      ($1,'raw','Fabric'),($1,'raw','Trims'),($1,'finished','Kurtis'),($1,'finished','Co-ord sets')
     RETURNING id, name, item_type`,
    [manniaques.id],
  );
  const fabricCat = cats.rows.find((c) => c.name === 'Fabric')!;
  const kurtiCat = cats.rows.find((c) => c.name === 'Kurtis')!;

  const fabric = await query<{ id: string }>(
    `INSERT INTO items
      (factory_id, item_type, category_id, code, name, colour, stock_unit, starting_unit_cost, last_received_cost, avg_cost, on_hand, hsn, qr_payload)
     VALUES
      ($1,'raw',$2,'FAB-COT-WHT','Cotton fabric','White','metre',100,100,100,200,'5208',$3),
      ($1,'raw',$2,'FAB-RAY-IND','Rayon fabric','Indigo','metre',120,120,120,150,'5407',$4),
      ($1,'raw',$5,'TRM-BTN-01','Buttons assorted',NULL,'piece',2,2,2,5000,'9606',$6)
     RETURNING id`,
    [
      manniaques.id,
      fabricCat.id,
      `ITEM:${manniaques.id}:FAB-COT-WHT`,
      `ITEM:${manniaques.id}:FAB-RAY-IND`,
      cats.rows.find((c) => c.name === 'Trims')!.id,
      `ITEM:${manniaques.id}:TRM-BTN-01`,
    ],
  );

  for (const it of [
    { code: 'FAB-COT-WHT', qty: 200, cost: 100 },
    { code: 'FAB-RAY-IND', qty: 150, cost: 120 },
  ]) {
    const row = await query(`SELECT id FROM items WHERE factory_id=$1 AND code=$2`, [
      manniaques.id,
      it.code,
    ]);
    await query(
      `INSERT INTO stock_movements (factory_id, item_id, movement_type, qty, unit_cost, ref_type, note, created_by)
       VALUES ($1,$2,'opening',$3,$4,'opening','Seed opening',$5)`,
      [manniaques.id, row.rows[0].id, it.qty, it.cost, priya.id],
    );
  }

  const style = await query<{ id: string }>(
    `INSERT INTO styles
      (factory_id, design_code, name, category_id, stitching_cost, finishing_cost, packing_cost, status)
     VALUES ($1,'MNQ-401','Floral Kurti',$2,80,20,10,'active') RETURNING id`,
    [manniaques.id, kurtiCat.id],
  );

  await query(
    `INSERT INTO style_bom_lines (factory_id, style_id, item_id, qty_per_piece)
     VALUES ($1,$2,$3,2.5)`,
    [manniaques.id, style.rows[0].id, fabric.rows[0].id],
  );
  // unit cost = 2.5*100 + 80 + 20 + 10 = 360

  const designs = [
    {
      code: 'MNQ-401',
      name: 'Floral Kurti',
      colour: 'Indigo',
      pack: 5,
      sizes: { S: 1, M: 2, L: 1, XL: 1 },
      price: 2500,
      hex: '#3d4f8c',
      stock: 40,
      styleId: style.rows[0].id,
      unitCost: 360,
    },
    {
      code: 'MNQ-402',
      name: 'Cotton Co-ord',
      colour: 'Ivory',
      pack: 4,
      sizes: { S: 1, M: 1, L: 1, XL: 1 },
      price: 3200,
      hex: '#c9b79c',
      stock: 35,
      styleId: null,
      unitCost: 400,
    },
    {
      code: 'MNQ-403',
      name: 'Block Print Set',
      colour: 'Maroon',
      pack: 5,
      sizes: { S: 1, M: 2, L: 1, XL: 1 },
      price: 2800,
      hex: '#7a2e2e',
      stock: 25,
      styleId: null,
      unitCost: 350,
    },
    {
      code: 'MNQ-404',
      name: 'Linen Kurta',
      colour: 'Olive',
      pack: 4,
      sizes: { M: 1, L: 2, XL: 1 },
      price: 3000,
      hex: '#556b2f',
      stock: 20,
      styleId: null,
      unitCost: 380,
    },
    {
      code: 'ARK-101',
      name: 'Aurora Knit Top',
      colour: 'Navy',
      pack: 5,
      sizes: { S: 1, M: 2, L: 1, XL: 1 },
      price: 2200,
      hex: '#1f3a5f',
      stock: 30,
      factoryId: aurora.id,
      styleId: null,
      unitCost: 300,
    },
  ];

  for (const d of designs) {
    const factoryId = d.factoryId || manniaques.id;
    const filename = `${d.code}-${d.colour}.svg`.replace(/\s+/g, '-');
    fs.writeFileSync(path.join(config.uploadsDir, filename), svgThumb(d.code, d.hex));
    const photoUrl = `/uploads/${filename}`;
    let styleId = d.styleId;
    if (!styleId && factoryId === manniaques.id) {
      const st = await query(
        `INSERT INTO styles (factory_id, design_code, name, stitching_cost, status, photo_url, photo_thumb_url)
         VALUES ($1,$2,$3,80,'active',$4,$4)
         ON CONFLICT (factory_id, design_code) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [factoryId, d.code, d.name, photoUrl],
      );
      styleId = st.rows[0].id;
    }
    await query(
      `INSERT INTO catalogue_items
        (factory_id, style_id, design_code, name, colour, qr_payload, pack_size, size_breakdown,
         wholesale_price_per_set, photo_url, photo_thumb_url, available_sets, estimated_unit_cost, hsn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,'6204')`,
      [
        factoryId,
        styleId,
        d.code,
        d.name,
        d.colour,
        `MANNIAQUES:${factoryId}:${d.code}:${d.colour}`,
        d.pack,
        JSON.stringify(d.sizes),
        d.price,
        photoUrl,
        d.stock,
        d.unitCost,
      ],
    );
  }

  console.log(
    JSON.stringify(
      {
        factories: factories.rows,
        logins: [
          { mobile: '9000000001', pin: demoPin, roles: 'sales', factory: 'Manniaques' },
          { mobile: '9000000002', pin: demoPin, roles: 'factory_admin', factory: 'Manniaques' },
          { mobile: '9000000003', pin: demoPin, roles: 'sales', factory: 'Aurora Knits' },
          { mobile: '9000000004', pin: demoPin, roles: 'purchase', factory: 'Manniaques' },
          { mobile: '9000000005', pin: demoPin, roles: 'production', factory: 'Manniaques' },
          { mobile: '9000000006', pin: demoPin, roles: 'stores+sales', factory: 'Manniaques' },
          { mobile: '9000000007', pin: demoPin, roles: 'accounts', factory: 'Manniaques' },
          { mobile: '9000000008', pin: demoPin, roles: 'agent', factory: 'Manniaques' },
          { mobile: '9000000009', pin: demoPin, roles: 'super_admin', factory: 'Manniaques' },
        ],
        customers: customers.rows.length,
        note: 'Demo PINs are random and printed here only. MNQ-401 BOM ≈ ₹360/pc.',
      },
      null,
      2,
    ),
  );
}

export async function seedIfEmpty() {
  assertDemoSeedAllowed();
  const { rows } = await query<{ n: string }>('SELECT count(*)::text AS n FROM users');
  if (Number(rows[0]?.n || 0) > 0) return false;
  await seed({ truncate: false });
  console.log('Demo seed applied (empty database, SEED_DEMO=1)');
  return true;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  seed()
    .then(async () => {
      await pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
