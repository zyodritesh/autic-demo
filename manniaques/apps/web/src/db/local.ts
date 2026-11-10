import Dexie, { type Table } from 'dexie';

export type SessionRecord = {
  id: string; // 'current'
  token: string;
  userId: string;
  mobile: string;
  name: string;
  factoryId: string;
  factoryName: string;
  role: string;
  roles: string[];
  membershipId: string;
};

export type CacheMeta = {
  id: string; // factoryId
  factoryId: string;
  downloadedAt: string;
  readyForOfflineSales: boolean;
};

export type LocalCustomer = {
  id: string;
  factoryId: string;
  serverId?: string;
  clientId: string;
  name: string;
  mobile: string;
  branch?: string;
  buyerContact?: string;
  deliveryAddress?: string;
  notes?: string;
  isNew?: boolean;
  updatedAt: string;
};

export type LocalCatalogueItem = {
  id: string;
  factoryId: string;
  designCode: string;
  name: string;
  colour: string;
  qrPayload: string;
  packSize: number;
  sizeBreakdown: Record<string, number>;
  wholesalePricePerSet: number;
  photoUrl?: string;
  photoThumbUrl?: string;
  availableSets: number;
  active: boolean;
};

export type LocalOrderLine = {
  id: string;
  catalogueItemId?: string;
  designCode: string;
  name: string;
  colour: string;
  photoUrl?: string;
  packSize: number;
  sizeBreakdown: Record<string, number>;
  wholesalePricePerSet: number;
  setQty: number;
};

export type LocalAttachment = {
  id: string;
  blob?: Blob;
  dataUrl?: string;
  mimeType: string;
  filename: string;
  ocrSuggestions?: Array<{ designCode?: string; colour?: string; setQty?: number }>;
  synced?: boolean;
};

export type LocalOrder = {
  id: string; // clientId
  factoryId: string;
  userId: string;
  orderRef: string;
  status: 'draft' | 'generated' | 'synced' | 'needs_review';
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  customer: LocalCustomer;
  deliveryNote?: string;
  channel?: string;
  orderDate: string;
  lines: LocalOrderLine[];
  attachments: LocalAttachment[];
  totalSets: number;
  totalPieces: number;
  totalAmount: number;
  idempotencyKey: string;
  serverId?: string;
  version: number;
  reviewFlags?: Array<{ code: string; message: string }>;
  reviewMessage?: string;
  createdAt: string;
  updatedAt: string;
};

class ManniaquesDB extends Dexie {
  sessions!: Table<SessionRecord, string>;
  cacheMeta!: Table<CacheMeta, string>;
  customers!: Table<LocalCustomer, string>;
  catalogue!: Table<LocalCatalogueItem, string>;
  orders!: Table<LocalOrder, string>;

  constructor(factoryId: string, userId: string) {
    super(`manniaques_${factoryId}_${userId}`);
    this.version(1).stores({
      sessions: 'id',
      cacheMeta: 'id, factoryId',
      customers: 'id, factoryId, mobile, name, clientId',
      catalogue: 'id, factoryId, designCode, qrPayload, name',
      orders: 'id, factoryId, userId, syncStatus, status, updatedAt',
    });
  }
}

const dbCache = new Map<string, ManniaquesDB>();

export function getDb(factoryId: string, userId: string) {
  const key = `${factoryId}:${userId}`;
  let db = dbCache.get(key);
  if (!db) {
    db = new ManniaquesDB(factoryId, userId);
    dbCache.set(key, db);
  }
  return db;
}

export async function clearOtherFactoryCaches(
  keepFactoryId: string,
  keepUserId: string,
) {
  if (typeof indexedDB.databases !== 'function') return;
  const dbs = await indexedDB.databases();
  for (const info of dbs) {
    const name = info.name || '';
    if (!name.startsWith('manniaques_')) continue;
    const expected = `manniaques_${keepFactoryId}_${keepUserId}`;
    if (name !== expected) {
      indexedDB.deleteDatabase(name);
      for (const [key, db] of dbCache) {
        if (key !== `${keepFactoryId}:${keepUserId}`) {
          db.close();
          dbCache.delete(key);
        }
      }
    }
  }
}

export function calcOrderTotals(lines: LocalOrderLine[]) {
  let totalSets = 0;
  let totalPieces = 0;
  let totalAmount = 0;
  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.setQty || 0));
    totalSets += qty;
    totalPieces += qty * line.packSize;
    totalAmount += qty * line.wholesalePricePerSet;
  }
  return { totalSets, totalPieces, totalAmount };
}
