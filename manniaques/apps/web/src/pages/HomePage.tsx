import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { getDb } from '../db/local';
import { inr, offlineOrderRef, uuid } from '../lib/ids';
import { syncPending } from '../lib/sync';
import { api } from '../lib/api';
import { accessFromRoles } from '../lib/modules';
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
          ? { label: 'Job work', onClick: () => navigate('/jobwork') }
          : access.accounts
            ? { label: 'Receive or pay', onClick: () => navigate('/payments') }
            : access.team
              ? { label: 'Add staff', onClick: () => navigate('/team') }
              : access.factories
                ? { label: 'Add factory', onClick: () => navigate('/factories') }
                : { label: 'Open stock', onClick: () => navigate('/stock') };

  return (
    <AppShell title="Home">
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
        <div className="stats-row">
          <div className="stat-card">
            <div className="muted">Today sales</div>
            <strong>{inr(Number(home.todaySales.amount))}</strong>
            <div className="muted">{home.todaySales.cnt} orders</div>
          </div>
          <div className="stat-card">
            <div className="muted">PO drafts</div>
            <strong>{home.pendingPurchaseDrafts}</strong>
          </div>
          <div className="stat-card">
            <div className="muted">Open job work</div>
            <strong>{home.openJobWork}</strong>
          </div>
          <div className="stat-card">
            <div className="muted">Waiting sync</div>
            <strong>{home.waitingSync}</strong>
            <div className="muted">{home.openFollowUps} follow-ups</div>
          </div>
        </div>
      ) : null}

      <div className="shortcut-grid no-print">
        {access.sales ? (
          <Link className="shortcut" to="/sale">
            <strong>Sales</strong>
            <span className="muted">Orders & showrooms</span>
          </Link>
        ) : null}
        {access.purchase ? (
          <Link className="shortcut" to="/purchase">
            <strong>Purchase</strong>
            <span className="muted">PO · receive · pay</span>
          </Link>
        ) : null}
        {access.production ? (
          <Link className="shortcut" to="/jobwork">
            <strong>Job work</strong>
            <span className="muted">Issue · receive</span>
          </Link>
        ) : null}
        {access.items ? (
          <Link className="shortcut" to="/items">
            <strong>Items</strong>
            <span className="muted">Raw & finished</span>
          </Link>
        ) : null}
        {access.catalogue ? (
          <Link className="shortcut" to="/catalogue">
            <strong>Catalogue</strong>
            <span className="muted">Styles · packs · BOM</span>
          </Link>
        ) : null}
        {access.parties ? (
          <Link className="shortcut" to="/parties">
            <strong>Parties</strong>
            <span className="muted">Customers · vendors</span>
          </Link>
        ) : null}
        {access.stores ? (
          <Link className="shortcut" to="/stock">
            <strong>Stock</strong>
            <span className="muted">Raw · finished · dispatch</span>
          </Link>
        ) : null}
        {access.accounts || access.reports ? (
          <Link className="shortcut" to="/reports">
            <strong>Reports</strong>
            <span className="muted">Sales · P&L · stock</span>
          </Link>
        ) : null}
        {access.agent ? (
          <Link className="shortcut" to="/agents">
            <strong>Agents</strong>
            <span className="muted">Commission</span>
          </Link>
        ) : null}
        {access.team ? (
          <Link className="shortcut" to="/team">
            <strong>Team</strong>
            <span className="muted">Invite staff</span>
          </Link>
        ) : null}
      </div>

      {access.sales ? (
        <>
          <h2 className="section-title">Recent drafts</h2>
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
