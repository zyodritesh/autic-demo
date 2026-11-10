import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { accessFromRoles, NAV } from '../lib/modules';

export function AppShell({
  children,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  title?: string;
  wide?: boolean;
}) {
  const { session, offlineReady, online, logout } = useAuth();
  const loc = useLocation();
  const access = accessFromRoles(session?.roles || [session?.role || 'sales']);
  const links = NAV.filter((n) => n.key === 'home' || access[n.key as keyof typeof access]);

  const isActive = (to: string) => {
    if (to === '/') return loc.pathname === '/';
    return loc.pathname === to || loc.pathname.startsWith(`${to}/`);
  };

  return (
    <div className={`desk-frame ${wide ? 'desk-frame-wide' : ''}`}>
      <aside className="desk-sidebar no-print">
        <div className="desk-brand">
          <div className="brand">Manniaques</div>
          <div className="muted desk-factory">{session?.factoryName}</div>
        </div>
        <nav className="desk-nav">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={isActive(l.to) ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="desk-sidebar-foot">
          <div className="muted">{session?.name}</div>
          <div className="desk-status-row">
            {offlineReady ? <span className="pill ok">Offline ready</span> : <span className="pill warn">Cache</span>}
            <span className="pill">{online ? 'Online' : 'Offline'}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="desk-main">
        <header className="desk-header no-print">
          <div>
            <h1 className="desk-title">{title || 'Home'}</h1>
            <div className="muted mobile-only">
              {session?.name} · {session?.factoryName}
            </div>
          </div>
          <div className="desk-header-actions mobile-only">
            {offlineReady ? <span className="pill ok">Ready</span> : null}
            <span className="pill">{online ? 'Online' : 'Offline'}</span>
            <button type="button" className="btn btn-ghost" onClick={() => logout()}>
              Out
            </button>
          </div>
        </header>
        <main className="desk-content">{children}</main>
      </div>

      <nav className="bottom-nav no-print mobile-only">
        {links.slice(0, 5).map((l) => (
          <Link key={l.to} to={l.to} className={isActive(l.to) ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
        {links.length > 5 ? (
          <details className="more-nav">
            <summary>More</summary>
            <div className="more-panel">
              {links.slice(5).map((l) => (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </nav>
    </div>
  );
}
