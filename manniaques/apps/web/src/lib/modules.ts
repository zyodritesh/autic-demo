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

export type NavKey = 'home' | keyof Access;

export type NavItem = {
  key: NavKey;
  to: string;
  label: string;
  hint?: string;
};

/** Flat links used for mobile bottom nav and access checks */
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

export type ErpModuleId =
  | 'masters'
  | 'sales'
  | 'purchase'
  | 'production'
  | 'accounts'
  | 'reports'
  | 'admin';

export type ErpModule = {
  id: ErpModuleId;
  label: string;
  hint: string;
  hub: string;
  /** Access keys — module visible if any is true (home always shown separately) */
  accessAny: (keyof Access)[];
  items: NavItem[];
};

/** Classic garment ERP module map — one workspace per module */
export const ERP_MODULES: ErpModule[] = [
  {
    id: 'masters',
    label: 'Masters',
    hint: 'Items · styles · parties',
    hub: '/module/masters',
    accessAny: ['items', 'catalogue', 'parties'],
    items: [
      { key: 'items', to: '/items', label: 'Item master', hint: 'Raw & finished goods' },
      { key: 'catalogue', to: '/catalogue', label: 'Style / catalogue', hint: 'BOM · packs · QR' },
      { key: 'parties', to: '/parties', label: 'Parties', hint: 'Customers & vendors' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    hint: 'Orders · showroom · invoice',
    hub: '/module/sales',
    accessAny: ['sales'],
    items: [
      { key: 'sales', to: '/sale', label: 'Sales orders', hint: 'New sale & drafts' },
      { key: 'parties', to: '/parties', label: 'Customers', hint: 'Showrooms & buyers' },
      { key: 'catalogue', to: '/catalogue', label: 'Catalogue', hint: 'Pick styles to sell' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    hint: 'PO · receive · vendor',
    hub: '/module/purchase',
    accessAny: ['purchase'],
    items: [
      { key: 'purchase', to: '/purchase', label: 'Purchase orders', hint: 'Photo draft · confirm' },
      { key: 'purchase', to: '/purchase/new', label: 'New purchase', hint: 'Start from photo' },
      { key: 'parties', to: '/parties', label: 'Vendors', hint: 'Suppliers & karigars' },
      { key: 'items', to: '/items', label: 'Item master', hint: 'Add raw materials' },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    hint: 'Job work · stock · dispatch',
    hub: '/module/production',
    accessAny: ['production', 'stores'],
    items: [
      { key: 'production', to: '/jobwork', label: 'Job work', hint: 'Issue · receive' },
      { key: 'stores', to: '/stock', label: 'Stock & dispatch', hint: 'Raw · finished' },
      { key: 'items', to: '/items', label: 'Item master', hint: 'Opening stock' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    hint: 'Payments · commission',
    hub: '/module/accounts',
    accessAny: ['accounts', 'agent'],
    items: [
      { key: 'accounts', to: '/payments', label: 'Payments', hint: 'Receive · pay' },
      { key: 'agent', to: '/agents', label: 'Agents', hint: 'Commission · payout' },
      { key: 'parties', to: '/parties', label: 'Party ledger', hint: 'Customers & vendors' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    hint: 'Sales · P&L · stock value',
    hub: '/module/reports',
    accessAny: ['reports', 'pnl'],
    items: [{ key: 'reports', to: '/reports', label: 'Reports & P&L', hint: 'Period summary' }],
  },
  {
    id: 'admin',
    label: 'Admin',
    hint: 'Team · factories',
    hub: '/module/admin',
    accessAny: ['team', 'factories'],
    items: [
      { key: 'team', to: '/team', label: 'Team', hint: 'Invite staff · roles' },
      { key: 'factories', to: '/factories', label: 'Factories', hint: 'Super admin' },
    ],
  },
];

export function modulesForAccess(access: Access): ErpModule[] {
  return ERP_MODULES.map((mod) => ({
    ...mod,
    items: mod.items.filter((item) => item.key === 'home' || access[item.key as keyof Access]),
  })).filter((mod) => mod.accessAny.some((k) => access[k]) && mod.items.length > 0);
}

export function moduleById(id: string): ErpModule | undefined {
  return ERP_MODULES.find((m) => m.id === id);
}

export function moduleForPath(pathname: string): ErpModule | undefined {
  if (pathname.startsWith('/module/')) {
    return moduleById(pathname.split('/')[2] || '');
  }
  for (const mod of ERP_MODULES) {
    for (const item of mod.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return mod;
      }
    }
  }
  // sale/order paths
  if (pathname.startsWith('/sale') || pathname.startsWith('/order')) {
    return moduleById('sales');
  }
  return undefined;
}
