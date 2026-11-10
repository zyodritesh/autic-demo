import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { getDb } from '../db/local';
import { inr, offlineOrderRef, uuid } from '../lib/ids';
import { syncPending } from '../lib/sync';
import { api } from '../lib/api';
import { accessFromRoles, modulesForAccess } from '../lib/modules';
import { AppShell } from '../components/AppShell';

type HomeData = {
  roles: string[];
  access: Record<string, boolean>;
  todaySales: { amount: number; cnt: number };
  pendingPurchaseDrafts: number;
  openJobWork: number;
  openFollowUps: number;
  waitingSync: number;
};

export function HomePage() {
  const { session, online, refreshOfflineReady } = useAuth();
  const navigate = useNavigate();
  const [syncMsg, setSyncMsg] = useState('');
  const [home, setHome] = useState<HomeData | null>(null);
  const access = accessFromRoles(session?.roles || [session?.role || 'sales']);
  const modules = modulesForAccess(access);

  const drafts = useLiveQuery(async () => {
    if (!session) return [];
    const db = getDb(session.factoryId, session.userId);
    const rows = await db.orders.where('factoryId').equals(session.factoryId).toArray();
    return rows
      .filter((o) => o.userId === session.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);
  }, [session]);

  useEffect(() => {
    if (!session || !online) return;
    void api<HomeData>('/api/home', { token: session.token }).then(setHome).catch(() => undefined);
  }, [session, online]);

  async function startSale() {
    if (!session) return;
    const id = uuid();
    const now = new Date().toISOString();
    const db = getDb(session.factoryId, session.userId);
    await db.orders.put({
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
    });
    navigate(`/sale/${id}`);
  }

  const primary =
    access.sales
      ? { label: 'New sale', onClick: () => void startSale() }
      : access.purchase
        ? { label: 'New purchase', onClick: () => navigate('/purchase/new') }
        : access.production
          ? { label: 'Open job work', onClick: () => navigate('/jobwork') }
          : access.accounts
            ? { label: 'Receive or pay', onClick: () => navigate('/payments') }
            : access.team
              ? { label: 'Add staff', onClick: () => navigate('/team') }
              : access.factories
                ? { label: 'Add factory', onClick: () => navigate('/factories') }
                : { label: 'Open stock', onClick: () => navigate('/stock') };

  return (
    <AppShell title="ERP Home" wide>
      <div className="hero-action no-print">
        <button type="button" className="btn btn-primary" style={{ fontSize: '1.15rem' }} onClick={primary.onClick}>
          {primary.label}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (!session) return;
              const results = await syncPending(session);
              setSyncMsg(`Synced ${results.filter((r) => r.ok).length}/${results.length}`);
            }}
          >
            Retry sync
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => refreshOfflineReady()}>
            Refresh cache
          </button>
        </div>
        {syncMsg ? <div className="muted">{syncMsg}</div> : null}
      </div>

      {home ? (
        <div className="erp-kpi-row" aria-label="Today">
          <div>
            <span className="muted">Today sales</span>
            <strong>{inr(Number(home.todaySales.amount))}</strong>
            <span className="muted">{home.todaySales.cnt} orders</span>
          </div>
          <div>
            <span className="muted">PO drafts</span>
            <strong>{home.pendingPurchaseDrafts}</strong>
          </div>
          <div>
            <span className="muted">Open job work</span>
            <strong>{home.openJobWork}</strong>
          </div>
          <div>
            <span className="muted">Waiting sync</span>
            <strong>{home.waitingSync}</strong>
          </div>
        </div>
      ) : null}

      <h2 className="section-title">Modules</h2>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Open one module at a time — Masters, Sales, Purchase, Production, Accounts, Reports.
      </p>
      <div className="module-launcher">
        {modules.map((mod) => (
          <Link key={mod.id} className="module-launcher-row" to={mod.hub}>
            <div>
              <strong>{mod.label}</strong>
              <span className="muted">{mod.hint}</span>
            </div>
            <span className="module-menu-go" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>

      {access.sales ? (
        <>
          <h2 className="section-title">Recent sales drafts</h2>
          <div className="list">
            {(drafts || []).length === 0 ? (
              <div className="muted">No drafts yet.</div>
            ) : (
              drafts!.map((d) => (
                <div className="list-row" key={d.id}>
                  <div>
                    <strong>{d.customer.name || 'Untitled showroom'}</strong>
                    <span className="muted">
                      {d.orderRef} · {d.totalSets} sets · {inr(d.totalAmount)} · {d.syncStatus}
                    </span>
                  </div>
                  <Link
                    className="btn btn-secondary"
                    to={d.status === 'draft' ? `/sale/${d.id}` : `/order/${d.id}`}
                  >
                    Resume
                  </Link>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
