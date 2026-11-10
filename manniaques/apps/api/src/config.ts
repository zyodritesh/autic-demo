import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Bind it as an app secret before starting.',
    );
  }

  // Ephemeral local-dev only — never a fixed string in source.
  const ephemeral = randomBytes(32).toString('hex');
  console.warn(
    '[config] JWT_SECRET unset; using ephemeral local-dev secret (tokens reset on restart)',
  );
  return ephemeral;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  jwtSecret: resolveJwtSecret(),
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(__dirname, '../uploads'),
  webOrigin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5173',
  allowDemoSeed: process.env.SEED_DEMO === '1',
};
