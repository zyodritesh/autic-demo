import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../state/auth';
import {
  calcOrderTotals,
  getDb,
  type LocalCatalogueItem,
  type LocalCustomer,
  type LocalOrder,
  type LocalOrderLine,
} from '../db/local';
import { inr, offlineOrderRef, uuid } from '../lib/ids';
import { saveOrder } from '../lib/sync';
import { QrScanner } from '../components/QrScanner';
import { CataloguePicker } from '../components/CataloguePicker';
import { PhotoAttach } from '../components/PhotoAttach';
import { AppShell } from '../components/AppShell';


type Method = 'scan' | 'choose' | 'photo';

export function SalePage() {
  const { orderId } = useParams();
  const { session, online } = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('scan');
  const [cameraDenied, setCameraDenied] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [toast, setToast] = useState('');
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const orderRef = useRef<LocalOrder | null>(null);
  const writeChain = useRef(Promise.resolve());

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const customers = useLiveQuery(async () => {
    if (!session) return [];
    return getDb(session.factoryId, session.userId).customers.toArray();
  }, [session]);

  const catalogue = useLiveQuery(async () => {
    if (!session) return [];
    return getDb(session.factoryId, session.userId).catalogue.toArray();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const db = getDb(session.factoryId, session.userId);
      if (!orderId) {
        const id = uuid();
        const now = new Date().toISOString();
        const draft: LocalOrder = {
          id,
          factoryId: session.factoryId,
          userId: session.userId,
          orderRef: offlineOrderRef(),
          status: 'draft',
          syncStatus: 'local',
          customer: {
            id: '',
            factoryId: session.factoryId,
            clientId: uuid(),
            name: '',
            mobile: '',
            updatedAt: now,
          },
          lines: [],
          attachments: [],
          totalSets: 0,
          totalPieces: 0,
          totalAmount: 0,
          idempotencyKey: uuid(),
          version: 1,
          orderDate: now.slice(0, 10),
          channel: 'showroom',
          createdAt: now,
          updatedAt: now,
        };
        await db.orders.put(draft);
        navigate(`/sale/${id}`, { replace: true });
        return;
      }
      const row = await db.orders.get(orderId);
      if (!row) {
        navigate('/');
        return;
      }
      setOrder(row);
      setCustomerQuery(row.customer.name || '');
    })();
  }, [session, orderId, navigate]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const list = customers || [];
    const deduped = [];
    const seen = new Set();
    for (const c of list) {
      const key = `${c.mobile}|${c.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c);
    }
    const filtered = !q
      ? deduped
      : deduped.filter(
          (c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q),
        );
    return filtered.slice(0, 8);
  }, [customers, customerQuery]);

  function enqueueWrite(mutator: (current: LocalOrder) => LocalOrder | null) {
    if (!session) return Promise.resolve(null);
    const run = writeChain.current.then(async () => {
      const current =
        orderRef.current ||
        (orderId
          ? (await getDb(session.factoryId, session.userId).orders.get(orderId)) || null
          : null);
      if (!current) return null;
      const next = mutator(current);
      if (!next) return current;
      const saved = await saveOrder(session, next);
      orderRef.current = saved;
      setOrder(saved);
      return saved;
    });
    writeChain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function selectCustomer(c: LocalCustomer) {
    void enqueueWrite((current) => ({
      ...current,
      customer: {
        ...c,
        buyerContact: c.buyerContact || c.mobile,
      },
    }));
    setCustomerQuery(c.name);
    setToast(`Showroom: ${c.name}`);
  }

  async function quickAddCustomer() {
    if (!session || !orderRef.current) return;
    const name = customerQuery.trim();
    const mobile = (orderRef.current.customer.mobile || '').trim();
    if (!name || mobile.length < 8) {
      setToast('Enter showroom name and mobile to quick-add');
      return;
    }
    const now = new Date().toISOString();
    const clientId = uuid();
    const local: LocalCustomer = {
      id: clientId,
      factoryId: session.factoryId,
      clientId,
      name,
      mobile,
      branch: orderRef.current.customer.branch || '',
      buyerContact: orderRef.current.customer.buyerContact || mobile,
      deliveryAddress: orderRef.current.customer.deliveryAddress || '',
      isNew: true,
      updatedAt: now,
    };
    await getDb(session.factoryId, session.userId).customers.put(local);
    await enqueueWrite((current) => ({ ...current, customer: local }));
    setToast('Showroom saved on phone');
  }

  function addItem(item: LocalCatalogueItem, setQty = 1) {
    void enqueueWrite((current) => {
      const existing = current.lines.find((l) => l.catalogueItemId === item.id);
      let lines: LocalOrderLine[];
      if (existing) {
        lines = current.lines.map((l) =>
          l.catalogueItemId === item.id
            ? { ...l, setQty: l.setQty + setQty }
            : l,
        );
      } else {
        lines = [
          ...current.lines,
          {
            id: uuid(),
            catalogueItemId: item.id,
            designCode: item.designCode,
            name: item.name,
            colour: item.colour,
            photoUrl: item.photoThumbUrl || item.photoUrl,
            packSize: item.packSize,
            sizeBreakdown: { ...item.sizeBreakdown },
            wholesalePricePerSet: item.wholesalePricePerSet,
            setQty,
          },
        ];
      }
      return { ...current, lines, ...calcOrderTotals(lines) };
    });
    setToast(`Added ${item.designCode} · ${item.colour}`);
  }

  function onScan(payload: string) {
    const items = catalogue || [];
    const match =
      items.find((i) => i.qrPayload === payload) ||
      items.find((i) => payload.includes(i.designCode) && payload.includes(i.colour));
    if (!match) {
      setToast('QR not in cached catalogue');
      return;
    }
    addItem(match, 1);
  }

  function updateQty(lineId: string, setQty: number) {
    void enqueueWrite((current) => {
      const lines = current.lines
        .map((l) => (l.id === lineId ? { ...l, setQty: Math.max(0, setQty) } : l))
        .filter((l) => l.setQty > 0);
      return { ...current, lines, ...calcOrderTotals(lines) };
    });
  }

  async function generateOrder() {
    if (!session) return;
    const saved = await enqueueWrite((current) => {
      if (!current.customer.name || !current.customer.mobile) {
        setToast('Pick or add a showroom first');
        return null;
      }
      if (current.lines.length === 0) {
        setToast('Add at least one design');
        return null;
      }
      return {
        ...current,
        status: 'generated',
        syncStatus: online ? 'pending' : 'local',
      };
    });
    if (saved?.status === 'generated') navigate(`/order/${saved.id}`);
  }

  if (!order) {
    return <AppShell title="New sale"><div className="muted">Loading draft…</div></AppShell>;
  }

  const totals = calcOrderTotals(order.lines);

  return (
    <AppShell title={`Sale · ${order.orderRef}`} wide>
      {toast ? (
        <div className="banner info no-print" onAnimationEnd={() => undefined}>
          {toast}
        </div>
      ) : null}

      <div className="desktop-layout sale-page">
        <div>
          <div className="panel no-print">
            <h2>Showroom</h2>
            <div className="field">
              <label>Search name or mobile</label>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Kothari or 98111…"
              />
            </div>
            <div className="list">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="list-row"
                  data-testid={`customer-${c.mobile}`}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => selectCustomer(c)}
                >
                  <div>
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {c.mobile}
                      {c.branch ? ` · ${c.branch}` : ''}
                    </span>
                  </div>
                  {order.customer.mobile === c.mobile ? (
                    <span className="pill ok">Selected</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Mobile (for quick-add)</label>
              <input
                value={order.customer.mobile}
                onChange={(e) => {
                  const mobile = e.target.value;
                  void enqueueWrite((current) => ({
                    ...current,
                    customer: { ...current.customer, mobile },
                  }));
                }}
                inputMode="numeric"
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={quickAddCustomer}>
              Quick-add showroom
            </button>

            {order.customer.name ? (
              <div className="banner info" style={{ marginTop: 12 }}>
                <strong>{order.customer.name}</strong>
                <div className="muted">
                  {order.customer.branch || 'Branch TBD'} ·{' '}
                  {order.customer.buyerContact || order.customer.mobile}
                </div>
                <div className="muted">{order.customer.deliveryAddress || 'No delivery address'}</div>
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn-ghost details-toggle"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? 'Hide details' : 'More details'}
            </button>
            {showMore ? (
              <div style={{ marginTop: 10 }}>
                <div className="field">
                  <label>Branch</label>
                  <input
                    value={order.customer.branch || ''}
                    onChange={(e) => {
                      const branch = e.target.value;
                      void enqueueWrite((current) => ({
                        ...current,
                        customer: { ...current.customer, branch },
                      }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Buyer contact</label>
                  <input
                    value={order.customer.buyerContact || ''}
                    onChange={(e) => {
                      const buyerContact = e.target.value;
                      void enqueueWrite((current) => ({
                        ...current,
                        customer: { ...current.customer, buyerContact },
                      }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Delivery address</label>
                  <textarea
                    value={order.customer.deliveryAddress || ''}
                    onChange={(e) => {
                      const deliveryAddress = e.target.value;
                      void enqueueWrite((current) => ({
                        ...current,
                        customer: { ...current.customer, deliveryAddress },
                      }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Delivery note</label>
                  <textarea
                    value={order.deliveryNote || ''}
                    onChange={(e) => {
                      const deliveryNote = e.target.value;
                      void enqueueWrite((current) => ({ ...current, deliveryNote }));
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel no-print">
            <h2>Add design</h2>
            <div className="method-tabs">
              <button
                type="button"
                className={`btn btn-secondary ${method === 'scan' ? 'active' : ''}`}
                onClick={() => setMethod('scan')}
              >
                Scan QR
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${method === 'choose' ? 'active' : ''}`}
                onClick={() => setMethod('choose')}
              >
                Choose item
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${method === 'photo' ? 'active' : ''}`}
                onClick={() => setMethod('photo')}
              >
                Photo
              </button>
            </div>

            {method === 'scan' && !cameraDenied ? (
              <QrScanner
                onScan={onScan}
                onDenied={() => {
                  setCameraDenied(true);
                  setMethod('choose');
                  setToast('Camera denied — use Choose item');
                }}
              />
            ) : null}
            {cameraDenied && method === 'scan' ? (
              <p className="muted">Camera denied — switched to Choose item.</p>
            ) : null}
            {method === 'choose' || cameraDenied ? (
              <CataloguePicker items={catalogue || []} onPick={(item) => addItem(item, 1)} />
            ) : null}
            {method === 'photo' ? (
              <PhotoAttach
                catalogue={catalogue || []}
                onSavePhoto={(attachment) =>
                  void enqueueWrite((current) => ({
                    ...current,
                    attachments: [...current.attachments, attachment],
                  }))
                }
                onAddSuggested={(item, qty) => addItem(item, qty)}
              />
            ) : null}
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Lines</h2>
            <div className="line-list">
              {order.lines.length === 0 ? (
                <p className="muted">Scan or choose a design to add sets.</p>
              ) : (
                order.lines.map((line) => (
                  <div className="line-card" key={line.id}>
                    {line.photoUrl ? (
                      <img src={line.photoUrl} alt={line.name} />
                    ) : (
                      <div className="thumb" />
                    )}
                    <div>
                      <strong>
                        {line.designCode} · {line.colour}
                      </strong>
                      <div className="muted">
                        {line.packSize}-piece pack · ₹{line.wholesalePricePerSet}/set
                      </div>
                      <div className="muted">
                        {Object.entries(line.sizeBreakdown)
                          .map(([k, v]) => `${k}:${v}`)
                          .join(' ')}
                      </div>
                      <div className="qty-row">
                        <button type="button" onClick={() => updateQty(line.id, line.setQty - 1)}>
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={line.setQty}
                          onChange={(e) => updateQty(line.id, Number(e.target.value))}
                        />
                        <button type="button" onClick={() => updateQty(line.id, line.setQty + 1)}>
                          +
                        </button>
                        <span className="muted">
                          {line.setQty * line.packSize} pcs · {inr(line.setQty * line.wholesalePricePerSet)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sticky-bar">
            <div className="sticky-inner">
              <div className="totals">
                <span>
                  Sets <strong>{totals.totalSets}</strong>
                </span>
                <span>
                  Pieces <strong>{totals.totalPieces}</strong>
                </span>
                <span>
                  Amount <strong>{inr(totals.totalAmount)}</strong>
                </span>
              </div>
              <button type="button" className="btn btn-primary" onClick={generateOrder}>
                Generate order
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
