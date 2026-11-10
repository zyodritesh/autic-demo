import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';

export function FactoriesPage() {
  const { session } = useAuth();
  const [factories, setFactories] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: '', adminMobile: '', adminName: '' });
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session) return;
    const d = await api<{ factories: Array<Record<string, unknown>> }>('/api/factories', {
      token: session.token,
    });
    setFactories(d.factories);
  }

  useEffect(() => {
    void load();
  }, [session]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const res = await api<{ factory: { name: string }; inviteToken: string }>('/api/factories', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify(form),
    });
    setMsg(`Factory ${res.factory.name} invited · token ${res.inviteToken.slice(0, 8)}…`);
    setForm({ name: '', adminMobile: '', adminName: '' });
    await load();
  }

  return (
    <AppShell title="Factories">
      {msg ? <div className="banner info">{msg}</div> : null}
      <form className="panel" onSubmit={add}>
        <h2>Add factory</h2>
        <div className="field">
          <label>Factory name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Admin name</label>
          <input
            value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Admin mobile</label>
          <input
            value={form.adminMobile}
            onChange={(e) => setForm({ ...form, adminMobile: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Create & invite
        </button>
      </form>
      <div className="list">
        {factories.map((f) => (
          <div className="list-row" key={String(f.id)}>
            <div>
              <strong>{String(f.name)}</strong>
              <div className="muted">
                {String(f.status)} · users {Number(f.user_count)} · {String(f.admin_mobile || '')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
