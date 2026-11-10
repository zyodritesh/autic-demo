import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requireAuth, signToken } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const mobile = String(req.body.mobile || '').trim();
  const pin = String(req.body.pin || '').trim();
  const factoryId = req.body.factoryId ? String(req.body.factoryId) : undefined;

  if (!mobile || !pin) {
    return res.status(400).json({ error: 'Mobile and PIN required' });
  }

  const userResult = await query<{
    id: string;
    mobile: string;
    name: string;
    pin_hash: string;
  }>('SELECT id, mobile, name, pin_hash FROM users WHERE mobile = $1', [mobile]);

  const user = userResult.rows[0];
  if (!user || !(await bcrypt.compare(pin, user.pin_hash))) {
    return res.status(401).json({ error: 'Invalid mobile or PIN' });
  }

  const memberships = await query<{
    id: string;
    factory_id: string;
    role: string;
    roles: string[];
    factory_name: string;
  }>(
    `SELECT m.id, m.factory_id, m.role, m.roles, f.name AS factory_name
     FROM memberships m
     JOIN factories f ON f.id = m.factory_id
     WHERE m.user_id = $1 AND m.status = 'active' AND f.status = 'active'
     ORDER BY f.name`,
    [user.id],
  );

  if (memberships.rows.length === 0) {
    return res.status(403).json({ error: 'No active factory membership' });
  }

  let membership = memberships.rows[0];
  if (factoryId) {
    const match = memberships.rows.find((m) => m.factory_id === factoryId);
    if (!match) return res.status(403).json({ error: 'Not a member of that factory' });
    membership = match;
  } else if (memberships.rows.length > 1) {
    return res.json({
      needsFactoryChoice: true,
      user: { id: user.id, mobile: user.mobile, name: user.name },
      factories: memberships.rows.map((m) => ({
        id: m.factory_id,
        name: m.factory_name,
        role: m.role,
        roles: m.roles?.length ? m.roles : [m.role],
        membershipId: m.id,
      })),
    });
  }

  const roles = membership.roles?.length ? membership.roles : [membership.role];
  const token = signToken({
    userId: user.id,
    mobile: user.mobile,
    name: user.name,
    factoryId: membership.factory_id,
    role: membership.role,
    roles,
    membershipId: membership.id,
  });

  res.json({
    token,
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.name,
      factoryId: membership.factory_id,
      factoryName: membership.factory_name,
      role: membership.role,
      roles,
      membershipId: membership.id,
    },
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const membership = await query<{ factory_name: string; status: string }>(
    `SELECT f.name AS factory_name, m.status
     FROM memberships m JOIN factories f ON f.id = m.factory_id
     WHERE m.id = $1`,
    [req.auth!.membershipId],
  );
  const row = membership.rows[0];
  if (!row || row.status !== 'active') {
    return res.status(403).json({ error: 'Membership inactive' });
  }
  res.json({
    user: {
      ...req.auth,
      factoryName: row.factory_name,
    },
  });
});
