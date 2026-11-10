import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr } from '../lib/ids';

export function AgentsPage() {
  const { session } = useAuth();
  const [lines, setLines] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<Array<Record<string, unknown>>>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session) return;
    const d = await api<{
      lines: Array<Record<string, unknown>>;
      summary: Array<Record<string, unknown>>;
    }>('/api/agents', { token: session.token });
    setLines(d.lines);
    setSummary(d.summary);
  }

  useEffect(() => {
    void load();
  }, [session]);

  return (
    <AppShell title="Agents">
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="panel">
        <h2>Payable summary</h2>
        {summary.map((s) => (
          <div key={String(s.agent_id)} className="list-row">
            <div>
              <strong>Due {inr(Number(s.due))}</strong>
              <div className="muted">
                Earned {inr(Number(s.earned))} · Reversed {inr(Number(s.reversed))} · Paid{' '}
                {inr(Number(s.paid))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                if (!session) return;
                const due = Number(s.due);
                if (due <= 0) return;
                await api('/api/agents/payout', {
                  method: 'POST',
                  token: session.token,
                  body: JSON.stringify({
                    agentId: s.agent_id,
                    amount: due,
                    lineIds: lines
                      .filter((l) => l.agent_id === s.agent_id)
                      .map((l) => l.id),
                  }),
                });
                setMsg('Payout posted');
                await load();
              }}
            >
              Pay due
            </button>
          </div>
        ))}
      </div>
      <div className="list">
        {lines.map((l) => (
          <div className="list-row" key={String(l.id)}>
            <div>
              <strong>{String(l.agent_name || l.agent_id)}</strong>
              <div className="muted">
                Base {inr(Number(l.base_amount))} @ {Number(l.rate_pct)}% · earned{' '}
                {inr(Number(l.earned))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
