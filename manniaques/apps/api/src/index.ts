import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { cacheRouter } from './routes/cache.js';
import { ordersRouter } from './routes/orders.js';
import { modulesRouter } from './routes/modules.js';
import { seedIfEmpty } from './db/seed.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'manniaques-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/orders', ordersRouter);
app.use('/api', modulesRouter);

// Serve built web app in production if present
const webDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/dist',
);
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api)(?!\/uploads).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const msg = err.message || '';
    if (
      msg.includes('Only JPEG') ||
      msg.includes('File too large') ||
      (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      return res.status(400).json({ error: msg || 'Invalid upload' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  },
);

async function main() {
  if (config.allowDemoSeed) {
    try {
      await seedIfEmpty();
    } catch (err) {
      console.error('Startup seed skipped/failed:', err);
    }
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Manniaques API on http://127.0.0.1:${config.port}`);
  });
}

main();

