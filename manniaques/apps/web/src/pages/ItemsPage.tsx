import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';

type Item = {
  id: string;
  code: string;
  name: string;
  item_type: string;
  colour?: string;
  stock_unit: string;
  on_hand: number;
  avg_cost: number;
  category_name?: string;
};

export function ItemsPage() {
  const { session } = useAuth();
  const [type, setType] = useState<'raw' | 'finished'>('raw');
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    name: '',
    categoryName: 'Fabric',
    stockUnit: 'metre',
    startingUnitCost: '100',
    onHand: '0',
    colour: '',
  });

  async function load() {
    if (!session) return;
    const data = await api<{ items: Item[] }>(
      `/api/items?type=${type}&q=${encodeURIComponent(q)}`,
      { token: session.token },
    );
    setItems(data.items);
  }

  useEffect(() => {
    void load();
  }, [session, type]);

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    await api('/api/items', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        itemType: type,
        name: form.name,
        categoryName: form.categoryName,
        stockUnit: form.stockUnit,
        startingUnitCost: Number(form.startingUnitCost),
        onHand: Number(form.onHand),
        colour: form.colour || undefined,
      }),
    });
    setForm({ ...form, name: '', onHand: '0' });
    await load();
  }

  return (
    <AppShell title="Items">
      <div className="method-tabs no-print">
        <button type="button" className={`btn btn-secondary ${type === 'raw' ? 'active' : ''}`} onClick={() => setType('raw')}>
          Raw materials
        </button>
        <button
          type="button"
          className={`btn btn-secondary ${type === 'finished' ? 'active' : ''}`}
          onClick={() => setType('finished')}
        >
          Finished goods
        </button>
      </div>

      <div className="page-grid">
      <form className="panel" onSubmit={addItem}>
        <h2>Add item</h2>
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Category</label>
          <input
            value={form.categoryName}
            onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Stock unit</label>
          <input value={form.stockUnit} onChange={(e) => setForm({ ...form, stockUnit: e.target.value })} />
        </div>
        <div className="field">
          <label>Starting unit cost</label>
          <input
            value={form.startingUnitCost}
            onChange={(e) => setForm({ ...form, startingUnitCost: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Opening qty</label>
          <input value={form.onHand} onChange={(e) => setForm({ ...form, onHand: e.target.value })} />
        </div>
        <button className="btn btn-primary" type="submit">
          Save item
        </button>
      </form>

      <div className="panel">
        <div className="field">
          <label>Search</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => void load()}
            placeholder="Code or name"
          />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>On hand</th>
                <th>Avg cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>
                    {i.name}
                    {i.colour ? ` · ${i.colour}` : ''}
                  </td>
                  <td>
                    {Number(i.on_hand)} {i.stock_unit}
                  </td>
                  <td>₹{Number(i.avg_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
