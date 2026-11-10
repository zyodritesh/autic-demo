export type Access = {
  sales: boolean;
  purchase: boolean;
  production: boolean;
  stores: boolean;
  accounts: boolean;
  agent: boolean;
  items: boolean;
  catalogue: boolean;
  parties: boolean;
  reports: boolean;
  pnl: boolean;
  team: boolean;
  factories: boolean;
  whatsapp: boolean;
};

export function accessFromRoles(roles: string[] = []): Access {
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

export type NavItem = { key: 'home' | keyof Access; to: string; label: string };

export const NAV: NavItem[] = [
  { key: 'home', to: '/', label: 'Home' },
  { key: 'sales', to: '/sale', label: 'Sales' },
  { key: 'items', to: '/items', label: 'Items' },
  { key: 'catalogue', to: '/catalogue', label: 'Catalogue' },
  { key: 'parties', to: '/parties', label: 'Parties' },
  { key: 'purchase', to: '/purchase', label: 'Purchase' },
  { key: 'production', to: '/jobwork', label: 'Job work' },
  { key: 'stores', to: '/stock', label: 'Stock' },
  { key: 'accounts', to: '/payments', label: 'Payments' },
  { key: 'agent', to: '/agents', label: 'Agents' },
  { key: 'reports', to: '/reports', label: 'Reports' },
  { key: 'team', to: '/team', label: 'Team' },
  { key: 'factories', to: '/factories', label: 'Factories' },
];

