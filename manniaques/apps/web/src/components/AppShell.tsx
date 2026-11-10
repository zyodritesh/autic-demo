import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth';
import {
  accessFromRoles,
  moduleForPath,
  modulesForAccess,
  NAV,
  type ErpModuleId,
} from '../lib/modules';
import { ModuleBar } from './ModuleBar';

export function AppShell({
  children,
  title,
  wide = false,
  moduleId,
}: {
  children: React.ReactNode;
  title?: string;
  wide?: boolean;
  /** Force module strip; otherwise inferred from the route */
  moduleId?: ErpModuleId;
}) {
  const { session, offlineReady, online, logout } = useAuth();
  const loc = useLocation();
  const access = accessFromRoles(session?.roles || [session?.role || 'sales']);
  const modules = modulesForAccess(access);
  const mobileLinks = NAV.filter((n) => n.key === 'home' || access[n.key as keyof typeof access]);
  const activeModule = moduleId || moduleForPath(loc.pathname)?.id;

  const isActive = (to: string) => {
    if (to === '/') return loc.pathname === '/';
    return loc.pathname === to || loc.pathname.startsWith(`${to}/`);
  };

  const moduleActive = (hub: string, id: string) =>
    loc.pathname === hub ||
    loc.pathname.startsWith(`${hub}/`) ||
    loc.pathname.startsWith(`/module/${id}`);

  return (
    <div className={`desk-frame ${wide ? 'desk-frame-wide' : ''}`}>
      <aside className="desk-sidebar no-print">
        <div className="desk-brand">
          <div className="brand">Manniaques</div>
          <div className="muted desk-erp-tag">ERP · {session?.factoryName}</div>
        </div>

        <nav className="desk-nav" aria-label="ERP modules">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            Home
          </Link>

          {modules.map((mod) => (
            <div key={mod.id} className="nav-group">
              <Link
                to={mod.hub}
                className={`nav-group-title ${moduleActive(mod.hub, mod.id) ? 'active' : ''}`}
              >
                {mod.label}
              </Link>
              <div className="nav-group-items">
                {mod.items.map((item) => (
                  <Link
                    key={`${mod.id}-${item.to}-${item.label}`}
                    to={item.to}
                    className={isActive(item.to) ? 'active' : ''}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
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
        <main className="desk-content">
          {activeModule && loc.pathname !== '/' && !loc.pathname.startsWith('/module/') ? (
            <ModuleBar moduleId={activeModule} access={access} />
          ) : null}
          {children}
        </main>
      </div>

      <nav className="bottom-nav no-print mobile-only" aria-label="Quick modules">
        <Link to="/" className={isActive('/') ? 'active' : ''}>
          Home
        </Link>
        {modules.slice(0, 4).map((mod) => (
          <Link key={mod.id} to={mod.hub} className={moduleActive(mod.hub, mod.id) ? 'active' : ''}>
            {mod.label}
          </Link>
        ))}
        {modules.length > 4 || mobileLinks.length > 5 ? (
          <details className="more-nav">
            <summary>More</summary>
            <div className="more-panel">
              {modules.slice(4).map((mod) => (
                <Link key={mod.id} to={mod.hub}>
                  {mod.label}
                </Link>
              ))}
              {mobileLinks
                .filter((l) => l.key !== 'home')
                .map((l) => (
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
