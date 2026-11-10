import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';

export function fyFor(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

export async function nextDocRef(
  factoryId: string,
  docType: string,
  prefix: string,
  client?: PoolClient,
) {
  const fy = fyFor();
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO document_sequences (factory_id, doc_type, fy, last_no)
     VALUES ($1,$2,$3,0)
     ON CONFLICT (factory_id, doc_type, fy) DO NOTHING`,
    [factoryId, docType, fy],
  );
  const updated = await run(
    `UPDATE document_sequences SET last_no = last_no + 1
     WHERE factory_id = $1 AND doc_type = $2 AND fy = $3
     RETURNING last_no`,
    [factoryId, docType, fy],
  );
  const n = String(updated.rows[0].last_no).padStart(4, '0');
  return `${prefix}-${fy}-${n}`;
}

export function apparelGst(pieceTaxable: number) {
  const rate = pieceTaxable <= 2500 ? 0.05 : 0.18;
  return { rate, gst: Math.round(pieceTaxable * rate * 100) / 100 };
}
