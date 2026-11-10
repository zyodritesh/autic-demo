import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { assertMembershipActive, requireAuth } from '../auth.js';
import { query, pool } from '../db/pool.js';
import { apparelGst, nextDocRef } from '../lib/docs.js';
import { hasRole, moduleAccess } from '../roles.js';

export const modulesRouter = Router();
modulesRouter.use(requireAuth);

async function gate(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1]) {
  const auth = req.auth!;
  const m = await assertMembershipActive(auth);
  if (!m) {
    res.status(403).json({ error: 'Access revoked' });
    return null;
  }
  const roles = auth.roles?.length ? auth.roles : [auth.role];
  return { auth, roles, access: moduleAccess(roles) };
}

modulesRouter.get('/home', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const { auth, access, roles } = ctx;
  const [salesToday, pendingPo, openJw, followUps, draftsSync] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total_amount),0)::float8 AS amount, COUNT(*)::int AS cnt
       FROM sales_orders WHERE factory_id=$1 AND order_date=CURRENT_DATE AND status!='draft' AND sync_status='synced'`,
      [auth.factoryId],
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE factory_id=$1 AND status='draft' AND NOT trashed`,
      [auth.factoryId],
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM job_work_orders WHERE factory_id=$1 AND status IN ('issued','part_received') AND NOT trashed`,
      [auth.factoryId],
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM follow_ups WHERE factory_id=$1 AND status='open'`,
      [auth.factoryId],
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM sales_orders WHERE factory_id=$1 AND created_by=$2 AND sync_status IN ('local','pending','error')`,
      [auth.factoryId, auth.userId],
    ),
  ]);
  res.json({
    roles,
    access,
    todaySales: salesToday.rows[0],
    pendingPurchaseDrafts: pendingPo.rows[0].cnt,
    openJobWork: openJw.rows[0].cnt,
    openFollowUps: followUps.rows[0].cnt,
    waitingSync: draftsSync.rows[0].cnt,
  });
});

/* -------- Items -------- */
modulesRouter.get('/items', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.items) return res.status(403).json({ error: 'Forbidden' });
  const type = String(req.query.type || '');
  const q = String(req.query.q || '').trim();
  const result = await query(
    `SELECT i.*, c.name AS category_name FROM items i
     LEFT JOIN categories c ON c.id=i.category_id
     WHERE i.factory_id=$1 AND NOT i.trashed
       AND ($2='' OR i.item_type=$2)
       AND ($3='' OR i.name ILIKE '%'||$3||'%' OR i.code ILIKE '%'||$3||'%')
     ORDER BY i.code LIMIT 200`,
    [ctx.auth.factoryId, type, q],
  );
  res.json({ items: result.rows });
});

modulesRouter.post('/items', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.items) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  let categoryId = b.categoryId;
  if (b.categoryName && !categoryId) {
    const cat = await query(
      `INSERT INTO categories (factory_id, item_type, name) VALUES ($1,$2,$3)
       ON CONFLICT (factory_id, item_type, name) DO UPDATE SET name=EXCLUDED.name
       RETURNING id`,
      [ctx.auth.factoryId, b.itemType || 'raw', b.categoryName],
    );
    categoryId = cat.rows[0].id;
  }
  const code =
    b.code ||
    `${(b.itemType || 'raw').slice(0, 1).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const inserted = await query(
    `INSERT INTO items
      (factory_id, item_type, category_id, code, name, colour, size_label, stock_unit,
       starting_unit_cost, avg_cost, hsn, on_hand, qr_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12)
     RETURNING *`,
    [
      ctx.auth.factoryId,
      b.itemType || 'raw',
      categoryId || null,
      code,
      b.name,
      b.colour || null,
      b.sizeLabel || null,
      b.stockUnit || 'metre',
      Number(b.startingUnitCost || 0),
      b.hsn || null,
      Number(b.onHand || 0),
      b.qrPayload || `ITEM:${ctx.auth.factoryId}:${code}`,
    ],
  );
  if (Number(b.onHand || 0) > 0) {
    await query(
      `INSERT INTO stock_movements (factory_id, item_id, movement_type, qty, unit_cost, ref_type, note, created_by)
       VALUES ($1,$2,'opening',$3,$4,'opening',NULL,$5)`,
      [
        ctx.auth.factoryId,
        inserted.rows[0].id,
        Number(b.onHand),
        Number(b.startingUnitCost || 0),
        ctx.auth.userId,
      ],
    );
  }
  res.json({ item: inserted.rows[0] });
});

modulesRouter.post('/items/:id/trash', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  await query(`UPDATE items SET trashed=true WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  res.json({ ok: true });
});

modulesRouter.post('/items/:id/restore', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  await query(`UPDATE items SET trashed=false WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  res.json({ ok: true });
});

/* -------- Styles / catalogue -------- */
modulesRouter.get('/styles', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const styles = await query(
    `SELECT s.*,
      (SELECT json_agg(ci ORDER BY ci.colour) FROM catalogue_items ci
        WHERE ci.style_id=s.id AND ci.active AND NOT COALESCE(ci.trashed,false)) AS variants
     FROM styles s WHERE s.factory_id=$1 AND NOT s.trashed ORDER BY s.design_code`,
    [ctx.auth.factoryId],
  );
  res.json({ styles: styles.rows });
});

modulesRouter.post('/styles', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.catalogue) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const style = await query(
    `INSERT INTO styles
      (factory_id, design_code, name, photo_url, photo_thumb_url, stitching_cost, finishing_cost, packing_cost, status)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,'draft') RETURNING *`,
    [
      ctx.auth.factoryId,
      b.designCode,
      b.name,
      b.photoUrl || null,
      Number(b.stitchingCost || 0),
      Number(b.finishingCost || 0),
      Number(b.packingCost || 0),
    ],
  );
  res.json({ style: style.rows[0] });
});

modulesRouter.post('/styles/:id/variants', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const b = req.body;
  const style = await query(`SELECT * FROM styles WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!style.rows[0]) return res.status(404).json({ error: 'Style not found' });
  const packSize = Number(b.packSize);
  const breakdown = b.sizeBreakdown || {};
  const sum = Object.values(breakdown as Record<string, number>).reduce(
    (a, n) => a + Number(n),
    0,
  );
  if (packSize !== 4 && packSize !== 5) return res.status(400).json({ error: 'Pack must be 4 or 5' });
  if (sum !== packSize) return res.status(400).json({ error: 'Size breakdown must equal pack size' });

  const mat = await query(
    `SELECT COALESCE(SUM(b.qty_per_piece * COALESCE(i.last_received_cost, i.starting_unit_cost, 0)),0)::float8 AS material
     FROM style_bom_lines b JOIN items i ON i.id=b.item_id WHERE b.style_id=$1`,
    [req.params.id],
  );
  const s = style.rows[0];
  const unitCost =
    Number(mat.rows[0].material) +
    Number(s.stitching_cost) +
    Number(s.finishing_cost) +
    Number(s.packing_cost);

  const qr = `MANNIAQUES:${ctx.auth.factoryId}:${s.design_code}:${b.colour}`;
  const variant = await query(
    `INSERT INTO catalogue_items
      (factory_id, style_id, design_code, name, colour, qr_payload, pack_size, size_breakdown,
       wholesale_price_per_set, photo_url, photo_thumb_url, available_sets, estimated_unit_cost, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,true) RETURNING *`,
    [
      ctx.auth.factoryId,
      s.id,
      s.design_code,
      s.name,
      b.colour,
      qr,
      packSize,
      JSON.stringify(breakdown),
      Number(b.wholesalePricePerSet || 0),
      s.photo_url,
      Number(b.availableSets || 0),
      unitCost || null,
    ],
  );
  res.json({
    variant: variant.rows[0],
    estimatedUnitCost: unitCost,
    setCost: unitCost * packSize,
    margin: Number(b.wholesalePricePerSet || 0) - unitCost * packSize,
  });
});

modulesRouter.post('/styles/:id/bom', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const b = req.body;
  const line = await query(
    `INSERT INTO style_bom_lines (factory_id, style_id, item_id, qty_per_piece, size_override, colour_override)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      ctx.auth.factoryId,
      req.params.id,
      b.itemId,
      Number(b.qtyPerPiece),
      b.sizeOverride || null,
      b.colourOverride || null,
    ],
  );
  res.json({ line: line.rows[0] });
});

/* -------- Parties -------- */
modulesRouter.get('/vendors', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const rows = await query(
    `SELECT * FROM vendors WHERE factory_id=$1 AND NOT trashed ORDER BY name`,
    [ctx.auth.factoryId],
  );
  res.json({ vendors: rows.rows });
});

modulesRouter.post('/vendors', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const b = req.body;
  const row = await query(
    `INSERT INTO vendors (factory_id, client_id, name, mobile, gstin, notes, is_karigar, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      ctx.auth.factoryId,
      b.clientId || randomUUID(),
      b.name,
      b.mobile,
      b.gstin || null,
      b.notes || null,
      Boolean(b.isKarigar),
      ctx.auth.userId,
    ],
  );
  res.json({ vendor: row.rows[0] });
});

modulesRouter.get('/customers/:id/statement', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const customer = await query(`SELECT * FROM customers WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!customer.rows[0]) return res.status(404).json({ error: 'Not found' });
  const orders = await query(
    `SELECT id, order_ref, order_date, total_amount::float8, status FROM sales_orders
     WHERE factory_id=$1 AND customer_id=$2 ORDER BY order_date DESC LIMIT 50`,
    [ctx.auth.factoryId, req.params.id],
  );
  const pays = await query(
    `SELECT * FROM payments WHERE factory_id=$1 AND party_type='customer' AND party_id=$2
     ORDER BY payment_date DESC LIMIT 50`,
    [ctx.auth.factoryId, req.params.id],
  );
  const billed = orders.rows.reduce((s, o) => s + Number(o.total_amount), 0);
  const received = pays.rows.reduce((s, p) => s + Number(p.amount), 0);
  res.json({
    customer: customer.rows[0],
    orders: orders.rows,
    payments: pays.rows,
    receivable: billed - received,
  });
});

/* -------- Purchase -------- */
modulesRouter.get('/purchase-orders', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.purchase && !ctx.access.stores) return res.status(403).json({ error: 'Forbidden' });
  const rows = await query(
    `SELECT * FROM purchase_orders WHERE factory_id=$1 AND NOT trashed ORDER BY updated_at DESC LIMIT 100`,
    [ctx.auth.factoryId],
  );
  res.json({ orders: rows.rows });
});

modulesRouter.post('/purchase-orders', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.purchase) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const clientId = b.clientId || randomUUID();
  const poRef = b.poRef || (await nextDocRef(ctx.auth.factoryId, 'po', 'PO'));
  const lines = Array.isArray(b.lines) ? b.lines : [];
  const total = lines.reduce(
    (s: number, l: { qty: number; rate: number }) => s + Number(l.qty) * Number(l.rate),
    0,
  );
  const inserted = await query(
    `INSERT INTO purchase_orders
      (factory_id, client_id, po_ref, vendor_id, vendor_snapshot, status, sync_status, photo_url, notes, total_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'synced',$7,$8,$9,$10)
     ON CONFLICT (factory_id, client_id) DO UPDATE SET
       vendor_snapshot=EXCLUDED.vendor_snapshot, photo_url=EXCLUDED.photo_url, notes=EXCLUDED.notes,
       total_amount=EXCLUDED.total_amount, status=EXCLUDED.status, updated_at=now(), version=purchase_orders.version+1
     RETURNING *`,
    [
      ctx.auth.factoryId,
      clientId,
      poRef,
      b.vendorId || null,
      JSON.stringify(b.vendorSnapshot || {}),
      b.status || 'draft',
      b.photoUrl || null,
      b.notes || null,
      total,
      ctx.auth.userId,
    ],
  );
  const po = inserted.rows[0];
  await query(`DELETE FROM purchase_order_lines WHERE po_id=$1`, [po.id]);
  let i = 0;
  for (const l of lines) {
    await query(
      `INSERT INTO purchase_order_lines
        (po_id, factory_id, item_id, item_code, item_name, stock_unit, qty, rate, line_amount, uncertain, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        po.id,
        ctx.auth.factoryId,
        l.itemId || null,
        l.itemCode || null,
        l.itemName,
        l.stockUnit || 'metre',
        Number(l.qty),
        Number(l.rate),
        Number(l.qty) * Number(l.rate),
        Boolean(l.uncertain),
        i++,
      ],
    );
  }
  res.json({ order: po });
});

modulesRouter.get('/purchase-orders/:id', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const po = await query(`SELECT * FROM purchase_orders WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!po.rows[0]) return res.status(404).json({ error: 'Not found' });
  const lines = await query(
    `SELECT * FROM purchase_order_lines WHERE po_id=$1 ORDER BY sort_order`,
    [req.params.id],
  );
  res.json({ order: po.rows[0], lines: lines.rows });
});

modulesRouter.post('/purchase-orders/:id/confirm', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const updated = await query(
    `UPDATE purchase_orders SET status='confirmed', updated_at=now()
     WHERE id=$1 AND factory_id=$2 RETURNING *`,
    [req.params.id, ctx.auth.factoryId],
  );
  res.json({ order: updated.rows[0] });
});

modulesRouter.post('/purchase-orders/:id/trash', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  await query(
    `UPDATE purchase_orders SET trashed=true, updated_at=now() WHERE id=$1 AND factory_id=$2`,
    [req.params.id, ctx.auth.factoryId],
  );
  res.json({ ok: true });
});

modulesRouter.post('/purchase-orders/:id/restore', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  await query(
    `UPDATE purchase_orders SET trashed=false, updated_at=now() WHERE id=$1 AND factory_id=$2`,
    [req.params.id, ctx.auth.factoryId],
  );
  res.json({ ok: true });
});

modulesRouter.post('/purchase-orders/:id/receive', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.stores && !ctx.access.purchase) return res.status(403).json({ error: 'Forbidden' });
  const lines: Array<{ poLineId: string; qty: number; unitCost: number; itemId?: string }> =
    req.body.lines || [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const po = await client.query(
      `SELECT * FROM purchase_orders WHERE id=$1 AND factory_id=$2 FOR UPDATE`,
      [req.params.id, ctx.auth.factoryId],
    );
    if (!po.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'PO not found' });
    }
    const receiptRef = await nextDocRef(ctx.auth.factoryId, 'grn', 'GRN', client);
    const receipt = await client.query(
      `INSERT INTO purchase_receipts (factory_id, po_id, receipt_ref, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [ctx.auth.factoryId, req.params.id, receiptRef, ctx.auth.userId],
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO purchase_receipt_lines (receipt_id, po_line_id, item_id, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [receipt.rows[0].id, l.poLineId, l.itemId || null, l.qty, l.unitCost],
      );
      await client.query(
        `UPDATE purchase_order_lines SET qty_received = qty_received + $1 WHERE id=$2`,
        [l.qty, l.poLineId],
      );
      if (l.itemId) {
        const item = await client.query(`SELECT * FROM items WHERE id=$1 FOR UPDATE`, [l.itemId]);
        const prevQty = Number(item.rows[0].on_hand);
        const prevCost = Number(item.rows[0].avg_cost || item.rows[0].starting_unit_cost || 0);
        const newQty = prevQty + Number(l.qty);
        const avg =
          newQty === 0 ? 0 : (prevQty * prevCost + Number(l.qty) * Number(l.unitCost)) / newQty;
        await client.query(
          `UPDATE items SET on_hand=$1, avg_cost=$2, last_received_cost=$3 WHERE id=$4`,
          [newQty, avg, l.unitCost, l.itemId],
        );
        await client.query(
          `INSERT INTO stock_movements (factory_id, item_id, movement_type, qty, unit_cost, ref_type, ref_id, created_by)
           VALUES ($1,$2,'purchase_receipt',$3,$4,'purchase_receipt',$5,$6)`,
          [ctx.auth.factoryId, l.itemId, l.qty, l.unitCost, receipt.rows[0].id, ctx.auth.userId],
        );
      }
    }
    await client.query(`UPDATE purchase_orders SET status='part_received', updated_at=now() WHERE id=$1`, [
      req.params.id,
    ]);
    await client.query('COMMIT');
    res.json({ receipt: receipt.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

/* -------- Job work -------- */
modulesRouter.get('/job-work', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.production) return res.status(403).json({ error: 'Forbidden' });
  const rows = await query(
    `SELECT * FROM job_work_orders WHERE factory_id=$1 AND NOT trashed ORDER BY updated_at DESC LIMIT 100`,
    [ctx.auth.factoryId],
  );
  res.json({ orders: rows.rows });
});

modulesRouter.post('/job-work', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.production) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const jwRef = b.jwRef || (await nextDocRef(ctx.auth.factoryId, 'jw', 'JW'));
  const row = await query(
    `INSERT INTO job_work_orders
      (factory_id, client_id, jw_ref, vendor_id, vendor_snapshot, style_id, catalogue_item_id,
       process, target_qty, rate_basis, rate, due_date, status, photo_url, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      ctx.auth.factoryId,
      b.clientId || randomUUID(),
      jwRef,
      b.vendorId || null,
      JSON.stringify(b.vendorSnapshot || {}),
      b.styleId || null,
      b.catalogueItemId || null,
      b.process || 'stitching',
      Number(b.targetQty || 0),
      b.rateBasis || 'per_piece',
      Number(b.rate || 0),
      b.dueDate || null,
      b.status || 'draft',
      b.photoUrl || null,
      b.notes || null,
      ctx.auth.userId,
    ],
  );
  if (b.styleId) {
    const bom = await query(
      `SELECT b.*, i.name, i.stock_unit FROM style_bom_lines b JOIN items i ON i.id=b.item_id WHERE b.style_id=$1`,
      [b.styleId],
    );
    for (const line of bom.rows) {
      await query(
        `INSERT INTO job_work_materials (factory_id, jw_id, item_id, item_name, stock_unit, qty_planned)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          ctx.auth.factoryId,
          row.rows[0].id,
          line.item_id,
          line.name,
          line.stock_unit,
          Number(line.qty_per_piece) * Number(b.targetQty || 0),
        ],
      );
    }
  }
  res.json({ order: row.rows[0] });
});

modulesRouter.post('/job-work/:id/confirm', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const updated = await query(
    `UPDATE job_work_orders SET status='issued', updated_at=now() WHERE id=$1 AND factory_id=$2 RETURNING *`,
    [req.params.id, ctx.auth.factoryId],
  );
  res.json({ order: updated.rows[0] });
});

modulesRouter.post('/job-work/:id/issue', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const lines: Array<{ materialId: string; itemId?: string; qty: number }> = req.body.lines || [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const challan = await nextDocRef(ctx.auth.factoryId, 'challan', 'DC', client);
    const issue = await client.query(
      `INSERT INTO job_work_issues (factory_id, jw_id, challan_ref, lines, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ctx.auth.factoryId, req.params.id, challan, JSON.stringify(lines), ctx.auth.userId],
    );
    for (const l of lines) {
      await client.query(
        `UPDATE job_work_materials SET qty_issued = qty_issued + $1 WHERE id=$2`,
        [l.qty, l.materialId],
      );
      if (l.itemId) {
        await client.query(`UPDATE items SET on_hand = on_hand - $1 WHERE id=$2 AND factory_id=$3`, [
          l.qty,
          l.itemId,
          ctx.auth.factoryId,
        ]);
        await client.query(
          `INSERT INTO stock_movements (factory_id, item_id, movement_type, qty, ref_type, ref_id, created_by)
           VALUES ($1,$2,'job_issue',$3,'job_issue',$4,$5)`,
          [ctx.auth.factoryId, l.itemId, -Math.abs(l.qty), issue.rows[0].id, ctx.auth.userId],
        );
      }
    }
    await client.query(
      `UPDATE job_work_orders SET status='issued', updated_at=now() WHERE id=$1`,
      [req.params.id],
    );
    await client.query('COMMIT');
    res.json({ issue: issue.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

modulesRouter.post('/job-work/:id/receive', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const b = req.body;
  const accepted = Number(b.acceptedQty || 0);
  const rework = Number(b.reworkQty || 0);
  const rejected = Number(b.rejectedQty || 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jw = await client.query(
      `SELECT * FROM job_work_orders WHERE id=$1 AND factory_id=$2 FOR UPDATE`,
      [req.params.id, ctx.auth.factoryId],
    );
    if (!jw.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const receipt = await client.query(
      `INSERT INTO job_work_receipts
        (factory_id, jw_id, accepted_qty, rework_qty, rejected_qty, material_returned, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        ctx.auth.factoryId,
        req.params.id,
        accepted,
        rework,
        rejected,
        JSON.stringify(b.materialReturned || []),
        ctx.auth.userId,
      ],
    );
    const order = jw.rows[0];
    const newAccepted = Number(order.accepted_qty) + accepted;
    const pending = Number(order.target_qty) - newAccepted;
    const billable =
      order.rate_basis === 'per_piece'
        ? newAccepted * Number(order.rate)
        : Number(order.billed_amount);
    const status = pending <= 0 ? 'closed' : 'part_received';
    await client.query(
      `UPDATE job_work_orders SET
         accepted_qty=$1, rework_qty=rework_qty+$2, rejected_qty=rejected_qty+$3,
         billed_amount=$4, status=$5, updated_at=now()
       WHERE id=$6`,
      [newAccepted, rework, rejected, billable, status, req.params.id],
    );
    if (order.catalogue_item_id && accepted > 0) {
      // finished pieces enter stock as sets approx pack — store as available_sets boost by pieces/pack
      const cat = await client.query(`SELECT * FROM catalogue_items WHERE id=$1`, [
        order.catalogue_item_id,
      ]);
      if (cat.rows[0]) {
        const sets = Math.floor(accepted / Number(cat.rows[0].pack_size));
        if (sets > 0) {
          await client.query(
            `UPDATE catalogue_items SET available_sets = available_sets + $1 WHERE id=$2`,
            [sets, order.catalogue_item_id],
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({
      receipt: receipt.rows[0],
      acceptedCumulative: newAccepted,
      pending: Math.max(0, pending),
      billable,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

modulesRouter.get('/job-work/:id', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const order = await query(`SELECT * FROM job_work_orders WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!order.rows[0]) return res.status(404).json({ error: 'Not found' });
  const materials = await query(`SELECT * FROM job_work_materials WHERE jw_id=$1`, [req.params.id]);
  res.json({ order: order.rows[0], materials: materials.rows });
});

/* -------- Stock / dispatch -------- */
modulesRouter.get('/stock', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const items = await query(
    `SELECT id, code, name, item_type, colour, size_label, stock_unit,
            on_hand::float8, reserved::float8, (on_hand-reserved)::float8 AS available,
            avg_cost::float8, last_received_cost::float8
     FROM items WHERE factory_id=$1 AND NOT trashed ORDER BY item_type, code`,
    [ctx.auth.factoryId],
  );
  const finished = await query(
    `SELECT id, design_code, colour, pack_size, available_sets, size_breakdown,
            wholesale_price_per_set::float8
     FROM catalogue_items WHERE factory_id=$1 AND active AND NOT COALESCE(trashed,false)`,
    [ctx.auth.factoryId],
  );
  res.json({ items: items.rows, finished: finished.rows });
});

modulesRouter.post('/orders/:id/dispatch', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.stores && !ctx.access.sales) return res.status(403).json({ error: 'Forbidden' });
  const order = await query(`SELECT * FROM sales_orders WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
  const lines = await query(`SELECT * FROM sales_order_lines WHERE order_id=$1`, [req.params.id]);
  const ref = await nextDocRef(ctx.auth.factoryId, 'dispatch', 'DN');
  const dispatch = await query(
    `INSERT INTO dispatches (factory_id, order_id, dispatch_ref, lines, total_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      ctx.auth.factoryId,
      req.params.id,
      ref,
      JSON.stringify(lines.rows),
      order.rows[0].total_amount,
      ctx.auth.userId,
    ],
  );
  // commission on dispatch
  const cust = order.rows[0].customer_id
    ? await query(`SELECT * FROM customers WHERE id=$1`, [order.rows[0].customer_id])
    : null;
  if (cust?.rows[0]?.agent_id && Number(cust.rows[0].commission_pct) > 0) {
    const base = Number(order.rows[0].total_amount);
    const rate = Number(cust.rows[0].commission_pct);
    await query(
      `INSERT INTO commission_lines
        (factory_id, agent_id, customer_id, order_id, dispatch_id, base_amount, rate_pct, earned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ctx.auth.factoryId,
        cust.rows[0].agent_id,
        cust.rows[0].id,
        order.rows[0].id,
        dispatch.rows[0].id,
        base,
        rate,
        (base * rate) / 100,
      ],
    );
  }
  await query(`UPDATE sales_orders SET status='dispatched', updated_at=now() WHERE id=$1`, [
    req.params.id,
  ]);
  res.json({ dispatch: dispatch.rows[0] });
});

/* -------- Payments / expenses -------- */
modulesRouter.get('/payments', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const rows = await query(
    `SELECT * FROM payments WHERE factory_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [ctx.auth.factoryId],
  );
  res.json({ payments: rows.rows });
});

modulesRouter.post('/payments', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.accounts && !hasRole(ctx.roles, ['sales', 'purchase'])) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const b = req.body;
  const voucher = await nextDocRef(
    ctx.auth.factoryId,
    b.direction === 'in' ? 'receipt' : 'payment',
    b.direction === 'in' ? 'RV' : 'PV',
  );
  const amount = Number(b.amount);
  const allocations = b.allocations || [];
  const allocated = allocations.reduce(
    (s: number, a: { amount: number }) => s + Number(a.amount),
    0,
  );
  const row = await query(
    `INSERT INTO payments
      (factory_id, direction, party_type, party_id, amount, mode, reference, payment_date,
       allocations, unallocated, voucher_ref, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date,CURRENT_DATE),$9,$10,$11,$12) RETURNING *`,
    [
      ctx.auth.factoryId,
      b.direction,
      b.partyType,
      b.partyId,
      amount,
      b.mode || 'cash',
      b.reference || null,
      b.paymentDate || null,
      JSON.stringify(allocations),
      Math.max(0, amount - allocated),
      voucher,
      ctx.auth.userId,
    ],
  );
  res.json({ payment: row.rows[0] });
});

modulesRouter.post('/expenses', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.accounts && !ctx.access.pnl) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const row = await query(
    `INSERT INTO expenses (factory_id, expense_date, category, amount, note, created_by)
     VALUES ($1,COALESCE($2::date,CURRENT_DATE),$3,$4,$5,$6) RETURNING *`,
    [ctx.auth.factoryId, b.expenseDate || null, b.category, Number(b.amount), b.note || null, ctx.auth.userId],
  );
  res.json({ expense: row.rows[0] });
});

/* -------- Agents -------- */
modulesRouter.get('/agents', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const agentFilter =
    ctx.roles.includes('agent') && !ctx.roles.includes('factory_admin')
      ? ctx.auth.userId
      : null;
  const lines = await query(
    `SELECT c.*, u.name AS agent_name FROM commission_lines c
     JOIN users u ON u.id=c.agent_id
     WHERE c.factory_id=$1 AND ($2::uuid IS NULL OR c.agent_id=$2)
     ORDER BY c.created_at DESC`,
    [ctx.auth.factoryId, agentFilter],
  );
  const summary = await query(
    `SELECT agent_id,
            SUM(earned)::float8 AS earned,
            SUM(reversed)::float8 AS reversed,
            SUM(paid)::float8 AS paid,
            SUM(earned-reversed-paid)::float8 AS due
     FROM commission_lines WHERE factory_id=$1
     GROUP BY agent_id`,
    [ctx.auth.factoryId],
  );
  res.json({ lines: lines.rows, summary: summary.rows });
});

modulesRouter.post('/agents/payout', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.accounts && !ctx.access.pnl) return res.status(403).json({ error: 'Forbidden' });
  const { agentId, amount, lineIds } = req.body;
  let remaining = Number(amount);
  for (const id of lineIds || []) {
    if (remaining <= 0) break;
    const line = await query(`SELECT * FROM commission_lines WHERE id=$1 AND factory_id=$2`, [
      id,
      ctx.auth.factoryId,
    ]);
    if (!line.rows[0]) continue;
    const due =
      Number(line.rows[0].earned) - Number(line.rows[0].reversed) - Number(line.rows[0].paid);
    const pay = Math.min(due, remaining);
    await query(`UPDATE commission_lines SET paid = paid + $1 WHERE id=$2`, [pay, id]);
    remaining -= pay;
  }
  const voucher = await nextDocRef(ctx.auth.factoryId, 'payment', 'PV');
  const payment = await query(
    `INSERT INTO payments
      (factory_id, direction, party_type, party_id, amount, mode, voucher_ref, created_by)
     VALUES ($1,'out','agent',$2,$3,'bank',$4,$5) RETURNING *`,
    [ctx.auth.factoryId, agentId, Number(amount), voucher, ctx.auth.userId],
  );
  res.json({ payment: payment.rows[0] });
});

/* -------- Team / factories -------- */
modulesRouter.get('/team', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.team) return res.status(403).json({ error: 'Forbidden' });
  const members = await query(
    `SELECT m.*, u.name, u.mobile FROM memberships m JOIN users u ON u.id=m.user_id
     WHERE m.factory_id=$1 ORDER BY u.name`,
    [ctx.auth.factoryId],
  );
  const invites = await query(
    `SELECT * FROM invitations WHERE factory_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [ctx.auth.factoryId],
  );
  res.json({ members: members.rows, invites: invites.rows });
});

modulesRouter.post('/team/invite', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.team) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const token = randomUUID();
  const invite = await query(
    `INSERT INTO invitations (factory_id, mobile, name, roles, token, expires_at, invited_by)
     VALUES ($1,$2,$3,$4,$5, now() + interval '7 days', $6) RETURNING *`,
    [
      ctx.auth.factoryId,
      b.mobile,
      b.name || null,
      b.roles || ['sales'],
      token,
      ctx.auth.userId,
    ],
  );
  res.json({ invite: invite.rows[0], inviteUrl: `/invite/${token}` });
});

modulesRouter.post('/factories', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.factories) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  const factory = await query(
    `INSERT INTO factories (name, admin_mobile, status, gstin, state_code)
     VALUES ($1,$2,'invited',$3,$4) RETURNING *`,
    [b.name, b.adminMobile, b.gstin || null, b.stateCode || '24'],
  );
  const token = randomUUID();
  await query(
    `INSERT INTO invitations (factory_id, mobile, name, roles, token, expires_at, invited_by)
     VALUES ($1,$2,$3,'{factory_admin}',$4, now() + interval '7 days', $5)`,
    [factory.rows[0].id, b.adminMobile, b.adminName || 'Factory Admin', token, ctx.auth.userId],
  );
  res.json({ factory: factory.rows[0], inviteToken: token });
});

modulesRouter.get('/factories', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.factories) return res.status(403).json({ error: 'Forbidden' });
  const rows = await query(
    `SELECT f.*,
      (SELECT COUNT(*) FROM memberships m WHERE m.factory_id=f.id AND m.status='active')::int AS user_count
     FROM factories f ORDER BY f.created_at DESC`,
  );
  res.json({ factories: rows.rows });
});

/* -------- GST invoice (simplified) -------- */
modulesRouter.post('/orders/:id/tax-invoice', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  const order = await query(`SELECT * FROM sales_orders WHERE id=$1 AND factory_id=$2`, [
    req.params.id,
    ctx.auth.factoryId,
  ]);
  if (!order.rows[0]) return res.status(404).json({ error: 'Not found' });
  const lines = await query(`SELECT * FROM sales_order_lines WHERE order_id=$1`, [req.params.id]);
  let taxable = 0;
  let gstTotal = 0;
  const taxLines = lines.rows.map((l) => {
    const pieceValue = Number(l.wholesale_price_per_set) / Number(l.pack_size);
    const { rate, gst } = apparelGst(pieceValue);
    const lineTaxable = Number(l.line_amount);
    const lineGst = Math.round(gst * Number(l.pieces) * 100) / 100;
    taxable += lineTaxable;
    gstTotal += lineGst;
    return {
      designCode: l.design_code,
      colour: l.colour,
      pieces: l.pieces,
      pieceValue,
      rate,
      taxable: lineTaxable,
      gst: lineGst,
    };
  });
  const half = Math.round((gstTotal / 2) * 100) / 100;
  const invoiceRef = await nextDocRef(ctx.auth.factoryId, 'tax_invoice', 'TI');
  const inv = await query(
    `INSERT INTO tax_invoices
      (factory_id, order_id, invoice_ref, place_of_supply, taxable_value, cgst, sgst, igst, total, lines, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,'issued',$10) RETURNING *`,
    [
      ctx.auth.factoryId,
      req.params.id,
      invoiceRef,
      req.body.placeOfSupply || '24',
      taxable,
      half,
      gstTotal - half,
      taxable + gstTotal,
      JSON.stringify(taxLines),
      ctx.auth.userId,
    ],
  );
  res.json({ invoice: inv.rows[0] });
});

/* -------- Reports -------- */
modulesRouter.get('/reports/summary', async (req, res) => {
  const ctx = await gate(req, res);
  if (!ctx) return;
  if (!ctx.access.reports && !ctx.access.pnl) return res.status(403).json({ error: 'Forbidden' });
  const from = String(req.query.from || new Date().toISOString().slice(0, 8) + '01');
  const to = String(req.query.to || new Date().toISOString().slice(0, 10));

  const sales = await query(
    `SELECT COALESCE(SUM(total_amount),0)::float8 AS sales,
            COALESCE(SUM(total_sets),0)::int AS sets,
            COALESCE(SUM(total_pieces),0)::int AS pieces,
            COUNT(*)::int AS orders
     FROM sales_orders
     WHERE factory_id=$1 AND order_date BETWEEN $2::date AND $3::date
       AND status IN ('confirmed','dispatched','synced') AND sync_status='synced'`,
    [ctx.auth.factoryId, from, to],
  );
  const returns = await query(
    `SELECT COALESCE(SUM(total_amount),0)::float8 AS amount FROM sales_returns
     WHERE factory_id=$1 AND created_at::date BETWEEN $2::date AND $3::date`,
    [ctx.auth.factoryId, from, to],
  );
  const purchases = await query(
    `SELECT COALESCE(SUM(rl.qty*rl.unit_cost),0)::float8 AS amount
     FROM purchase_receipt_lines rl
     JOIN purchase_receipts r ON r.id=rl.receipt_id
     WHERE r.factory_id=$1 AND r.received_at BETWEEN $2::date AND $3::date`,
    [ctx.auth.factoryId, from, to],
  );
  const expenses = await query(
    `SELECT COALESCE(SUM(amount),0)::float8 AS amount FROM expenses
     WHERE factory_id=$1 AND expense_date BETWEEN $2::date AND $3::date`,
    [ctx.auth.factoryId, from, to],
  );
  const stock = await query(
    `SELECT COALESCE(SUM(on_hand*avg_cost),0)::float8 AS value,
            COALESCE(SUM(on_hand),0)::float8 AS qty
     FROM items WHERE factory_id=$1 AND NOT trashed`,
    [ctx.auth.factoryId],
  );

  const netSales = Number(sales.rows[0].sales) - Number(returns.rows[0].amount);
  // simplified COGS: use purchase receipts in period as proxy when no dispatch costing
  const cogs = Number(purchases.rows[0].amount) * 0.5; // placeholder weighted — replaced below if dispatches exist
  const dispatchCogs = await query(
    `SELECT COALESCE(SUM(d.total_amount::float8 * 0.6),0)::float8 AS cogs
     FROM dispatches d
     WHERE d.factory_id=$1 AND d.dispatched_at BETWEEN $2::date AND $3::date`,
    [ctx.auth.factoryId, from, to],
  );
  const costOfGoods = Number(dispatchCogs.rows[0].cogs) || cogs;
  const grossProfit = netSales - costOfGoods;
  const managementProfit = grossProfit - Number(expenses.rows[0].amount);

  res.json({
    from,
    to,
    sales: sales.rows[0],
    salesReturns: Number(returns.rows[0].amount),
    netSales,
    purchases: Number(purchases.rows[0].amount),
    costOfGoods,
    grossProfit,
    grossMarginPct: netSales === 0 ? null : (grossProfit / netSales) * 100,
    expenses: Number(expenses.rows[0].amount),
    managementProfit,
    stock: stock.rows[0],
  });
});
