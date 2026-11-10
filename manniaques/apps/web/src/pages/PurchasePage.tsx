import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr, uuid } from '../lib/ids';

export function PurchaseListPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!session) return;
    void api<{ orders: Array<Record<string, unknown>> }>('/api/purchase-orders', {
      token: session.token,
    }).then((d) => setOrders(d.orders));
  }, [session]);

  return (
    <AppShell title="Purchase">
      <Link className="btn btn-primary" to="/purchase/new">
        New purchase
      </Link>
      <div className="list" style={{ marginTop: 14 }}>
        {orders.map((o) => (
          <div className="list-row" key={String(o.id)}>
            <div>
              <strong>{String(o.po_ref)}</strong>
              <div className="muted">
                {String(o.status)} · {inr(Number(o.total_amount))}
              </div>
            </div>
            <Link className="btn btn-secondary" to={`/purchase/${o.id}`}>
              Open
            </Link>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function PurchaseNewPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [lines, setLines] = useState([
    { itemId: '', itemName: '', stockUnit: 'metre', qty: '60', rate: '100', uncertain: false },
  ]);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!session) return;
    void Promise.all([
      api<{ vendors: Array<Record<string, unknown>> }>('/api/vendors', { token: session.token }),
      api<{ items: Array<Record<string, unknown>> }>('/api/items?type=raw', { token: session.token }),
    ]).then(([v, i]) => {
      setVendors(v.vendors);
      setItems(i.items);
      if (v.vendors[0]) setVendorId(String(v.vendors[0].id));
      if (i.items[0]) {
        setLines([
          {
            itemId: String(i.items[0].id),
            itemName: String(i.items[0].name),
            stockUnit: String(i.items[0].stock_unit || 'metre'),
            qty: '60',
            rate: String(i.items[0].last_received_cost || i.items[0].starting_unit_cost || 100),
            uncertain: false,
          },
        ]);
      }
    });
  }, [session]);

  async function saveDraft(status = 'draft') {
    if (!session) return;
    const vendor = vendors.find((v) => String(v.id) === vendorId);
    const res = await api<{ order: { id: string; po_ref: string } }>('/api/purchase-orders', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        clientId: uuid(),
        vendorId,
        vendorSnapshot: vendor || {},
        photoUrl: photoUrl || undefined,
        status,
        lines: lines.map((l) => ({
          itemId: l.itemId || undefined,
          itemName: l.itemName,
          stockUnit: l.stockUnit,
          qty: Number(l.qty),
          rate: Number(l.rate),
          uncertain: l.uncertain,
        })),
      }),
    });
    setSaved(`Draft saved · ${res.order.po_ref}`);
    navigate(`/purchase/${res.order.id}`);
  }

  return (
    <AppShell title="New purchase" wide>
      {saved ? <div className="banner info">{saved}</div> : null}
      <div className="page-grid">
      <div className="panel">
        <h2>Photo</h2>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              setPhotoUrl(String(reader.result));
              setSaved('Photo saved · draft ready');
            };
            reader.readAsDataURL(file);
          }}
        />
        {photoUrl ? (
          <img src={photoUrl} alt="PO slip" style={{ maxWidth: '100%', marginTop: 8, borderRadius: 12 }} />
        ) : null}
        <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => void saveDraft()}>
          Save draft now
        </button>
      </div>

      <div className="panel">
        <h2>Supplier & lines</h2>
        <div className="field">
          <label>Vendor</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => (
              <option key={String(v.id)} value={String(v.id)}>
                {String(v.name)}
              </option>
            ))}
          </select>
        </div>
        {lines.map((l, idx) => (
          <div key={idx} className="panel" style={{ background: 'rgba(0,0,0,0.15)' }}>
            <div className="field">
              <label>Item</label>
              <select
                value={l.itemId}
                onChange={(e) => {
                  const item = items.find((i) => String(i.id) === e.target.value);
                  const next = [...lines];
                  next[idx] = {
                    ...l,
                    itemId: e.target.value,
                    itemName: String(item?.name || ''),
                    stockUnit: String(item?.stock_unit || 'metre'),
                    rate: String(item?.last_received_cost || item?.starting_unit_cost || l.rate),
                  };
                  setLines(next);
                }}
              >
                {items.map((i) => (
                  <option key={String(i.id)} value={String(i.id)}>
                    {String(i.code)} · {String(i.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Qty ({l.stockUnit})</label>
              <input
                value={l.qty}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...l, qty: e.target.value };
                  setLines(next);
                }}
              />
            </div>
            <div className="field">
              <label>Rate</label>
              <input
                value={l.rate}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...l, rate: e.target.value };
                  setLines(next);
                }}
              />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => void saveDraft('confirmed')}>
          Confirm PO
        </button>
      </div>
      </div>
    </AppShell>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState<{ order: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(
    null,
  );
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session || !id) return;
    const d = await api<{ order: Record<string, unknown>; lines: Array<Record<string, unknown>> }>(
      `/api/purchase-orders/${id}`,
      { token: session.token },
    );
    setData(d);
  }

  useEffect(() => {
    void load();
  }, [session, id]);

  if (!data) return <AppShell title="PO">Loading…</AppShell>;

  return (
    <AppShell title={String(data.order.po_ref)}>
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="panel">
        <div className="muted">Status {String(data.order.status)}</div>
        <div>Total {inr(Number(data.order.total_amount))}</div>
        <div className="list" style={{ marginTop: 10 }}>
          {data.lines.map((l) => (
            <div key={String(l.id)} className="list-row">
              <div>
                <strong>{String(l.item_name)}</strong>
                <div className="muted">
                  {Number(l.qty)} {String(l.stock_unit)} @ ₹{Number(l.rate)} · received{' '}
                  {Number(l.qty_received)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (!session || !id) return;
              await api(`/api/purchase-orders/${id}/receive`, {
                method: 'POST',
                token: session.token,
                body: JSON.stringify({
                  lines: data.lines.map((l) => ({
                    poLineId: l.id,
                    itemId: l.item_id,
                    qty: Number(l.qty) - Number(l.qty_received),
                    unitCost: Number(l.rate),
                  })),
                }),
              });
              setMsg('Goods received · stock updated');
              await load();
            }}
          >
            Receive goods
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              if (!session || !id) return;
              await api(`/api/purchase-orders/${id}/trash`, { method: 'POST', token: session.token });
              setMsg('Moved to trash');
            }}
          >
            Trash
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (!session || !id) return;
              await api(`/api/purchase-orders/${id}/restore`, { method: 'POST', token: session.token });
              setMsg('Restored');
              await load();
            }}
          >
            Restore
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const text = `PO ${data.order.po_ref} total ${inr(Number(data.order.total_amount))}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }}
          >
            WhatsApp
          </button>
        </div>
      </div>
    </AppShell>
  );
}
