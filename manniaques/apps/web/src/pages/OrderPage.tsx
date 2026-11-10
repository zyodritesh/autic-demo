import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { getDb, type LocalOrder } from '../db/local';
import { inr } from '../lib/ids';
import { syncOrder } from '../lib/sync';
import { api } from '../lib/api';
import { AppShell } from '../components/AppShell';

export function OrderPage() {
  const { orderId } = useParams();
  const { session, online } = useAuth();
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [msg, setMsg] = useState('');

  async function reload() {
    if (!session || !orderId) return;
    const row = await getDb(session.factoryId, session.userId).orders.get(orderId);
    setOrder(row || null);
  }

  useEffect(() => {
    void reload();
  }, [session, orderId]);

  useEffect(() => {
    if (!session || !order) return;
    if (online && order.syncStatus !== 'synced') {
      void syncOrder(session, order.id).then((r) => {
        setOrder(r.order);
        setMsg(r.ok ? 'Synced' : r.error || 'Needs review');
      });
    }
  }, [online, session, order?.id]);

  async function retry() {
    if (!session || !order) return;
    setMsg('Syncing…');
    const r = await syncOrder(session, order.id);
    setOrder(r.order);
    setMsg(r.ok ? 'Synced' : r.error || 'Needs review');
  }

  async function share() {
    if (!order) return;
    const text = [
      `Manniaques sales order ${order.orderRef}`,
      order.customer.name,
      `${order.totalSets} sets · ${order.totalPieces} pieces · ${inr(order.totalAmount)}`,
      order.deliveryNote ? `Note: ${order.deliveryNote}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (navigator.share) {
      await navigator.share({ title: order.orderRef, text });
    } else {
      await navigator.clipboard.writeText(text);
      setMsg('Order summary copied');
    }
  }

  if (!order) return <AppShell title="Buyer order"><div className="muted">Loading order…</div></AppShell>;

  const waiting = order.syncStatus !== 'synced';

  return (
    <AppShell title={`Order · ${order.orderRef}`} wide>
      <div className="form-actions no-print" style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print / PDF
        </button>
        <button className="btn btn-secondary" onClick={share}>
          Share
        </button>
      </div>

      {waiting ? (
        <div className="banner info no-print">Saved on phone · Waiting to sync</div>
      ) : (
        <div className="banner info no-print">Synced</div>
      )}
      {order.reviewFlags?.length ? (
        <div className="banner error no-print">
          {order.reviewFlags.map((f) => (
            <div key={f.code + f.message}>{f.message}</div>
          ))}
        </div>
      ) : null}
      {msg ? <div className="muted no-print">{msg}</div> : null}
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={retry} disabled={!online}>
          Retry sync
        </button>
        <Link className="btn btn-ghost" to={`/sale/${order.id}`}>
          Edit draft
        </Link>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!online || !order.serverId}
          onClick={async () => {
            if (!session || !order.serverId) return;
            const inv = await api<{ invoice: { invoice_ref: string; total: number } }>(
              `/api/orders/${order.serverId}/tax-invoice`,
              { method: 'POST', token: session.token, body: JSON.stringify({}) },
            );
            setMsg(`Tax invoice ${inv.invoice.invoice_ref} · ${inr(Number(inv.invoice.total))}`);
          }}
        >
          GST invoice
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const text = `Order ${order.orderRef} · ${order.customer.name} · ${inr(order.totalAmount)}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
          }}
        >
          WhatsApp
        </button>
      </div>

      <div className="order-sheet">
        <h1>Manniaques</h1>
        <p style={{ margin: 0 }}>Sales order (not a tax invoice)</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
          <div>
            <strong>{order.customer.name}</strong>
            <div>{order.customer.branch}</div>
            <div>{order.customer.buyerContact || order.customer.mobile}</div>
            <div>{order.customer.deliveryAddress}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>
              <strong>{order.orderRef}</strong>
            </div>
            <div>{order.orderDate}</div>
            <div>{order.channel}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Design</th>
              <th>Pack</th>
              <th>Sets</th>
              <th>Pieces</th>
              <th>Rate/set</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {line.photoUrl ? <img src={line.photoUrl} alt="" /> : null}
                    <div>
                      <div>
                        {line.designCode} · {line.colour}
                      </div>
                      <div className="size-break">
                        {Object.entries(line.sizeBreakdown)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(' · ')}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{line.packSize}</td>
                <td>{line.setQty}</td>
                <td>{line.setQty * line.packSize}</td>
                <td>{inr(line.wholesalePricePerSet)}</td>
                <td>{inr(line.setQty * line.wholesalePricePerSet)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <div>Total sets: <strong>{order.totalSets}</strong></div>
          <div>Total pieces: <strong>{order.totalPieces}</strong></div>
          <div style={{ fontSize: '1.2rem' }}>
            Total: <strong>{inr(order.totalAmount)}</strong>
          </div>
        </div>

        {order.deliveryNote ? (
          <p style={{ marginTop: 16 }}>
            <strong>Delivery notes:</strong> {order.deliveryNote}
          </p>
        ) : null}

        {order.attachments.length > 0 ? (
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Reference photos attached for factory use (hidden from buyer print when internal).
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
