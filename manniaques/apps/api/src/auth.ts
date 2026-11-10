import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db/pool.js';

export type AuthUser = {
  userId: string;
  mobile: string;
  name: string;
  factoryId: string;
  role: string;
  roles: string[];
  membershipId: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function signToken(payload: AuthUser) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '30d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), config.jwtSecret) as AuthUser;
    req.auth = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function assertMembershipActive(auth: AuthUser) {
  const result = await query<{ status: string; role: string }>(
    `SELECT status, role FROM memberships
     WHERE id = $1 AND factory_id = $2 AND user_id = $3`,
    [auth.membershipId, auth.factoryId, auth.userId],
  );
  const row = result.rows[0];
  if (!row || row.status !== 'active') {
    return null;
  }
  return row;
}

export function canViewOrder(
  auth: AuthUser,
  orderCreatedBy: string,
): boolean {
  const roles = auth.roles?.length ? auth.roles : [auth.role];
  if (roles.includes('factory_admin') || roles.includes('super_admin') || roles.includes('accounts') || roles.includes('stores')) {
    return true;
  }
  return orderCreatedBy === auth.userId;
}
