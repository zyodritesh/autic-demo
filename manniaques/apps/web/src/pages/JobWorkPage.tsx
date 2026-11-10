import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr, uuid } from '../lib/ids';

export function JobWorkListPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!session) return;
    void api<{ orders: Array<Record<string, unknown>> }>('/api/job-work', { token: session.token }).then(
      (d) => setOrders(d.orders),
    );
  }, [session]);

  return (
    <AppShell title="Job work">
      <div className="method-tabs">
        <Link className="btn btn-primary" to="/jobwork/new">
          New order
        </Link>
      </div>
      <div className="list">
        {orders.map((o) => (
          <div className="list-row" key={String(o.id)}>
            <div>
              <strong>{String(o.jw_ref)}</strong>
              <div className="muted">
                {String(o.process)} · {String(o.status)} · target {Number(o.target_qty)} · accepted{' '}
                {Number(o.accepted_qty)}
              </div>
            </div>
            <Link className="btn btn-secondary" to={`/jobwork/${o.id}`}>
              Open
            </Link>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function JobWorkNewPage() {
  const { session } = useAuth();
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [styles, setStyles] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    vendorId: '',
    styleId: '',
    process: 'stitching',
    targetQty: '100',
    rate: '80',
    dueDate: '',
  });
  const [createdId, setCreatedId] = useState('');

  useEffect(() => {
    if (!session) return;
    void Promise.all([
      api<{ vendors: Array<Record<string, unknown>> }>('/api/vendors', { token: session.token }),
      api<{ styles: Array<Record<string, unknown>> }>('/api/styles', { token: session.token }),
    ]).then(([v, s]) => {
      const karigars = v.vendors.filter((x) => x.is_karigar);
      setVendors(karigars.length ? karigars : v.vendors);
      setStyles(s.styles);
      setForm((f) => ({
        ...f,
        vendorId: String((karigars[0] || v.vendors[0])?.id || ''),
        styleId: String(s.styles[0]?.id || ''),
      }));
    });
  }, [session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const vendor = vendors.find((v) => String(v.id) === form.vendorId);
    const res = await api<{ order: { id: string } }>('/api/job-work', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        clientId: uuid(),
        vendorId: form.vendorId,
        vendorSnapshot: vendor || {},
        styleId: form.styleId || undefined,
        process: form.process,
        targetQty: Number(form.targetQty),
        rateBasis: 'per_piece',
        rate: Number(form.rate),
        dueDate: form.dueDate || undefined,
        status: 'draft',
      }),
    });
    setCreatedId(res.order.id);
  }

  return (
    <AppShell title="New job work">
      <form className="panel" onSubmit={onSubmit}>
        <div className="field">
          <label>Karigar</label>
          <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
            {vendors.map((v) => (
              <option key={String(v.id)} value={String(v.id)}>
                {String(v.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Style</label>
          <select value={form.styleId} onChange={(e) => setForm({ ...form, styleId: e.target.value })}>
            {styles.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {String(s.design_code)} · {String(s.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Process</label>
          <select value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>
            {['printing', 'cutting', 'stitching', 'finishing', 'packing'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Target qty (pieces)</label>
          <input value={form.targetQty} onChange={(e) => setForm({ ...form, targetQty: e.target.value })} />
        </div>
        <div className="field">
          <label>Rate / piece</label>
          <input value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
        </div>
        <div className="field">
          <label>Due date</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Save draft
        </button>
      </form>
      {createdId ? (
        <Link className="btn btn-secondary" to={`/jobwork/${createdId}`}>
          Open order
        </Link>
      ) : null}
    </AppShell>
  );
}

export function JobWorkDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState<{
    order: Record<string, unknown>;
    materials: Array<Record<string, unknown>>;
  } | null>(null);
  const [msg, setMsg] = useState('');
  const [receive, setReceive] = useState({ acceptedQty: '70', reworkQty: '0', rejectedQty: '0' });

  async function load() {
    if (!session || !id) return;
    const d = await api<{ order: Record<string, unknown>; materials: Array<Record<string, unknown>> }>(
      `/api/job-work/${id}`,
      { token: session.token },
    );
    setData(d);
  }

  useEffect(() => {
    void load();
  }, [session, id]);

  if (!data) return <AppShell title="Job work">Loading…</AppShell>;
  const o = data.order;
  const pending = Number(o.target_qty) - Number(o.accepted_qty);

  return (
    <AppShell title={String(o.jw_ref)}>
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="panel">
        <div>
          {String(o.process)} · {String(o.status)}
        </div>
        <div className="muted">
          Target {Number(o.target_qty)} · Accepted {Number(o.accepted_qty)} · Pending {pending} · Billable{' '}
          {inr(Number(o.billed_amount))}
        </div>
        <h3 style={{ marginTop: 12 }}>Materials</h3>
        {data.materials.map((m) => (
          <div key={String(m.id)} className="muted">
            {String(m.item_name)} · planned {Number(m.qty_planned)} · issued {Number(m.qty_issued)}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (!session || !id) return;
              await api(`/api/job-work/${id}/confirm`, { method: 'POST', token: session.token });
              setMsg('Confirmed / issued');
              await load();
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (!session || !id) return;
              await api(`/api/job-work/${id}/issue`, {
                method: 'POST',
                token: session.token,
                body: JSON.stringify({
                  lines: data.materials.map((m) => ({
                    materialId: m.id,
                    itemId: m.item_id,
                    qty: Number(m.qty_planned) - Number(m.qty_issued),
                  })),
                }),
              });
              setMsg('Material sent');
              await load();
            }}
          >
            Send material
          </button>
        </div>
      </div>

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!session || !id) return;
          const res = await api<{ pending: number; billable: number }>(`/api/job-work/${id}/receive`, {
            method: 'POST',
            token: session.token,
            body: JSON.stringify({
              acceptedQty: Number(receive.acceptedQty),
              reworkQty: Number(receive.reworkQty),
              rejectedQty: Number(receive.rejectedQty),
            }),
          });
          setMsg(`Received · pending ${res.pending} · billable ${inr(res.billable)}`);
          await load();
        }}
      >
        <h2>Receive work</h2>
        <div className="field">
          <label>Accepted</label>
          <input
            value={receive.acceptedQty}
            onChange={(e) => setReceive({ ...receive, acceptedQty: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Rework</label>
          <input
            value={receive.reworkQty}
            onChange={(e) => setReceive({ ...receive, reworkQty: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Rejected</label>
          <input
            value={receive.rejectedQty}
            onChange={(e) => setReceive({ ...receive, rejectedQty: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Save receipt
        </button>
      </form>
    </AppShell>
  );
}
