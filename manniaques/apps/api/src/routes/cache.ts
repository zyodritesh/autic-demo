import { Router } from 'express';
import { assertMembershipActive, requireAuth } from '../auth.js';
import { query } from '../db/pool.js';

export const cacheRouter = Router();

cacheRouter.use(requireAuth);

cacheRouter.get('/bootstrap', async (req, res) => {
  const auth = req.auth!;
  const membership = await assertMembershipActive(auth);
  if (!membership) return res.status(403).json({ error: 'Access revoked' });

  const [customers, catalogue] = await Promise.all([
    query(
      `SELECT id, factory_id, client_id, name, mobile, branch, buyer_contact,
              delivery_address, notes, updated_at
       FROM customers WHERE factory_id = $1 ORDER BY name`,
      [auth.factoryId],
    ),
    query(
      `SELECT id, factory_id, design_code, name, colour, qr_payload, pack_size,
              size_breakdown, wholesale_price_per_set::float8 AS wholesale_price_per_set,
              photo_url, photo_thumb_url, available_sets, active,
              estimated_unit_cost::float8 AS estimated_unit_cost, hsn, style_id
       FROM catalogue_items
       WHERE factory_id = $1 AND active = true AND NOT COALESCE(trashed,false)
       ORDER BY design_code, colour`,
      [auth.factoryId],
    ),
  ]);

  res.json({
    factoryId: auth.factoryId,
    downloadedAt: new Date().toISOString(),
    readyForOfflineSales: true,
    customers: customers.rows,
    catalogue: catalogue.rows,
  });
});
