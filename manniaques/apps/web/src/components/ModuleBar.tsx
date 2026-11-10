import { Link, useLocation } from 'react-router-dom';
import type { Access } from '../lib/modules';
import { moduleById, type ErpModuleId } from '../lib/modules';

/** In-module strip — ERP style: module name + sub-screens */
export function ModuleBar({
  moduleId,
  access,
}: {
  moduleId: ErpModuleId;
  access: Access;
}) {
  const loc = useLocation();
  const mod = moduleById(moduleId);
  if (!mod) return null;
  const items = mod.items.filter((i) => access[i.key as keyof Access]);
  if (items.length === 0) return null;

  return (
    <div className="module-bar no-print">
      <Link to={mod.hub} className="module-bar-label">
        {mod.label}
      </Link>
      <div className="module-bar-links">
        {items.map((item) => {
          const active =
            loc.pathname === item.to ||
            (item.to !== '/' && loc.pathname.startsWith(`${item.to}/`)) ||
            (moduleId === 'sales' && item.to === '/sale' && loc.pathname.startsWith('/order'));
          return (
            <Link key={`${item.to}-${item.label}`} to={item.to} className={active ? 'active' : ''}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
