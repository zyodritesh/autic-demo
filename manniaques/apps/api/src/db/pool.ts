import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
