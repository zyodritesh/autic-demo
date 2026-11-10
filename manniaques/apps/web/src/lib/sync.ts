import { api, ApiError } from './api';
import { calcOrderTotals, getDb, type LocalOrder, type SessionRecord } from '../db/local';

export async function saveOrder(session: SessionRecord, order: LocalOrder) {
  const totals = calcOrderTotals(order.lines);
  const next: LocalOrder = {
    ...order,
    ...totals,
    factoryId: session.factoryId,
    userId: session.userId,
    updatedAt: new Date().toISOString(),
  };
  const db = getDb(session.factoryId, session.userId);
  await db.orders.put(next);
  return next;
}

export async function syncOrder(session: SessionRecord, orderId: string) {
  const db = getDb(session.factoryId, session.userId);
  const order = await db.orders.get(orderId);
  if (!order) throw new Error('Order not found');

  order.syncStatus = 'pending';
  await db.orders.put(order);

  try {
    const result = await api<{
      ok: boolean;
      orderId: string;
      version: number;
      customerId?: string;
      reviewFlags?: Array<{ code: string; message: string }>;
      syncedAt: string;
    }>('/api/orders/sync', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        clientId: order.id,
        idempotencyKey: order.idempotencyKey,
        orderRef: order.orderRef,
        version: order.version,
        customer: {
          id: order.customer.serverId,
          clientId: order.customer.clientId,
          name: order.customer.name,
          mobile: order.customer.mobile,
          branch: order.customer.branch,
          buyerContact: order.customer.buyerContact,
          deliveryAddress: order.customer.deliveryAddress,
          notes: order.customer.notes,
          isNew: order.customer.isNew,
        },
        deliveryNote: order.deliveryNote,
        channel: order.channel || 'showroom',
        orderDate: order.orderDate,
        lines: order.lines.map((l) => ({
          catalogueItemId: l.catalogueItemId,
          designCode: l.designCode,
          name: l.name,
          colour: l.colour,
          photoUrl: l.photoUrl,
          packSize: l.packSize,
          sizeBreakdown: l.sizeBreakdown,
          wholesalePricePerSet: l.wholesalePricePerSet,
          setQty: l.setQty,
        })),
      }),
    });

    order.serverId = result.orderId;
    order.version = result.version;
    order.syncStatus = 'synced';
    order.status = result.reviewFlags?.length ? 'needs_review' : 'synced';
    order.reviewFlags = result.reviewFlags;
    if (result.customerId) order.customer.serverId = result.customerId;
    order.customer.isNew = false;

    // Sync attachments
    for (const att of order.attachments) {
      if (att.synced || (!att.blob && !att.dataUrl)) continue;
      const form = new FormData();
      form.append('clientId', att.id);
      if (att.blob) {
        form.append('file', att.blob, att.filename);
      } else if (att.dataUrl) {
        const blob = await (await fetch(att.dataUrl)).blob();
        form.append('file', blob, att.filename);
      }
      await api(`/api/orders/${result.orderId}/attachments`, {
        method: 'POST',
        token: session.token,
        body: form,
      });
      att.synced = true;
    }

    await db.orders.put(order);
    return { ok: true as const, order };
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as {
        reviewAction?: string;
        reviewFlags?: Array<{ code: string; message: string }>;
        message?: string;
        error?: string;
      };
      order.syncStatus = 'error';
      order.status = 'needs_review';
      order.reviewFlags = body.reviewFlags || [
        { code: body.reviewAction || 'sync_error', message: body.message || body.error || err.message },
      ];
      order.reviewMessage = body.message || body.error || err.message;
      await db.orders.put(order);
      return { ok: false as const, order, error: order.reviewMessage };
    }
    order.syncStatus = 'error';
    order.reviewMessage = err instanceof Error ? err.message : 'Sync failed';
    await db.orders.put(order);
    return { ok: false as const, order, error: order.reviewMessage };
  }
}

export async function syncPending(session: SessionRecord) {
  if (!navigator.onLine) return [];
  const db = getDb(session.factoryId, session.userId);
  const pending = await db.orders
    .where('syncStatus')
    .anyOf(['pending', 'error', 'local'])
    .filter((o) => o.status === 'generated' || o.status === 'needs_review' || o.syncStatus === 'pending')
    .toArray();

  const results = [];
  for (const order of pending) {
    if (order.status === 'draft') continue;
    results.push(await syncOrder(session, order.id));
  }
  return results;
}
