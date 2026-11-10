import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr } from '../lib/ids';

export function PaymentsPage() {
  const { session } = useAuth();
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    direction: 'in',
    partyType: 'customer',
    partyId: '',
    amount: '',
    mode: 'upi',
  });
  const [expense, setExpense] = useState({ category: 'Rent', amount: '', note: '' });
  const [msg, setMsg] = useState('');

  async function load() {
    if (!session) return;
    const [p, cache, v] = await Promise.all([
      api<{ payments: Array<Record<string, unknown>> }>('/api/payments', { token: session.token }),
      api<{ customers: Array<Record<string, unknown>> }>('/api/cache/bootstrap', { token: session.token }),
      api<{ vendors: Array<Record<string, unknown>> }>('/api/vendors', { token: session.token }),
    ]);
    setPayments(p.payments);
    setCustomers(cache.customers);
    setVendors(v.vendors);
    setForm((f) => ({
      ...f,
      partyId: String(cache.customers[0]?.id || v.vendors[0]?.id || ''),
    }));
  }

  useEffect(() => {
    void load();
  }, [session]);

  async function postPayment(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    await api('/api/payments', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        direction: form.direction,
        partyType: form.partyType,
        partyId: form.partyId,
        amount: Number(form.amount),
        mode: form.mode,
      }),
    });
    setMsg('Payment posted');
    setForm({ ...form, amount: '' });
    await load();
  }

  return (
    <AppShell title="Payments" wide>
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="page-grid">
      <form className="panel" onSubmit={postPayment}>
        <h2>Receive or pay</h2>
        <div className="field">
          <label>Direction</label>
          <select
            value={form.direction}
            onChange={(e) =>
              setForm({
                ...form,
                direction: e.target.value,
                partyType: e.target.value === 'in' ? 'customer' : 'vendor',
              })
            }
          >
            <option value="in">Receive money</option>
            <option value="out">Pay money</option>
          </select>
        </div>
        <div className="field">
          <label>Party</label>
          <select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
            {(form.partyType === 'customer' ? customers : vendors).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount</label>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="field">
          <label>Mode</label>
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Post
        </button>
      </form>

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!session) return;
          await api('/api/expenses', {
            method: 'POST',
            token: session.token,
            body: JSON.stringify({
              category: expense.category,
              amount: Number(expense.amount),
              note: expense.note,
            }),
          });
          setMsg('Expense saved');
          setExpense({ ...expense, amount: '' });
        }}
      >
        <h2>Expense</h2>
        <div className="field">
          <label>Category</label>
          <input
            value={expense.category}
            onChange={(e) => setExpense({ ...expense, category: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Amount</label>
          <input
            value={expense.amount}
            onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Save expense
        </button>
      </form>
      </div>

      <div className="panel">
        <h2>Recent vouchers</h2>
        <div className="list">
          {payments.map((p) => (
            <div className="list-row" key={String(p.id)}>
              <div>
                <strong>
                  {String(p.voucher_ref)} · {String(p.direction)}
                </strong>
                <div className="muted">
                  {String(p.party_type)} · {String(p.mode)} · {inr(Number(p.amount))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
