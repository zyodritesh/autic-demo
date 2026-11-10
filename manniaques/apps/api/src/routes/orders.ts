import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertMembershipActive,
  canViewOrder,
  requireAuth,
} from '../auth.js';
import { config } from '../config.js';
import { pool, query } from '../db/pool.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

fs.mkdirSync(config.uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

type IncomingLine = {
  catalogueItemId?: string;
  designCode: string;
  name: string;
  colour: string;
  photoUrl?: string;
  packSize: number;
  sizeBreakdown: Record<string, number>;
  wholesalePricePerSet: number;
  setQty: number;
};

type IncomingCustomer = {
  id?: string;
  clientId?: string;
  name: string;
  mobile: string;
  branch?: string;
  buyerContact?: string;
  deliveryAddress?: string;
  notes?: string;
  isNew?: boolean;
};

function calcTotals(lines: IncomingLine[]) {
  let totalSets = 0;
  let totalPieces = 0;
  let totalAmount = 0;
  const computed = lines.map((line, index) => {
    const setQty = Math.max(0, Math.floor(Number(line.setQty) || 0));
    const packSize = Number(line.packSize);
    const rate = Number(line.wholesalePricePerSet);
    const pieces = setQty * packSize;
    const lineAmount = setQty * rate;
    totalSets += setQty;
    totalPieces += pieces;
    totalAmount += lineAmount;
    return {
      ...line,
      setQty,
      packSize,
      wholesalePricePerSet: rate,
      pieces,
      lineAmount,
      sortOrder: index,
    };
  });
  return { computed, totalSets, totalPieces, totalAmount };
}

ordersRouter.get('/', async (req, res) => {
  const auth = req.auth!;
  if (!(await assertMembershipActive(auth))) {
    return res.status(403).json({ error: 'Access revoked' });
  }

  const ownOnly = auth.role === 'sales';
  const result = await query(
    `SELECT id, factory_id, client_id, order_ref, customer_id, customer_snapshot,
            delivery_note, channel, order_date, status, sync_status,
            total_sets, total_pieces, total_amount::float8 AS total_amount,
            created_by, version, review_flags, created_at, updated_at
     FROM sales_orders
     WHERE factory_id = $1 ${ownOnly ? 'AND created_by = $2' : ''}
     ORDER BY updated_at DESC
     LIMIT 100`,
    ownOnly ? [auth.factoryId, auth.userId] : [auth.factoryId],
  );
  res.json({ orders: result.rows });
});

ordersRouter.get('/:id', async (req, res) => {
  const auth = req.auth!;
  if (!(await assertMembershipActive(auth))) {
    return res.status(403).json({ error: 'Access revoked' });
  }

  const orderResult = await query(
    `SELECT * FROM sales_orders WHERE id = $1`,
    [req.params.id],
  );
  const order = orderResult.rows[0];
  if (!order || order.factory_id !== auth.factoryId) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (!canViewOrder(auth, order.created_by)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [lines, attachments] = await Promise.all([
    query(`SELECT * FROM sales_order_lines WHERE order_id = $1 ORDER BY sort_order`, [
      order.id,
    ]),
    query(
      `SELECT id, client_id, filename, mime_type,
              '/uploads/' || regexp_replace(storage_path, '.*/', '') AS url,
              created_at
       FROM sales_order_attachments WHERE order_id = $1`,
      [order.id],
    ),
  ]);

  res.json({
    order: {
      ...order,
      total_amount: Number(order.total_amount),
    },
    lines: lines.rows.map((l) => ({
      ...l,
      wholesale_price_per_set: Number(l.wholesale_price_per_set),
      line_amount: Number(l.line_amount),
    })),
    attachments: attachments.rows,
  });
});

ordersRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const auth = req.auth!;
  if (!(await assertMembershipActive(auth))) {
    return res.status(403).json({ error: 'Access revoked' });
  }

  const att = await query(
    `SELECT a.*, o.created_by, o.factory_id AS order_factory_id
     FROM sales_order_attachments a
     JOIN sales_orders o ON o.id = a.order_id
     WHERE a.id = $1 AND a.order_id = $2`,
    [req.params.attachmentId, req.params.id],
  );
  const row = att.rows[0];
  if (!row || row.factory_id !== auth.factoryId) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  if (!canViewOrder(auth, row.created_by)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(row.storage_path)) {
    return res.status(404).json({ error: 'File missing' });
  }
  res.setHeader('Content-Type', row.mime_type);
  fs.createReadStream(row.storage_path).pipe(res);
});

ordersRouter.post('/sync', async (req, res) => {
  const auth = req.auth!;
  const membership = await assertMembershipActive(auth);
  if (!membership) {
    return res.status(403).json({
      error: 'Access revoked',
      reviewAction: 'membership_revoked',
      message: 'Your access to this factory was revoked. Local draft kept for recovery.',
    });
  }

  const {
    clientId,
    idempotencyKey,
    orderRef,
    customer,
    deliveryNote,
    channel,
    orderDate,
    lines,
    version,
  } = req.body as {
    clientId: string;
    idempotencyKey: string;
    orderRef: string;
    customer: IncomingCustomer;
    deliveryNote?: string;
    channel?: string;
    orderDate?: string;
    lines: IncomingLine[];
    version?: number;
  };

  if (!clientId || !idempotencyKey || !orderRef || !customer?.name || !customer?.mobile) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Order needs at least one line' });
  }

  const { computed, totalSets, totalPieces, totalAmount } = calcTotals(lines);
  const reviewFlags: Array<{ code: string; message: string; itemId?: string }> = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Serialize retries for the same offline order / idempotency key
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [`${auth.factoryId}:${clientId}`, idempotencyKey],
    );

    const existingIdem = await client.query(
      `SELECT response_json FROM sync_idempotency
       WHERE factory_id = $1 AND user_id = $2 AND idempotency_key = $3`,
      [auth.factoryId, auth.userId, idempotencyKey],
    );
    if (existingIdem.rows[0]) {
      await client.query('COMMIT');
      return res.json(existingIdem.rows[0].response_json);
    }

    const existingOrder = await client.query(
      `SELECT id, version, created_by FROM sales_orders
       WHERE factory_id = $1 AND client_id = $2 FOR UPDATE`,
      [auth.factoryId, clientId],
    );
    if (existingOrder.rows[0]) {
      const prior = existingOrder.rows[0];
      if (version && Number(version) < Number(prior.version)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Concurrent edit',
          reviewAction: 'concurrent_edit',
          message: 'Server has a newer version. Local work kept for review.',
          serverVersion: prior.version,
        });
      }
    }

    let customerId = customer.id || null;
    if (customer.clientId) {
      const upsert = await client.query(
        `INSERT INTO customers
          (factory_id, client_id, name, mobile, branch, buyer_contact, delivery_address, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (factory_id, client_id) WHERE client_id IS NOT NULL
         DO UPDATE SET
           name = EXCLUDED.name,
           mobile = EXCLUDED.mobile,
           branch = EXCLUDED.branch,
           buyer_contact = EXCLUDED.buyer_contact,
           delivery_address = EXCLUDED.delivery_address,
           notes = EXCLUDED.notes,
           updated_at = now()
         RETURNING id`,
        [
          auth.factoryId,
          customer.clientId,
          customer.name,
          customer.mobile,
          customer.branch || null,
          customer.buyerContact || null,
          customer.deliveryAddress || null,
          customer.notes || null,
          auth.userId,
        ],
      );
      customerId = upsert.rows[0]?.id || customerId;
    }

    if (!customerId && customer.id) {
      customerId = customer.id;
    }

    if (!customerId && customer.mobile) {
      const found = await client.query(
        `SELECT id FROM customers WHERE factory_id = $1 AND mobile = $2 LIMIT 1`,
        [auth.factoryId, customer.mobile],
      );
      if (found.rows[0]) customerId = found.rows[0].id;
      else {
        const created = await client.query(
          `INSERT INTO customers
            (factory_id, client_id, name, mobile, branch, buyer_contact, delivery_address, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            auth.factoryId,
            customer.clientId || randomUUID(),
            customer.name,
            customer.mobile,
            customer.branch || null,
            customer.buyerContact || null,
            customer.deliveryAddress || null,
            customer.notes || null,
            auth.userId,
          ],
        );
        customerId = created.rows[0].id;
      }
    }

    const customerSnapshot = {
      id: customerId,
      name: customer.name,
      mobile: customer.mobile,
      branch: customer.branch || '',
      buyerContact: customer.buyerContact || customer.mobile,
      deliveryAddress: customer.deliveryAddress || '',
    };

    for (const line of computed) {
      if (!line.catalogueItemId) continue;
      const item = await client.query(
        `SELECT id, wholesale_price_per_set::float8 AS wholesale_price_per_set,
                available_sets, active, factory_id
         FROM catalogue_items WHERE id = $1 FOR UPDATE`,
        [line.catalogueItemId],
      );
      const row = item.rows[0];
      if (!row || row.factory_id !== auth.factoryId || !row.active) {
        reviewFlags.push({
          code: 'item_unavailable',
          message: `${line.designCode} ${line.colour} is no longer available`,
          itemId: line.catalogueItemId,
        });
        continue;
      }
      if (Number(row.wholesale_price_per_set) !== Number(line.wholesalePricePerSet)) {
        reviewFlags.push({
          code: 'price_changed',
          message: `${line.designCode} price changed on server (local ₹${line.wholesalePricePerSet}, server ₹${row.wholesale_price_per_set}). Local rate kept pending review.`,
          itemId: line.catalogueItemId,
        });
      }
      // Existing reservation for this order+item
      let already = 0;
      if (existingOrder.rows[0]) {
        const prev = await client.query(
          `SELECT sets_reserved FROM stock_reservations
           WHERE order_id = $1 AND catalogue_item_id = $2`,
          [existingOrder.rows[0].id, line.catalogueItemId],
        );
        already = Number(prev.rows[0]?.sets_reserved || 0);
      }
      const delta = line.setQty - already;
      if (delta > 0 && row.available_sets < delta) {
        reviewFlags.push({
          code: 'short_stock',
          message: `${line.designCode} ${line.colour}: only ${row.available_sets} sets available (requested +${delta})`,
          itemId: line.catalogueItemId,
        });
      }
    }

    const blocking = reviewFlags.filter((f) =>
      ['short_stock', 'item_unavailable'].includes(f.code),
    );
    if (blocking.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Needs review',
        reviewAction: 'stock_or_availability',
        reviewFlags,
        message: 'Local work kept. Resolve stock/availability before sync completes.',
      });
    }

    let orderId: string;
    let newVersion = 1;

    if (existingOrder.rows[0]) {
      orderId = existingOrder.rows[0].id;
      newVersion = Number(existingOrder.rows[0].version) + 1;
      // Release previous reservations back to stock
      const prevRes = await client.query(
        `SELECT catalogue_item_id, sets_reserved FROM stock_reservations WHERE order_id = $1`,
        [orderId],
      );
      for (const r of prevRes.rows) {
        await client.query(
          `UPDATE catalogue_items SET available_sets = available_sets + $1 WHERE id = $2`,
          [r.sets_reserved, r.catalogue_item_id],
        );
      }
      await client.query(`DELETE FROM stock_reservations WHERE order_id = $1`, [orderId]);
      await client.query(`DELETE FROM sales_order_lines WHERE order_id = $1`, [orderId]);

      await client.query(
        `UPDATE sales_orders SET
           order_ref = $1, customer_id = $2, customer_snapshot = $3, delivery_note = $4,
           channel = $5, order_date = COALESCE($6::date, order_date),
           total_sets = $7, total_pieces = $8, total_amount = $9,
           version = $10, review_flags = $11, sync_status = 'synced',
           updated_at = now()
         WHERE id = $12`,
        [
          orderRef,
          customerId,
          JSON.stringify(customerSnapshot),
          deliveryNote || null,
          channel || 'showroom',
          orderDate || null,
          totalSets,
          totalPieces,
          totalAmount,
          newVersion,
          JSON.stringify(reviewFlags),
          orderId,
        ],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO sales_orders
          (factory_id, client_id, order_ref, customer_id, customer_snapshot, delivery_note,
           channel, order_date, status, sync_status, total_sets, total_pieces, total_amount,
           created_by, version, review_flags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),'confirmed','synced',$9,$10,$11,$12,1,$13)
         RETURNING id, version`,
        [
          auth.factoryId,
          clientId,
          orderRef,
          customerId,
          JSON.stringify(customerSnapshot),
          deliveryNote || null,
          channel || 'showroom',
          orderDate || null,
          totalSets,
          totalPieces,
          totalAmount,
          auth.userId,
          JSON.stringify(reviewFlags),
        ],
      );
      orderId = inserted.rows[0].id;
      newVersion = inserted.rows[0].version;
    }

    for (const line of computed) {
      await client.query(
        `INSERT INTO sales_order_lines
          (order_id, factory_id, catalogue_item_id, design_code, name, colour, photo_url,
           pack_size, size_breakdown, wholesale_price_per_set, set_qty, pieces, line_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          orderId,
          auth.factoryId,
          line.catalogueItemId || null,
          line.designCode,
          line.name,
          line.colour,
          line.photoUrl || null,
          line.packSize,
          JSON.stringify(line.sizeBreakdown),
          line.wholesalePricePerSet,
          line.setQty,
          line.pieces,
          line.lineAmount,
          line.sortOrder,
        ],
      );

      if (line.catalogueItemId) {
        await client.query(
          `UPDATE catalogue_items SET available_sets = available_sets - $1 WHERE id = $2`,
          [line.setQty, line.catalogueItemId],
        );
        await client.query(
          `INSERT INTO stock_reservations (factory_id, order_id, catalogue_item_id, sets_reserved)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (order_id, catalogue_item_id)
           DO UPDATE SET sets_reserved = EXCLUDED.sets_reserved`,
          [auth.factoryId, orderId, line.catalogueItemId, line.setQty],
        );
      }
    }

    const response = {
      ok: true,
      orderId,
      clientId,
      orderRef,
      version: newVersion,
      totalSets,
      totalPieces,
      totalAmount,
      customerId,
      reviewFlags,
      syncedAt: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO sync_idempotency
        (factory_id, user_id, idempotency_key, resource_type, resource_id, response_json)
       VALUES ($1,$2,$3,'sales_order',$4,$5)
       ON CONFLICT (factory_id, user_id, idempotency_key) DO NOTHING`,
      [auth.factoryId, auth.userId, idempotencyKey, orderId, JSON.stringify(response)],
    );

    await client.query('COMMIT');
    res.json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Sync failed', detail: String(err) });
  } finally {
    client.release();
  }
});

ordersRouter.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const auth = req.auth!;
  if (!(await assertMembershipActive(auth))) {
    return res.status(403).json({ error: 'Access revoked' });
  }
  if (!req.file) return res.status(400).json({ error: 'file required' });

  const orderResult = await query(`SELECT * FROM sales_orders WHERE id = $1`, [
    req.params.id,
  ]);
  const order = orderResult.rows[0];
  if (!order || order.factory_id !== auth.factoryId) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Order not found' });
  }
  if (!canViewOrder(auth, order.created_by)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Forbidden' });
  }

  const clientId = req.body.clientId || randomUUID();
  try {
    const inserted = await query(
      `INSERT INTO sales_order_attachments
        (order_id, factory_id, client_id, filename, mime_type, storage_path)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (factory_id, client_id) WHERE client_id IS NOT NULL
       DO UPDATE SET
         filename = EXCLUDED.filename,
         mime_type = EXCLUDED.mime_type,
         storage_path = EXCLUDED.storage_path,
         order_id = EXCLUDED.order_id
       RETURNING id, client_id, filename, mime_type`,
      [
        order.id,
        auth.factoryId,
        clientId,
        req.file.originalname || req.file.filename,
        req.file.mimetype,
        req.file.path,
      ],
    );

    res.json({
      attachment: {
        ...inserted.rows[0],
        url: `/uploads/${path.basename(req.file.path)}`,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Attachment upload failed', detail: String(err) });
  }
});

