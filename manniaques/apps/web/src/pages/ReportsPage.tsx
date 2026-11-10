import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr } from '../lib/ids';

export function ReportsPage() {
  const { session } = useAuth();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  async function load() {
    if (!session) return;
    const d = await api<Record<string, unknown>>(
      `/api/reports/summary?from=${from}&to=${to}`,
      { token: session.token },
    );
    setReport(d);
  }

  useEffect(() => {
    void load();
  }, [session]);

  return (
    <AppShell title="Reports" wide>
      <div className="page-grid">
      <div className="panel">
        <h2>Period</h2>
        <div className="field">
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Run
        </button>
      </div>

      {report ? (
        <div className="panel">
          <h2>Sales · Purchases · P&L</h2>
          <div className="list">
            <div className="list-row">
              <span>Sales</span>
              <strong>{inr(Number((report.sales as { sales: number }).sales))}</strong>
            </div>
            <div className="list-row">
              <span>Sales returns</span>
              <strong>{inr(Number(report.salesReturns))}</strong>
            </div>
            <div className="list-row">
              <span>Net sales</span>
              <strong>{inr(Number(report.netSales))}</strong>
            </div>
            <div className="list-row">
              <span>Purchases (receipts)</span>
              <strong>{inr(Number(report.purchases))}</strong>
            </div>
            <div className="list-row">
              <span>Cost of goods</span>
              <strong>{inr(Number(report.costOfGoods))}</strong>
            </div>
            <div className="list-row">
              <span>Gross profit</span>
              <strong>{inr(Number(report.grossProfit))}</strong>
            </div>
            <div className="list-row">
              <span>Gross margin</span>
              <strong>
                {report.grossMarginPct == null
                  ? '—'
                  : `${Number(report.grossMarginPct).toFixed(1)}%`}
              </strong>
            </div>
            <div className="list-row">
              <span>Expenses</span>
              <strong>{inr(Number(report.expenses))}</strong>
            </div>
            <div className="list-row">
              <span>Management profit</span>
              <strong>{inr(Number(report.managementProfit))}</strong>
            </div>
            <div className="list-row">
              <span>Stock value</span>
              <strong>{inr(Number((report.stock as { value: number }).value))}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel muted">Pick a period and run the report.</div>
      )}
      </div>
    </AppShell>
  );
}
