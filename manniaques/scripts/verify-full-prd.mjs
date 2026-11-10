#!/usr/bin/env node
const API = process.env.API_URL || 'http://127.0.0.1:8787';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function login(mobile) {
  return req('/api/auth/login', { method: 'POST', body: { mobile, pin: '1234' } });
}

const results = [];

const admin = await login('9000000002');
const purchase = await login('9000000004');
const production = await login('9000000005');
const sales = await login('9000000001');
const accounts = await login('9000000007');
const superAdmin = await login('9000000009');

const home = await req('/api/home', { token: admin.token });
results.push(`OK home access keys: ${Object.keys(home.access).filter((k) => home.access[k]).join(',')}`);

const items = await req('/api/items?type=raw', { token: purchase.token });
const fabric = items.items.find((i) => i.code === 'FAB-COT-WHT');
const vendors = await req('/api/vendors', { token: purchase.token });
const vendor = vendors.vendors.find((v) => v.name.includes('Gujarat'));

const po = await req('/api/purchase-orders', {
  method: 'POST',
  token: purchase.token,
  body: {
    clientId: crypto.randomUUID(),
    vendorId: vendor.id,
    vendorSnapshot: vendor,
    status: 'confirmed',
    lines: [
      {
        itemId: fabric.id,
        itemName: fabric.name,
        stockUnit: 'metre',
        qty: 100,
        rate: 100,
      },
    ],
  },
});
const poDetail = await req(`/api/purchase-orders/${po.order.id}`, { token: purchase.token });
await req(`/api/purchase-orders/${po.order.id}/receive`, {
  method: 'POST',
  token: purchase.token,
  body: {
    lines: [
      {
        poLineId: poDetail.lines[0].id,
        itemId: fabric.id,
        qty: 60,
        unitCost: 100,
      },
    ],
  },
});
const fabricAfter = (await req('/api/items?type=raw&q=FAB-COT-WHT', { token: purchase.token })).items[0];
// seed 200 + 60 = 260
if (Number(fabricAfter.on_hand) !== 260) throw new Error(`fabric on_hand ${fabricAfter.on_hand} != 260`);
results.push('OK PO receive 60 of 100 → stock +60');

const styles = await req('/api/styles', { token: production.token });
const style = styles.styles.find((s) => s.design_code === 'MNQ-401');
const karigar = vendors.vendors.find((v) => v.is_karigar);
const jw = await req('/api/job-work', {
  method: 'POST',
  token: production.token,
  body: {
    clientId: crypto.randomUUID(),
    vendorId: karigar.id,
    vendorSnapshot: karigar,
    styleId: style.id,
    process: 'stitching',
    targetQty: 100,
    rate: 80,
    status: 'draft',
  },
});
await req(`/api/job-work/${jw.order.id}/confirm`, { method: 'POST', token: production.token });
const jwDetail = await req(`/api/job-work/${jw.order.id}`, { token: production.token });
await req(`/api/job-work/${jw.order.id}/issue`, {
  method: 'POST',
  token: production.token,
  body: {
    lines: jwDetail.materials.map((m) => ({
      materialId: m.id,
      itemId: m.item_id,
      qty: Number(m.qty_planned),
    })),
  },
});
const recv = await req(`/api/job-work/${jw.order.id}/receive`, {
  method: 'POST',
  token: production.token,
  body: { acceptedQty: 70, reworkQty: 0, rejectedQty: 0 },
});
if (recv.billable !== 5600) throw new Error(`billable ${recv.billable} != 5600`);
if (recv.pending !== 30) throw new Error(`pending ${recv.pending} != 30`);
results.push('OK job work 70 accepted → ₹5600 billable, 30 pending');

// sales + tax invoice
const cache = await req('/api/cache/bootstrap', { token: sales.token });
const five = cache.catalogue.find((c) => c.pack_size === 5);
const showroom = cache.customers[0];
const sync = await req('/api/orders/sync', {
  method: 'POST',
  token: sales.token,
  body: {
    clientId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    orderRef: `SO-FULL-${Date.now()}`,
    customer: {
      id: showroom.id,
      name: showroom.name,
      mobile: showroom.mobile,
    },
    lines: [
      {
        catalogueItemId: five.id,
        designCode: five.design_code,
        name: five.name,
        colour: five.colour,
        packSize: five.pack_size,
        sizeBreakdown: five.size_breakdown,
        wholesalePricePerSet: five.wholesale_price_per_set,
        setQty: 2,
      },
    ],
  },
});
const inv = await req(`/api/orders/${sync.orderId}/tax-invoice`, {
  method: 'POST',
  token: accounts.token,
  body: {},
});
results.push(`OK tax invoice ${inv.invoice.invoice_ref} total ₹${inv.invoice.total}`);

await req(`/api/orders/${sync.orderId}/dispatch`, {
  method: 'POST',
  token: admin.token,
});
const agents = await req('/api/agents', { token: admin.token });
results.push(`OK commission lines after dispatch: ${agents.lines.length}`);

const report = await req('/api/reports/summary', { token: accounts.token });
results.push(`OK reports netSales ₹${report.netSales}`);

const invite = await req('/api/team/invite', {
  method: 'POST',
  token: admin.token,
  body: { name: 'Temp Staff', mobile: '9099999999', roles: ['sales'] },
});
results.push(`OK team invite ${invite.invite.status}`);

const factory = await req('/api/factories', {
  method: 'POST',
  token: superAdmin.token,
  body: { name: 'Demo Mills', adminMobile: '9088888888', adminName: 'Demo Admin' },
});
results.push(`OK super-admin factory ${factory.factory.name}`);

// unit cost check MNQ-401: 2.5*100+80+20+10=360
const stylesCost = await req('/api/styles', { token: sales.token });
const mnq401 = stylesCost.styles.find((s) => s.design_code === 'MNQ-401');
const variant =
  (mnq401?.variants || []).find((v) => v.colour === 'Indigo') ||
  cache.catalogue.find((c) => c.design_code === 'MNQ-401');
if (Number(variant.estimated_unit_cost) !== 360) {
  throw new Error(`unit cost ${variant.estimated_unit_cost} != 360`);
}
results.push('OK style cost ₹360/pc (2.5m×100 + 80 + 20 + 10)');

console.log(JSON.stringify({ ok: true, results }, null, 2));
