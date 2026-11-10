import { chromium } from 'playwright';
import fs from 'node:fs';

const mediaDir = '/cursor/stores/bc-cd5a7113-f5c7-4aa9-871d-03eb6e016e2b/media';
fs.mkdirSync(mediaDir, { recursive: true });
const APP = process.env.APP_URL || 'http://127.0.0.1:8787';
const API = process.env.API_URL || 'http://127.0.0.1:8787';

async function countOrders(token) {
  const res = await fetch(`${API}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.orders || [];
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('BROWSER ERR', msg.text());
});

await page.goto(APP, { waitUntil: 'networkidle' });
// wait for service worker
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Ready for offline sales').waitFor({ timeout: 20000 });
await page.waitForTimeout(1500); // allow SW precache

const token = await page.evaluate(() => JSON.parse(localStorage.getItem('manniaques.session')).token);
const before = await countOrders(token);

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New sale' }).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'New sale' }).click();
await page.getByText('Add design').waitFor({ timeout: 15000 });

await page.getByTestId('customer-9811111111').first().click();
await page.getByText('Selected').first().waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Choose item' }).click();
await page.locator('.catalogue-tile').filter({ hasText: 'MNQ-401' }).click();
await page.waitForTimeout(250);

const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('button', { name: 'Photo' }).click().then(async () => {
    await page.getByRole('button', { name: 'Attach screenshot' }).click();
  }),
]);
await fileChooser.setFiles({
  name: 'handwritten.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
});
await page.getByText('Photo saved on phone').waitFor({ timeout: 5000 });

const saleUrl = page.url();
await page.reload({ waitUntil: 'domcontentloaded' });
// SPA should restore the same draft from IndexedDB
await page.getByText('MNQ-401').first().waitFor({ timeout: 15000 });
await page.screenshot({ path: `${mediaDir}/offline-draft-restored.png`, fullPage: true });
await page.getByRole('button', { name: 'Generate order' }).click();
await page.getByText('Saved on phone · Waiting to sync').waitFor({ timeout: 10000 });
await page.screenshot({ path: `${mediaDir}/offline-order-waiting-sync.png`, fullPage: true });
console.log('restored from', saleUrl);

const orderUrl = page.url();
const clientId = orderUrl.split('/').pop();

await context.setOffline(false);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Retry sync' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Retry sync' }).click();
await page.waitForTimeout(1500);

const after = await countOrders(token);
const matches = after.filter((o) => o.client_id === clientId);
const detail = matches[0]
  ? await fetch(`${API}/api/orders/${matches[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())
  : null;

const result = {
  ok: matches.length === 1 && (detail?.attachments?.length || 0) >= 1,
  beforeCount: before.length,
  afterCount: after.length,
  matches: matches.length,
  attachments: detail?.attachments?.length || 0,
  totalSets: matches[0]?.total_sets,
  totalPieces: matches[0]?.total_pieces,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);
