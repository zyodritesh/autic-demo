import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr, uuid } from '../lib/ids';

export function PartiesPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<'customers' | 'vendors'>('customers');
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [statement, setStatement] = useState<Record<string, unknown> | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: '', mobile: '', isKarigar: false });

  async function load() {
    if (!session) return;
    const cache = await api<{ customers: Array<Record<string, unknown>> }>('/api/cache/bootstrap', {
      token: session.token,
    });
    setCustomers(cache.customers || []);
    const v = await api<{ vendors: Array<Record<string, unknown>> }>('/api/vendors', {
      token: session.token,
    });
    setVendors(v.vendors);
  }

  useEffect(() => {
    void load();
  }, [session]);

  return (
    <AppShell title="Parties">
      <div className="method-tabs">
        <button
          type="button"
          className={`btn btn-secondary ${tab === 'customers' ? 'active' : ''}`}
          onClick={() => setTab('customers')}
        >
          Customers
        </button>
        <button
          type="button"
          className={`btn btn-secondary ${tab === 'vendors' ? 'active' : ''}`}
          onClick={() => setTab('vendors')}
        >
          Vendors
        </button>
      </div>

      {tab === 'customers' ? (
        <div className="list">
          {customers.map((c) => (
            <div className="list-row" key={String(c.id)}>
              <div>
                <strong>{String(c.name)}</strong>
                <div className="muted">
                  {String(c.mobile)} · {String(c.branch || '')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link className="btn btn-secondary" to="/sale">
                  New sale
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    if (!session) return;
                    const s = await api<Record<string, unknown>>(`/api/customers/${c.id}/statement`, {
                      token: session.token,
                    });
                    setStatement(s);
                  }}
                >
                  Statement
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!session) return;
              await api('/api/vendors', {
                method: 'POST',
                token: session.token,
                body: JSON.stringify({ ...vendorForm, clientId: uuid() }),
              });
              setVendorForm({ name: '', mobile: '', isKarigar: false });
              await load();
            }}
          >
            <h2>Quick-add vendor</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={vendorForm.name}
                onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Mobile</label>
              <input
                value={vendorForm.mobile}
                onChange={(e) => setVendorForm({ ...vendorForm, mobile: e.target.value })}
                required
              />
            </div>
            <label className="muted">
              <input
                type="checkbox"
                checked={vendorForm.isKarigar}
                onChange={(e) => setVendorForm({ ...vendorForm, isKarigar: e.target.checked })}
              />{' '}
              Karigar / job worker
            </label>
            <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>
              Save vendor
            </button>
          </form>
          <div className="list">
            {vendors.map((v) => (
              <div className="list-row" key={String(v.id)}>
                <div>
                  <strong>{String(v.name)}</strong>
                  <div className="muted">
                    {String(v.mobile)}
                    {v.is_karigar ? ' · Karigar' : ''}
                  </div>
                </div>
                <Link className="btn btn-secondary" to="/purchase/new">
                  New purchase
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {statement ? (
        <div className="panel">
          <h2>Customer statement</h2>
          <div className="muted">Receivable {inr(Number(statement.receivable || 0))}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {JSON.stringify(statement.orders, null, 2)}
          </pre>
        </div>
      ) : null}
    </AppShell>
  );
}
