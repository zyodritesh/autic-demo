import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';

export function TeamPage() {
  const { session } = useAuth();
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [invites, setInvites] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: '', mobile: '', role: 'sales' });
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session) return;
    const d = await api<{ members: Array<Record<string, unknown>>; invites: Array<Record<string, unknown>> }>(
      '/api/team',
      { token: session.token },
    );
    setMembers(d.members);
    setInvites(d.invites);
  }

  useEffect(() => {
    void load();
  }, [session]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const res = await api<{ invite: { token: string } }>('/api/team/invite', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        name: form.name,
        mobile: form.mobile,
        roles: [form.role],
      }),
    });
    setMsg(`Invite created · token ${res.invite.token.slice(0, 8)}…`);
    setForm({ name: '', mobile: '', role: 'sales' });
    await load();
  }

  return (
    <AppShell title="Team">
      {msg ? <div className="banner info">{msg}</div> : null}
      <form className="panel" onSubmit={invite}>
        <h2>Add staff</h2>
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Mobile</label>
          <input
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {['sales', 'purchase', 'production', 'stores', 'accounts', 'agent', 'factory_admin'].map(
              (r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ),
            )}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Invite
        </button>
      </form>

      <div className="panel">
        <h2>Members</h2>
        {members.map((m) => (
          <div className="list-row" key={String(m.id)}>
            <div>
              <strong>{String(m.name)}</strong>
              <div className="muted">
                {String(m.mobile)} · {(m.roles as string[])?.join(', ') || String(m.role)} ·{' '}
                {String(m.status)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Invites</h2>
        {invites.map((i) => (
          <div className="list-row" key={String(i.id)}>
            <div>
              <strong>{String(i.mobile)}</strong>
              <div className="muted">
                {String(i.status)} · {(i.roles as string[])?.join(', ')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
