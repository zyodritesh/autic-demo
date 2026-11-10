import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const mediaDir = '/cursor/stores/bc-cd5a7113-f5c7-4aa9-871d-03eb6e016e2b/media';
fs.mkdirSync(mediaDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  permissions: [], // camera denied
});
const page = await context.newPage();
page.on('console', (msg) => console.log('BROWSER:', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('button', { name: 'New sale' }).waitFor({ timeout: 15000 });
await page.screenshot({ path: path.join(mediaDir, 'home-mobile-360.png'), fullPage: true });

const ready = await page.getByText('Ready for offline sales').isVisible();
console.log('offlineReady', ready);

await page.getByRole('button', { name: 'New sale' }).click();
await page.getByText('Add design').waitFor({ timeout: 15000 });
console.log('sale url', page.url());

// pick showroom
await page.getByText('Kothari Showroom').first().click();
await page.getByRole('button', { name: 'Choose item' }).click();
await page.locator('.catalogue-tile').filter({ hasText: 'MNQ-403' }).click();
await page.waitForTimeout(200);
await page.locator('.catalogue-tile').filter({ hasText: 'MNQ-402' }).click();
await page.waitForTimeout(200);

async function setQtyFor(code, target) {
  const card = page.locator('.line-card').filter({ hasText: code }).first();
  await card.waitFor();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(120);
    const val = Number(await card.locator('input[type="number"]').inputValue());
    if (val === target) return;
    if (val < target) await card.getByRole('button', { name: '+' }).click();
    else await card.getByRole('button', { name: '−' }).click();
  }
}
await setQtyFor('MNQ-403', 2);
await setQtyFor('MNQ-402', 5);

await page.waitForTimeout(500);
const sticky = await page.locator('.sticky-bar').innerText();
console.log('sticky', sticky.replace(/\s+/g, ' '));
await page.screenshot({ path: path.join(mediaDir, 'sale-form-360.png'), fullPage: true });

const has7 = sticky.includes('7');
const has30 = sticky.includes('30');
const hasAmount = /21[,.]?600/.test(sticky);
console.log({ has7, has30, hasAmount });

await page.getByRole('button', { name: 'Generate order' }).click();
await page.getByText('Buyer order').waitFor({ timeout: 15000 });
await page.screenshot({ path: path.join(mediaDir, 'order-buyer-form.png'), fullPage: true });

await page.setViewportSize({ width: 1200, height: 800 });
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'New sale' }).waitFor();
await page.screenshot({ path: path.join(mediaDir, 'desktop-layout.png'), fullPage: true });

await browser.close();
console.log(JSON.stringify({ ok: has7 && has30 && hasAmount, sticky, ready }, null, 2));
if (!(has7 && has30 && hasAmount)) process.exit(1);
