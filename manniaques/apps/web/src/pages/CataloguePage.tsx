import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../state/auth';
import { api } from '../lib/api';
import { inr } from '../lib/ids';

type Style = {
  id: string;
  design_code: string;
  name: string;
  stitching_cost: number;
  finishing_cost: number;
  packing_cost: number;
  photo_url?: string;
  variants?: Array<{
    id: string;
    colour: string;
    pack_size: number;
    wholesale_price_per_set: number;
    estimated_unit_cost?: number;
    qr_payload: string;
  }>;
};

export function CataloguePage() {
  const { session } = useAuth();
  const [styles, setStyles] = useState<Style[]>([]);
  const [msg, setMsg] = useState('');
  const [styleForm, setStyleForm] = useState({ designCode: '', name: '', stitchingCost: '80' });
  const [variantForm, setVariantForm] = useState({
    styleId: '',
    colour: '',
    packSize: '5',
    price: '2500',
    S: '1',
    M: '2',
    L: '1',
    XL: '1',
  });
  const [bomForm, setBomForm] = useState({ styleId: '', itemId: '', qty: '2.5' });
  const [items, setItems] = useState<Array<{ id: string; code: string; name: string }>>([]);

  async function load() {
    if (!session) return;
    const [s, i] = await Promise.all([
      api<{ styles: Style[] }>('/api/styles', { token: session.token }),
      api<{ items: Array<{ id: string; code: string; name: string }> }>('/api/items?type=raw', {
        token: session.token,
      }),
    ]);
    setStyles(s.styles);
    setItems(i.items);
    if (!variantForm.styleId && s.styles[0]) {
      setVariantForm((f) => ({ ...f, styleId: s.styles[0].id }));
      setBomForm((f) => ({ ...f, styleId: s.styles[0].id, itemId: i.items[0]?.id || '' }));
    }
  }

  useEffect(() => {
    void load();
  }, [session]);

  async function addStyle(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    await api('/api/styles', {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        designCode: styleForm.designCode,
        name: styleForm.name,
        stitchingCost: Number(styleForm.stitchingCost),
        finishingCost: 20,
        packingCost: 10,
      }),
    });
    setStyleForm({ designCode: '', name: '', stitchingCost: '80' });
    await load();
  }

  async function addVariant(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const packSize = Number(variantForm.packSize);
    const sizeBreakdown =
      packSize === 5
        ? { S: Number(variantForm.S), M: Number(variantForm.M), L: Number(variantForm.L), XL: Number(variantForm.XL) }
        : { S: 1, M: 1, L: 1, XL: 1 };
    const res = await api<{ estimatedUnitCost: number; setCost: number; margin: number }>(
      `/api/styles/${variantForm.styleId}/variants`,
      {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({
          colour: variantForm.colour,
          packSize,
          sizeBreakdown,
          wholesalePricePerSet: Number(variantForm.price),
          availableSets: 10,
        }),
      },
    );
    setMsg(
      `Variant saved · unit cost ₹${res.estimatedUnitCost} · set cost ₹${res.setCost} · margin ₹${res.margin}`,
    );
    await load();
  }

  async function addBom(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    await api(`/api/styles/${bomForm.styleId}/bom`, {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({ itemId: bomForm.itemId, qtyPerPiece: Number(bomForm.qty) }),
    });
    setMsg('BOM line saved');
    await load();
  }

  function shareCatalogue() {
    const text = styles
      .flatMap((s) =>
        (s.variants || []).map(
          (v) => `${s.design_code} ${v.colour} · ${v.pack_size}pc · ${inr(Number(v.wholesale_price_per_set))}`,
        ),
      )
      .join('\n');
    const url = `https://wa.me/?text=${encodeURIComponent(`Manniaques catalogue\n${text}`)}`;
    window.open(url, '_blank');
  }

  return (
    <AppShell title="Catalogue">
      {msg ? <div className="banner info">{msg}</div> : null}
      <div className="form-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={shareCatalogue}>
          Share on WhatsApp
        </button>
      </div>

      <div className="page-grid">
      <form className="panel" onSubmit={addStyle}>
        <h2>Add style</h2>
        <div className="field">
          <label>Design code</label>
          <input
            value={styleForm.designCode}
            onChange={(e) => setStyleForm({ ...styleForm, designCode: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Name</label>
          <input
            value={styleForm.name}
            onChange={(e) => setStyleForm({ ...styleForm, name: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Save draft style
        </button>
      </form>

      <form className="panel" onSubmit={addBom}>
        <h2>BOM line</h2>
        <div className="field">
          <label>Style</label>
          <select
            value={bomForm.styleId}
            onChange={(e) => setBomForm({ ...bomForm, styleId: e.target.value })}
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.design_code} · {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Raw item</label>
          <select
            value={bomForm.itemId}
            onChange={(e) => setBomForm({ ...bomForm, itemId: e.target.value })}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} · {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Qty per piece</label>
          <input value={bomForm.qty} onChange={(e) => setBomForm({ ...bomForm, qty: e.target.value })} />
        </div>
        <button className="btn btn-secondary" type="submit">
          Add BOM
        </button>
      </form>

      <form className="panel" onSubmit={addVariant}>
        <h2>Wholesale pack / colour</h2>
        <div className="field">
          <label>Style</label>
          <select
            value={variantForm.styleId}
            onChange={(e) => setVariantForm({ ...variantForm, styleId: e.target.value })}
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.design_code}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Colour</label>
          <input
            value={variantForm.colour}
            onChange={(e) => setVariantForm({ ...variantForm, colour: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Pack size</label>
          <select
            value={variantForm.packSize}
            onChange={(e) => setVariantForm({ ...variantForm, packSize: e.target.value })}
          >
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>
        <div className="field">
          <label>Wholesale ₹ / set</label>
          <input
            value={variantForm.price}
            onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Save pack
        </button>
      </form>
      </div>

      <div className="list">
        {styles.map((s) => (
          <div className="panel" key={s.id}>
            <h3>
              {s.design_code} · {s.name}
            </h3>
            <div className="muted">
              Stitch ₹{Number(s.stitching_cost)} · Finish ₹{Number(s.finishing_cost)} · Pack ₹
              {Number(s.packing_cost)}
            </div>
            {(s.variants || []).map((v) => (
              <div className="list-row" key={v.id} style={{ marginTop: 8 }}>
                <div>
                  <strong>
                    {v.colour} · {v.pack_size}pc
                  </strong>
                  <div className="muted">
                    {inr(Number(v.wholesale_price_per_set))}/set
                    {v.estimated_unit_cost != null
                      ? ` · est unit ₹${Number(v.estimated_unit_cost)}`
                      : ''}
                  </div>
                  <div className="muted">QR: {v.qr_payload}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
