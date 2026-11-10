export type Role =
  | 'sales'
  | 'purchase'
  | 'production'
  | 'stores'
  | 'accounts'
  | 'agent'
  | 'factory_admin'
  | 'super_admin';

export const ROLE_HOME: Record<Role, { action: string; path: string; label: string }> = {
  sales: { action: 'New sale', path: '/sale', label: 'Sales' },
  purchase: { action: 'New purchase', path: '/purchase/new', label: 'Purchase' },
  production: { action: 'Job work', path: '/jobwork', label: 'Production' },
  stores: { action: 'Stock', path: '/stock', label: 'Stores' },
  accounts: { action: 'Receive or pay', path: '/payments', label: 'Accounts' },
  agent: { action: 'My commission', path: '/agents', label: 'Agent' },
  factory_admin: { action: 'Add staff', path: '/team', label: 'Admin' },
  super_admin: { action: 'Add factory', path: '/factories', label: 'Super Admin' },
};

export function hasRole(roles: string[] | undefined, role: Role | Role[]) {
  const set = new Set(roles || []);
  if (set.has('factory_admin') || set.has('super_admin')) return true;
  const need = Array.isArray(role) ? role : [role];
  return need.some((r) => set.has(r));
}

export function moduleAccess(roles: string[] = []) {
  const admin = roles.includes('factory_admin') || roles.includes('super_admin');
  return {
    sales: admin || roles.includes('sales'),
    purchase: admin || roles.includes('purchase'),
    production: admin || roles.includes('production'),
    stores: admin || roles.includes('stores'),
    accounts: admin || roles.includes('accounts'),
    agent: admin || roles.includes('agent'),
    items: admin || roles.includes('purchase') || roles.includes('production') || roles.includes('stores'),
    catalogue: admin || roles.includes('sales') || roles.includes('production'),
    parties: admin || roles.includes('sales') || roles.includes('purchase') || roles.includes('accounts'),
    reports: admin || roles.includes('accounts'),
    pnl: admin,
    team: admin,
    factories: roles.includes('super_admin'),
    whatsapp: true,
  };
}
