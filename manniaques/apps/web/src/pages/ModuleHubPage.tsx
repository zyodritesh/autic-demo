import { Link, Navigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ModuleBar } from '../components/ModuleBar';
import { useAuth } from '../state/auth';
import { accessFromRoles, moduleById, modulesForAccess } from '../lib/modules';

export function ModuleHubPage() {
  const { moduleId = '' } = useParams();
  const { session } = useAuth();
  const access = accessFromRoles(session?.roles || [session?.role || 'sales']);
  const allowed = modulesForAccess(access);
  const mod = moduleById(moduleId);

  if (!mod || !allowed.some((m) => m.id === mod.id)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppShell title={mod.label} wide>
      <ModuleBar moduleId={mod.id} access={access} />
      <p className="muted module-hub-lead">{mod.hint}. Neeche se screen choose karo.</p>
      <div className="module-menu">
        {mod.items
          .filter((item) => access[item.key as keyof typeof access])
          .map((item, i) => (
            <Link key={`${item.to}-${item.label}`} className="module-menu-row" to={item.to}>
              <span className="module-index">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.label}</strong>
                {item.hint ? <span className="muted">{item.hint}</span> : null}
              </div>
              <span className="module-menu-go" aria-hidden>
                →
              </span>
            </Link>
          ))}
      </div>
    </AppShell>
  );
}
