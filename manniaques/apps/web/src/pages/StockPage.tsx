import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr } from '../lib/ids';

export function StockPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [finished, setFinished] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session) return;
    const [stock, ord] = await Promise.all([
      api<{ items: Array<Record<string, unknown>>; finished: Array<Record<string, unknown>> }>(
        '/api/stock',
        { token: session.token },
      ),
      api<{ orders: Array<Record<string, unknown>> }>('/api/orders', { token: session.token }),
    ]);
    setItems(stock.items);
    setFinished(stock.finished);
    setOrders(ord.orders.filter((o) => String(o.status) !== 'dispatched').slice(0, 20));
  }

  useEffect(() => {
    void load();
  }, [session]);

  return (
    <AppShell title="Stock" wide>
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="page-grid">
      <div className="panel span-2">
        <h2>Raw materials</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((i) => i.item_type === 'raw')
                .map((i) => (
                  <tr key={String(i.id)}>
                    <td>
                      {String(i.code)} · {String(i.name)}
                    </td>
                    <td>
                      {Number(i.on_hand)} {String(i.stock_unit)}
                    </td>
                    <td>{Number(i.reserved)}</td>
                    <td>{Number(i.available)}</td>
                    <td>{inr(Number(i.on_hand) * Number(i.avg_cost))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Finished sets available</h2>
        {finished.map((f) => {
          const breakdown = (f.size_breakdown || {}) as Record<string, number>;
          return (
            <div className="list-row" key={String(f.id)}>
              <div>
                <strong>
                  {String(f.design_code)} · {String(f.colour)}
                </strong>
                <div className="muted">
                  {Number(f.available_sets)} sets · pack {Number(f.pack_size)} ·{' '}
                  {Object.entries(breakdown)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(' ')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>Dispatch sale</h2>
        {orders.map((o) => (
          <div className="list-row" key={String(o.id)}>
            <div>
              <strong>{String(o.order_ref)}</strong>
              <div className="muted">{inr(Number(o.total_amount))}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                if (!session) return;
                await api(`/api/orders/${o.id}/dispatch`, {
                  method: 'POST',
                  token: session.token,
                });
                setMsg(`Dispatched ${o.order_ref}`);
                await load();
              }}
            >
              Dispatch
            </button>
          </div>
        ))}
      </div>
      </div>
    </AppShell>
  );
}
