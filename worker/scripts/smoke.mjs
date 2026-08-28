/**
 * End-to-end smoke test against a running `npm run dev`.
 *
 *   npm run dev      # in one terminal
 *   npm run smoke    # in another
 *
 * Drives a real purchase from catalogue to collection, covering the things that are
 * easy to get silently wrong: server-side pricing and the double-collect guard.
 * Reads DISTRIBUTOR_TOKEN from .dev.vars.
 */

import { readFileSync } from 'node:fs';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787';

// ---------- read .dev.vars ----------
let vars = {};
try {
	vars = Object.fromEntries(
		readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
			.split('\n')
			.filter((l) => l.trim() && !l.trim().startsWith('#'))
			.map((l) => {
				const i = l.indexOf('=');
				return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
			}),
	);
} catch {
	console.error('✖ No .dev.vars — copy .dev.vars.example to .dev.vars first.');
	process.exit(2);
}

const DIST_TOKEN = vars.DISTRIBUTOR_TOKEN;
if (!DIST_TOKEN) {
	console.error('✖ .dev.vars needs DISTRIBUTOR_TOKEN.');
	process.exit(2);
}

// ---------- tiny assertion harness ----------
let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
	if (ok) {
		pass++;
		console.log(`  ✔ ${label}`);
	} else {
		fail++;
		console.log(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
	}
};
const section = (t) => console.log(`\n${t}`);

const req = async (path, init = {}) => {
	const res = await fetch(BASE + path, init);
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	return { status: res.status, body };
};
const post = (path, obj, headers = {}) =>
	req(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(obj) });

const AUTH = { Authorization: `Bearer ${DIST_TOKEN}` };

// ============================================================
section('1. Health & catalogue');

const health = await req('/api/health');
check('GET /api/health responds', health.status === 200 && health.body.ok === true, `status ${health.status}`);

const cat = await req('/api/merch');
const items = cat.body?.merch ?? [];
check('GET /api/merch returns items', items.length > 0, `${items.length} items — did you run npm run db:seed?`);

const sized = items.find((m) => m.has_size);
const unsized = items.find((m) => !m.has_size);
check('catalogue has a sized and an unsized item', Boolean(sized && unsized));
check('prices are integer paise', items.every((m) => Number.isInteger(m.price_paise)));

if (!sized || !unsized) {
	console.log('\nCannot continue without both item kinds.');
	process.exit(1);
}

// ============================================================
section('2. Checkout prices from the database, never the client');

const bogus = await post('/api/checkout', { cart: [{ merch_id: 'MER_ZZZZZZZZ', quantity: 1 }] });
check('unknown merch id rejected', bogus.status === 400 && bogus.body.error === 'unknown_merch', JSON.stringify(bogus.body));

const noSize = await post('/api/checkout', { cart: [{ merch_id: sized.id, quantity: 1 }] });
check('sized item without a size rejected', noSize.body.error === 'size_required', JSON.stringify(noSize.body));

const badSize = await post('/api/checkout', { cart: [{ merch_id: unsized.id, quantity: 1, size: 'M' }] });
check('size on an unsized item rejected', badSize.body.error === 'size_not_allowed', JSON.stringify(badSize.body));

const frac = await post('/api/checkout', { cart: [{ merch_id: unsized.id, quantity: 1.5 }] });
check('fractional quantity rejected', frac.body.error === 'bad_quantity', JSON.stringify(frac.body));

// the important one: a hostile cart claiming its own price
const spoof = await post('/api/checkout', {
	cart: [{ merch_id: unsized.id, quantity: 1, price_paise: 1, unit_price_paise: 1 }],
	total_price_paise: 1,
});
check(
	`client-supplied price ignored (charged ${spoof.body.total_price_paise}, not 1)`,
	spoof.body.total_price_paise === unsized.price_paise,
	JSON.stringify(spoof.body),
);

// ============================================================
section('3. A real order');

const expected = sized.price_paise * 2 + unsized.price_paise;
const created = await post('/api/checkout', {
	cart: [
		{ merch_id: sized.id, quantity: 2, size: 'M' },
		{ merch_id: unsized.id, quantity: 1 },
	],
});
check('checkout returns 201', created.status === 201, `status ${created.status}`);
check(
	`total is ${expected} paise (₹${(expected / 100).toFixed(2)})`,
	created.body.total_price_paise === expected,
	`got ${created.body.total_price_paise}`,
);
check('order id is unguessable', /^ORD_[0-9A-HJKMNP-TV-Z]{26}$/.test(created.body.order_id ?? ''), created.body.order_id);

const orderId = created.body.order_id;
check('checkout reports direct-pay mode', created.body.mode === 'direct', `mode ${created.body.mode}`);

const beforePay = await req(`/api/orders/${orderId}`);
check('order starts unpaid', beforePay.body.payment_status === 'unpaid');
check('no QR before payment', beforePay.body.qr_payload === null);

// ============================================================
section('4. Counter payment (no gateway)');

const badPhone = await post('/api/pay', { order_id: orderId, name: 'Ananya Rao', phone: '123', email: 'a@iisertvm.ac.in' });
check('bad phone rejected', badPhone.status === 400 && badPhone.body.error === 'bad_phone', JSON.stringify(badPhone.body));

const badEmail = await post('/api/pay', { order_id: orderId, name: 'Ananya Rao', phone: '9876543210', email: 'nope' });
check('bad email rejected', badEmail.status === 400 && badEmail.body.error === 'bad_email', JSON.stringify(badEmail.body));

const wrongDomain = await post('/api/pay', { order_id: orderId, name: 'Ananya Rao', phone: '9876543210', email: 'ananya@gmail.com' });
check('non-college email rejected', wrongDomain.status === 400 && wrongDomain.body.error === 'bad_email', JSON.stringify(wrongDomain.body));

const stillUnpaid = await req(`/api/orders/${orderId}`);
check('a rejected payment left the order unpaid', stillUnpaid.body.payment_status === 'unpaid');

const paid = await post('/api/pay', {
	order_id: orderId,
	name: '  Ananya   Rao ',
	phone: '+91 98765 43210',
	email: 'Ananya@IISERTVM.AC.IN',
});
check('payment accepted', paid.status === 201 && paid.body.payment_status === 'paid', JSON.stringify(paid.body));
check('worker minted its own transaction id', /^TXN_[0-9A-HJKMNP-TV-Z]{26}$/.test(paid.body.transaction_id ?? ''), paid.body.transaction_id);
check('details normalised on the way in', paid.body.customer?.phone === '9876543210' && paid.body.customer?.email === 'ananya@iisertvm.ac.in' && paid.body.customer?.name === 'Ananya Rao', JSON.stringify(paid.body.customer));

const rePay = await post('/api/pay', { order_id: orderId, name: 'Ananya Rao', phone: '9876543210', email: 'a@iisertvm.ac.in' });
check('paying twice is a no-op', rePay.body.idempotent === true, JSON.stringify(rePay.body));

// the webhook route still exists and still refuses anything unsigned
const forged = await req('/api/webhooks/razorpay', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'deadbeef' },
	body: JSON.stringify({ event: 'payment.captured' }),
});
check('unsigned webhook still rejected', forged.status === 401, `status ${forged.status}`);

// ============================================================
section('5. Receipt & QR');

const receipt = await req(`/api/orders/${orderId}`);
check('order now paid', receipt.body.payment_status === 'paid');
check('QR payload is the order id', receipt.body.qr_payload === orderId);
check('transaction id recorded', typeof receipt.body.razorpay_transaction_id === 'string');
check(
	'no PII in the public receipt',
	!JSON.stringify(receipt.body).includes('ananya@iisertvm.ac.in') &&
		!JSON.stringify(receipt.body).includes('9876543210'),
);

// ============================================================
section('6. Distribution');

const noAuth = await post('/api/distributor/scan', { order_id: orderId });
check('scan without a token rejected', noAuth.status === 401, `status ${noAuth.status}`);

const scan = await post('/api/distributor/scan', { order_id: orderId }, AUTH);
check('scan says collectable', scan.body.verdict === 'ok' && scan.body.collectable === true, JSON.stringify(scan.body?.verdict));
check('scan returns the items to hand over', (scan.body.order?.items ?? []).length === 2);
check('distributor DOES see full transaction info', Boolean(scan.body.payment?.transaction_info?.email));

const collect1 = await post('/api/distributor/collect', { order_id: orderId }, AUTH);
check('first collect succeeds', collect1.status === 200 && collect1.body.collected === true, JSON.stringify(collect1.body));

const collect2 = await post('/api/distributor/collect', { order_id: orderId }, AUTH);
check('second collect refused (409)', collect2.status === 409 && collect2.body.error === 'already_collected', JSON.stringify(collect2.body));

const rescan = await post('/api/distributor/scan', { order_id: orderId }, AUTH);
check('re-scan reports already_collected', rescan.body.verdict === 'already_collected');

const unpaidOrder = await post('/api/checkout', { cart: [{ merch_id: unsized.id, quantity: 1 }] });
const collectUnpaid = await post('/api/distributor/collect', { order_id: unpaidOrder.body.order_id }, AUTH);
check('cannot collect an unpaid order', collectUnpaid.status === 409 && collectUnpaid.body.error === 'unpaid', JSON.stringify(collectUnpaid.body));

// ============================================================
console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✔ all ${pass} checks passed` : `✖ ${fail} failed, ${pass} passed`);
console.log(`  order used: ${orderId}`);
process.exit(fail === 0 ? 0 : 1);
