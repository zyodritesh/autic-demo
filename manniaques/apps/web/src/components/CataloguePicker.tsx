import { useMemo, useState } from 'react';
import type { LocalCatalogueItem } from '../db/local';

type Props = {
  items: LocalCatalogueItem[];
  onPick: (item: LocalCatalogueItem) => void;
};

export function CataloguePicker({ items, onPick }: Props) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.designCode.toLowerCase().includes(needle) ||
        i.name.toLowerCase().includes(needle) ||
        i.colour.toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <div>
      <div className="field">
        <label htmlFor="cat-search">Search by code or name</label>
        <input
          id="cat-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="MNQ-401 or Floral"
        />
      </div>
      <div className="catalogue-grid">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            className="catalogue-tile"
            onClick={() => onPick(item)}
          >
            {item.photoThumbUrl || item.photoUrl ? (
              <img src={item.photoThumbUrl || item.photoUrl} alt={item.name} />
            ) : (
              <div className="thumb" />
            )}
            <div className="meta">
              <strong>{item.designCode}</strong>
              <div className="muted">
                {item.colour} · {item.packSize}pc · ₹{item.wholesalePricePerSet}
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="muted">No designs match.</p> : null}
    </div>
  );
}
