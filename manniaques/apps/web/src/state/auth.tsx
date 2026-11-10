import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { clearOtherFactoryCaches, getDb, type SessionRecord } from '../db/local';

type AuthState = {
  session: SessionRecord | null;
  loading: boolean;
  login: (mobile: string, pin: string, factoryId?: string) => Promise<{ needsFactoryChoice?: boolean; factories?: Array<{ id: string; name: string }> }>;
  logout: () => Promise<void>;
  refreshOfflineReady: () => Promise<boolean>;
  offlineReady: boolean;
  online: boolean;
};

const AuthContext = createContext<AuthState | null>(null);
const SESSION_KEY = 'manniaques.session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as SessionRecord;
        setSession(parsed);
        const db = getDb(parsed.factoryId, parsed.userId);
        await db.sessions.put(parsed);
        const meta = await db.cacheMeta.get(parsed.factoryId);
        setOfflineReady(Boolean(meta?.readyForOfflineSales));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function downloadCache(sess: SessionRecord) {
    const data = await api<{
      factoryId: string;
      downloadedAt: string;
      readyForOfflineSales: boolean;
      customers: Array<Record<string, unknown>>;
      catalogue: Array<Record<string, unknown>>;
    }>('/api/cache/bootstrap', { token: sess.token });

    const db = getDb(sess.factoryId, sess.userId);
    await clearOtherFactoryCaches(sess.factoryId, sess.userId);

    await db.transaction('rw', db.customers, db.catalogue, db.cacheMeta, async () => {
      await db.customers.where('factoryId').equals(sess.factoryId).delete();
      await db.catalogue.where('factoryId').equals(sess.factoryId).delete();

      await db.customers.bulkPut(
        data.customers.map((c) => ({
          id: String(c.id),
          factoryId: sess.factoryId,
          serverId: String(c.id),
          clientId: String(c.client_id || c.id),
          name: String(c.name),
          mobile: String(c.mobile),
          branch: c.branch ? String(c.branch) : '',
          buyerContact: c.buyer_contact ? String(c.buyer_contact) : '',
          deliveryAddress: c.delivery_address ? String(c.delivery_address) : '',
          notes: c.notes ? String(c.notes) : '',
          updatedAt: String(c.updated_at || new Date().toISOString()),
        })),
      );

      await db.catalogue.bulkPut(
        data.catalogue.map((item) => ({
          id: String(item.id),
          factoryId: sess.factoryId,
          designCode: String(item.design_code),
          name: String(item.name),
          colour: String(item.colour),
          qrPayload: String(item.qr_payload),
          packSize: Number(item.pack_size),
          sizeBreakdown: (item.size_breakdown || {}) as Record<string, number>,
          wholesalePricePerSet: Number(item.wholesale_price_per_set),
          photoUrl: item.photo_url ? String(item.photo_url) : undefined,
          photoThumbUrl: item.photo_thumb_url ? String(item.photo_thumb_url) : undefined,
          availableSets: Number(item.available_sets),
          active: Boolean(item.active),
        })),
      );

      await db.cacheMeta.put({
        id: sess.factoryId,
        factoryId: sess.factoryId,
        downloadedAt: data.downloadedAt,
        readyForOfflineSales: true,
      });
    });

    // Warm photo cache
    await Promise.allSettled(
      data.catalogue
        .map((item) => item.photo_thumb_url || item.photo_url)
        .filter(Boolean)
        .map((url) => fetch(String(url))),
    );

    setOfflineReady(true);
    return true;
  }

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      offlineReady,
      online,
      async login(mobile, pin, factoryId) {
        const result = await api<{
          needsFactoryChoice?: boolean;
          factories?: Array<{ id: string; name: string }>;
          token?: string;
          user?: {
            id: string;
            mobile: string;
            name: string;
            factoryId: string;
            factoryName: string;
            role: string;
            membershipId: string;
          };
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ mobile, pin, factoryId }),
        });

        if (result.needsFactoryChoice) {
          return { needsFactoryChoice: true, factories: result.factories };
        }

        const sess: SessionRecord = {
          id: 'current',
          token: result.token!,
          userId: result.user!.id,
          mobile: result.user!.mobile,
          name: result.user!.name,
          factoryId: result.user!.factoryId,
          factoryName: result.user!.factoryName,
          role: result.user!.role,
          roles: (result.user as { roles?: string[] }).roles || [result.user!.role],
          membershipId: result.user!.membershipId,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
        const db = getDb(sess.factoryId, sess.userId);
        await db.sessions.put(sess);
        setSession(sess);
        await downloadCache(sess);
        return {};
      },
      async logout() {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setOfflineReady(false);
      },
      async refreshOfflineReady() {
        if (!session) return false;
        if (!navigator.onLine) return offlineReady;
        return downloadCache(session);
      },
    }),
    [session, loading, offlineReady, online],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}
