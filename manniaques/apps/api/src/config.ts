import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 8787),
  jwtSecret:
    process.env.JWT_SECRET?.trim() ||
    'local-dev-only-set-JWT_SECRET-in-production',
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(__dirname, '../uploads'),
  webOrigin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5173',
};
