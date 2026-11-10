#!/usr/bin/env node
/**
 * First-release verification against running API.
 */
const API = process.env.API_URL || 'http://127.0.0.1:8787';

async function req(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !formData) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: formData || payload,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(mobile) {
  const { status, json } = await req('/api/auth/login', {
    method: 'POST',
    body: { mobile, pin: '1234' },
  });
  assert(status === 200 && json.token, `login failed for ${mobile}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const results = [];
  const riya = await login('9000000001');
  const sara = await login('9000000003');

  const cache = await req('/api/cache/bootstrap', { token: riya.token });
  assert(cache.status === 200 && cache.json.readyForOfflineSales, 'bootstrap failed');
  assert(cache.json.catalogue.length >= 4, 'expected sample designs');
  results.push('OK bootstrap cache + Ready for offline sales');

  const five = cache.json.catalogue.find((c) => c.pack_size === 5 && c.design_code === 'MNQ-403');
  const four = cache.json.catalogue.find((c) => c.pack_size === 4 && c.design_code === 'MNQ-402');
  assert(five && four, 'missing 4pc/5pc designs');

  const showroom = cache.json.customers.find((c) => c.name === 'Kothari Showroom');
  assert(showroom, 'missing showroom');

  const clientId = crypto.randomUUID();
  const idem = crypto.randomUUID();
  const orderPayload = {
    clientId,
    idempotencyKey: idem,
    orderRef: `SO-TEST-${Date.now()}`,
    customer: {
      id: showroom.id,
      clientId: showroom.client_id || showroom.id,
      name: showroom.name,
      mobile: showroom.mobile,
      branch: showroom.branch,
      buyerContact: showroom.buyer_contact,
      deliveryAddress: showroom.delivery_address,
    },
    deliveryNote: 'Verify pack math',
    lines: [
      {
        catalogueItemId: five.id,
        designCode: five.design_code,
        name: five.name,
        colour: five.colour,
        photoUrl: five.photo_url,
        packSize: five.pack_size,
        sizeBreakdown: five.size_breakdown,
        wholesalePricePerSet: five.wholesale_price_per_set,
        setQty: 2,
      },
      {
        catalogueItemId: four.id,
        designCode: four.design_code,
        name: four.name,
        colour: four.colour,
        photoUrl: four.photo_url,
        packSize: four.pack_size,
        sizeBreakdown: four.size_breakdown,
        wholesalePricePerSet: four.wholesale_price_per_set,
        setQty: 5,
      },
    ],
  };

  const expectedSets = 7;
  const expectedPieces = 2 * 5 + 5 * 4; // 30
  const expectedAmount =
    2 * five.wholesale_price_per_set + 5 * four.wholesale_price_per_set;

  const sync1 = await req('/api/orders/sync', {
    method: 'POST',
    token: riya.token,
    body: orderPayload,
  });
  assert(sync1.status === 200, `sync1 failed ${JSON.stringify(sync1.json)}`);
  assert(sync1.json.totalSets === expectedSets, `sets ${sync1.json.totalSets} != ${expectedSets}`);
  assert(
    sync1.json.totalPieces === expectedPieces,
    `pieces ${sync1.json.totalPieces} != ${expectedPieces}`,
  );
  assert(
    Number(sync1.json.totalAmount) === expectedAmount,
    `amount ${sync1.json.totalAmount} != ${expectedAmount}`,
  );
  results.push(
    `OK pack math: ${expectedSets} sets, ${expectedPieces} pcs, ₹${expectedAmount}`,
  );

  const sync2 = await req('/api/orders/sync', {
    method: 'POST',
    token: riya.token,
    body: orderPayload,
  });
  assert(sync2.status === 200, `sync2 failed ${JSON.stringify(sync2.json)}`);
  assert(sync2.json.orderId === sync1.json.orderId, 'idempotency returned different orderId');

  const list = await req('/api/orders', { token: riya.token });
  const matches = list.json.orders.filter((o) => o.client_id === clientId);
  assert(matches.length === 1, `expected 1 order, got ${matches.length}`);
  results.push('OK double sync → exactly one server order');

  // Attachment
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('clientId', crypto.randomUUID());
  form.append('file', new Blob([png], { type: 'image/png' }), 'note.png');
  const att = await req(`/api/orders/${sync1.json.orderId}/attachments`, {
    method: 'POST',
    token: riya.token,
    formData: form,
  });
  assert(att.status === 200 && att.json.attachment?.id, `attach failed ${JSON.stringify(att.json)}`);
  results.push('OK attachment linked to order');

  // Factory isolation
  const cross = await req(`/api/orders/${sync1.json.orderId}`, { token: sara.token });
  assert(cross.status === 404 || cross.status === 403, `cross-factory order leak: ${cross.status}`);
  const crossAtt = await req(
    `/api/orders/${sync1.json.orderId}/attachments/${att.json.attachment.id}`,
    { token: sara.token },
  );
  assert(
    crossAtt.status === 404 || crossAtt.status === 403,
    `cross-factory attachment leak: ${crossAtt.status}`,
  );
  results.push('OK second factory cannot open first factory order/attachment');

  // Sara bootstrap is aurora-only
  const aurora = await req('/api/cache/bootstrap', { token: sara.token });
  assert(
    aurora.json.catalogue.every((c) => c.factory_id === sara.user.factoryId),
    'aurora catalogue leaked manniaques',
  );
  results.push('OK factory-scoped catalogue cache');

  console.log(JSON.stringify({ ok: true, results, expectedAmount }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
