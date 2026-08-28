/** Endpoint handlers. Each one throws ApiError; index.ts turns that into a response. */

import { MAX_LINES, type MerchRow, type PricedCart, type PricedLine, parseCart, priceCart } from './cart.ts';
import { normaliseRoll, parseCustomer } from './customer.ts';
import { sendOrderEmail } from './email.ts';
import {
	createRazorpayOrder,
	paymentFromEvent,
	verifyWebhookSignature,
	type WebhookEvent,
} from './razorpay.ts';
import {
	ApiError,
	bad,
	type Env,
	json,
	looksLikeOrderId,
	newOrderId,
	newPaymentId,
	newTransactionId,
	notFound,
	readJson,
	requireBudget,
} from './util.ts';

type Cors = Record<string, string>;

// ============================================================
// 1. GET /api/merch — the catalogue
// ============================================================
export async function listMerch(
	env: Env,
	cors: Cors,
	req?: Request,
	ctx?: ExecutionContext,
): Promise<Response> {
	// The most requested route on the site: every storefront load pays two D1 round
	// trips for a catalogue that changes a few times a week. Cached at the edge, and
	// purged by purgeCatalogue() the moment an admin writes, so the short max-age is
	// only the ceiling for colos the purge did not reach.
	const cache = caches.default;
	const cacheKey = req ? new Request(new URL(req.url).toString(), { method: 'GET' }) : null;
	if (cacheKey) {
		const hit = await cache.match(cacheKey);
		// The cached copy carries whichever origin's CORS headers filled it, so they are
		// overwritten with this request's rather than trusted — same as merchImage.
		if (hit) {
			const headers = new Headers(hit.headers);
			for (const [k, v] of Object.entries(cors)) headers.set(k, v);
			return new Response(hit.body, { headers, status: hit.status });
		}
	}

	const { results } = await env.DB.prepare(
		`SELECT id, name, description, designer, category, price_paise, has_size, r2_path
		   FROM merch WHERE is_active = 1 ORDER BY category, id`,
	).all<
		MerchRow & { description: string; designer: string; category: string; r2_path: string }
	>();

	// One query for every extra view rather than one per item: a catalogue of N items
	// would otherwise cost N+1 round trips to render a carousel most items don't use.
	const { results: extras } = await env.DB.prepare(
		`SELECT mi.merch_id, mi.label
		   FROM merch_images mi JOIN merch m ON m.id = mi.merch_id
		  WHERE m.is_active = 1
		  ORDER BY mi.merch_id, mi.sort, mi.id`,
	).all<{ merch_id: string; label: string }>();

	const viewsFor = new Map<string, string[]>();
	for (const e of extras) (viewsFor.get(e.merch_id) ?? viewsFor.set(e.merch_id, []).get(e.merch_id)!).push(e.label);

	const body = json(
		{
			merch: results.map((m) => {
				const labels = viewsFor.get(m.id) ?? [];
				return {
					id: m.id,
					name: m.name,
					description: m.description,
					designer: m.designer,
					category: m.category,
					price_paise: m.price_paise,
					has_size: m.has_size === 1,
					// URLs, not bytes. Inlining images as base64 in this JSON would bloat
					// the payload ~33% and make it uncacheable as a whole; the browser
					// fetches each image separately and caches it on its own.
					image_url: `/api/merch/${m.id}/image`,
					// Index 0 is the primary image, then each extra view in sort order.
					// An item with no image at all still gets one entry, so the carousel
					// always has something to point at and falls back to the category icon.
					views: [
						{ label: 'Front', url: `/api/merch/${m.id}/image/0` },
						...labels.map((label, i) => ({ label, url: `/api/merch/${m.id}/image/${i + 1}` })),
					],
				};
			}),
		},
		{},
		cors,
	);

	body.headers.set('Cache-Control', 'public, max-age=60');
	if (cacheKey && ctx) ctx.waitUntil(cache.put(cacheKey, body.clone()));
	return body;
}

// ============================================================
// 2. GET /api/merch/:id/image — stream one image out of R2
// ============================================================
export async function merchImage(
	env: Env,
	id: string,
	cors: Cors,
	index = 0,
	req?: Request,
	ctx?: ExecutionContext,
): Promise<Response> {
	// Edge cache first. Without this every thumbnail on the storefront costs a D1 query
	// AND an R2 GET on every cold browser cache — the catalogue grid is the most
	// requested thing on the site, and none of that work changes between requests.
	// Keyed on the request URL, which already encodes the item and the view index.
	const cache = caches.default;
	const cacheKey = req ? new Request(new URL(req.url).toString(), { method: 'GET' }) : null;
	if (cacheKey) {
		const hit = await cache.match(cacheKey);
		// CORS is per-origin and must not be served from a shared cache, so the cached
		// copy carries none — the live headers are merged back on the way out.
		if (hit) {
			const headers = new Headers(hit.headers);
			for (const [k, v] of Object.entries(cors)) headers.set(k, v);
			return new Response(hit.body, { headers, status: hit.status });
		}
	}

	let path: string | undefined;

	if (index === 0) {
		const row = await env.DB.prepare(`SELECT r2_path FROM merch WHERE id = ? AND is_active = 1`)
			.bind(id)
			.first<{ r2_path: string }>();
		if (!row) throw notFound('No such item');
		path = row.r2_path;
	} else {
		// OFFSET, not an array index in JS: fetching every row to pick one would read the
		// whole carousel out of D1 on each image request.
		const row = await env.DB.prepare(
			`SELECT mi.r2_path FROM merch_images mi
			   JOIN merch m ON m.id = mi.merch_id
			  WHERE mi.merch_id = ? AND m.is_active = 1
			  ORDER BY mi.sort, mi.id
			  LIMIT 1 OFFSET ?`,
		)
			.bind(id, index - 1)
			.first<{ r2_path: string }>();
		if (!row) throw notFound('No such view');
		path = row.r2_path;
	}

	// An item created without a picture has an empty r2_path; that is expected, and the
	// storefront draws its category icon instead.
	if (!path) throw notFound('No image for this item');

	const object = await env.MEDIA.get(path);
	if (!object) throw notFound('Image missing from storage');

	const headers = new Headers(cors);
	object.writeHttpMetadata(headers); // Content-Type etc. as uploaded
	headers.set('etag', object.httpEtag);
	headers.set('Cache-Control', 'public, max-age=86400');

	const response = new Response(object.body, { headers });

	// clone(), not arrayBuffer(): the body stays a stream, so the browser starts
	// receiving bytes immediately instead of waiting for the whole image to buffer.
	// The cached copy keeps whichever origin's CORS headers this request had, which is
	// why the hit path above overwrites them rather than trusting what it finds.
	if (cacheKey && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()));

	return response;
}

// ============================================================
// 3. POST /api/checkout — validate, price, create order + Razorpay order
// ============================================================
export async function checkout(env: Env, req: Request, cors: Cors): Promise<Response> {
	await requireBudget(env, req, 'checkout');
	const body = await readJson<{ cart?: unknown }>(req);
	const lines = parseCart(body);

	// One query for every id in the cart. Looping per line would mean N round trips
	// and, worse, a cart could be priced against a catalogue that changed midway.
	const ids = [...new Set(lines.map((l) => l.merch_id))];
	const placeholders = ids.map(() => '?').join(',');
	const { results: rows } = await env.DB.prepare(
		`SELECT id, name, price_paise, has_size FROM merch
		  WHERE is_active = 1 AND id IN (${placeholders})`,
	)
		.bind(...ids)
		.all<MerchRow>();

	const priced: PricedCart = priceCart(lines, rows);

	const orderId = newOrderId();

	// While DIRECT_PAY is on there is no gateway, so no Razorpay order is created and
	// razorpay_order_id stays NULL. Creating a throwaway stub id instead would put rows
	// in the table that look like real gateway orders and confuse later reconciliation.
	const direct = env.DIRECT_PAY === '1';
	const rzp = direct ? null : await createRazorpayOrder(env, orderId, priced.total_price_paise);

	await env.DB.prepare(
		`INSERT INTO orders (order_id, order_info, total_price_paise, payment_status,
		                     collection_status, razorpay_order_id)
		 VALUES (?, ?, ?, 'unpaid', 'pending', ?)`,
	)
		.bind(orderId, JSON.stringify(priced.lines), priced.total_price_paise, rzp?.id ?? null)
		.run();

	return json(
		{
			order_id: orderId,
			total_price_paise: priced.total_price_paise,
			items: priced.lines,
			// Tells the browser which payment path to take. `direct` means collect the
			// buyer's details and POST /api/pay; otherwise open Razorpay Checkout.
			mode: direct ? 'direct' : 'razorpay',
			razorpay: rzp
				? {
						order_id: rzp.id,
						amount: rzp.amount,
						currency: rzp.currency,
						// Publishable id, safe in the browser — what Checkout.js needs.
						// RAZORPAY_KEY_SECRET must never leave the worker.
						key_id: env.RAZORPAY_KEY_ID ?? null,
					}
				: null,
		},
		{ status: 201 },
		cors,
	);
}

// ============================================================
// 4. POST /api/webhooks/razorpay — the only writer of payment_status
// ============================================================
export async function razorpayWebhook(env: Env, req: Request): Promise<Response> {
	// Raw text, not req.json(): the HMAC is over the exact bytes Razorpay sent.
	const raw = await req.text();
	// Cap before hashing: HMAC over an unbounded body is CPU an unauthenticated caller
	// would otherwise get to spend for free, since the signature check comes after it.
	if (raw.length > 128_000) {
		console.warn('razorpay webhook: oversized body', raw.length);
		return json({ error: 'payload_too_large' }, { status: 413 });
	}
	const ok = await verifyWebhookSignature(env, raw, req.headers.get('X-Razorpay-Signature'));
	if (!ok) {
		console.warn('razorpay webhook: bad signature');
		return json({ error: 'invalid_signature' }, { status: 401 });
	}

	// 400, not a thrown 500: a malformed body is not something a retry can fix, and a
	// 5xx makes Razorpay redeliver the same broken event for days.
	let body: WebhookEvent;
	try {
		body = JSON.parse(raw) as WebhookEvent;
	} catch {
		console.warn('razorpay webhook: body is not valid JSON');
		return json({ error: 'invalid_json' }, { status: 400 });
	}
	const entity = paymentFromEvent(body);

	// Audit first, act second — so a crash below still leaves a record of what arrived.
	await env.DB.prepare(`INSERT INTO webhook_events (event_type, payload) VALUES (?, ?)`)
		.bind(body.event ?? 'unknown', raw)
		.run();

	if (!entity) return json({ ok: true, ignored: 'no payment entity' });

	const order = await env.DB.prepare(
		`SELECT order_id, payment_status, total_price_paise FROM orders WHERE razorpay_order_id = ?`,
	)
		.bind(entity.order_id)
		.first<{ order_id: string; payment_status: string; total_price_paise: number }>();

	// 200, not 404. A non-2xx makes Razorpay retry this event for days, and an
	// unknown order is not something a retry can fix.
	if (!order) {
		console.warn('razorpay webhook: no local order for', entity.order_id);
		return json({ ok: true, ignored: 'unknown order' });
	}

	const paid = body.event === 'payment.captured' || entity.status === 'captured';

	// What was actually captured has to match what was owed. A valid signature only
	// proves Razorpay sent the event, not that the right amount arrived — without this
	// a ₹1 capture against a ₹1200 order would mark it paid and print a collection QR.
	// Short-paid orders are left unpaid and flagged rather than failed: the money did
	// arrive, so this needs a human to reconcile, not an automatic rejection.
	if (paid && entity.amount !== order.total_price_paise) {
		console.error(
			`razorpay webhook: AMOUNT MISMATCH on ${order.order_id} — captured ${entity.amount}, owed ${order.total_price_paise}`,
		);
		return json({ ok: true, ignored: 'amount mismatch', order_id: order.order_id });
	}

	const status = paid ? 'paid' : 'failed';

	// Already settled — Razorpay redelivering an event must not rewrite it.
	if (order.payment_status === status) return json({ ok: true, idempotent: true });

	const statements = [
		env.DB.prepare(
			`UPDATE orders SET payment_status = ?, updated_at = datetime('now')
			  WHERE order_id = ? AND payment_status = 'unpaid'`,
		).bind(status, order.order_id),
	];

	if (paid) {
		// INSERT OR IGNORE + the UNIQUE index on razorpay_transaction_id: a duplicate
		// delivery is a no-op rather than a second payment row for one transaction.
		statements.push(
			env.DB.prepare(
				`INSERT OR IGNORE INTO payments (payment_id, order_id, razorpay_transaction_id, transaction_info)
				 VALUES (?, ?, ?, ?)`,
			).bind(newPaymentId(), order.order_id, entity.id, JSON.stringify(entity)),
		);
	}

	// batch() is a transaction: the order flips to paid and the payment is recorded
	// together, or neither happens.
	await env.DB.batch(statements);

	return json({ ok: true, order_id: order.order_id, payment_status: status });
}

// ============================================================
// 5. GET /api/orders/:order_id — receipt + QR payload for the student
// ============================================================
export async function getOrder(env: Env, orderId: string, cors: Cors): Promise<Response> {
	if (!looksLikeOrderId(orderId)) throw bad('bad_order_id', 'Malformed order id');

	const order = await env.DB.prepare(
		`SELECT order_id, order_info, total_price_paise, payment_status, collection_status, created_at
		   FROM orders WHERE order_id = ?`,
	)
		.bind(orderId)
		.first<{
			order_id: string;
			order_info: string;
			total_price_paise: number;
			payment_status: string;
			collection_status: CollectionStatus;
			created_at: string;
		}>();
	if (!order) throw notFound('No such order');

	const payment = await env.DB.prepare(
		`SELECT razorpay_transaction_id, transaction_info FROM payments WHERE order_id = ?`,
	)
		.bind(orderId)
		.first<{ razorpay_transaction_id: string | null; transaction_info: string }>();

	// The QR carries the order id and nothing else. Two reasons:
	//   1. transaction_info holds the payer's email and phone — that must not sit in
	//      an image the student screenshots and shows to a volunteer.
	//   2. The distributor reads every detail from the database anyway, so anything
	//      extra in the QR is data the scanner would have to be told to distrust.
	// The id is 128 bits of randomness, so holding the QR is the proof of purchase,
	// exactly like a paper ticket.
	const info = payment?.transaction_info ? (JSON.parse(payment.transaction_info) as Record<string, unknown>) : null;

	return json(
		{
			order_id: order.order_id,
			items: JSON.parse(order.order_info),
			total_price_paise: order.total_price_paise,
			payment_status: order.payment_status,
			collection_status: order.collection_status,
			created_at: order.created_at,
			razorpay_transaction_id: payment?.razorpay_transaction_id ?? null,
			// Non-identifying summary only — the full entity stays server-side.
			payment_summary: info ? { method: info.method ?? null, paid_at: info.created_at ?? null } : null,
			qr_payload: order.payment_status === 'paid' ? order.order_id : null,
		},
		{},
		cors,
	);
}

/** The three states an order's hand-over can be in. Lives here because both
 *  scanOrder and collectItems need it and neither owns the other. */
export type CollectionStatus = 'pending' | 'partial' | 'collected';


/**
 * The scan itself, with no opinion about who is asking. Split out so the admin panel
 * can run the same check under its own session rather than shipping the shared
 * distributor token to a browser — and so there is exactly one definition of what a
 * volunteer sees.
 *
 * No `verdict`/`collectable` summary field any more: with per-item collection there
 * is no single "can I hand this over" bit, so the caller reads payment_status and
 * collection_status directly instead of trusting a flag computed from them.
 */
export async function scanOrder(env: Env, orderId: unknown, cors: Cors): Promise<Response> {
	if (!looksLikeOrderId(orderId)) throw bad('bad_order_id', 'Malformed order id');

	// One round trip, not two. A scan is the single most repeated action at the counter,
	// and D1 lives one region away — reading the payment in the same query halves the
	// wait between a volunteer scanning and the checklist appearing. LEFT JOIN because an
	// unpaid order has no payment row, and it cannot fan out: payments.order_id is UNIQUE.
	const order = await env.DB.prepare(
		`SELECT o.order_id, o.order_info, o.total_price_paise, o.payment_status, o.collection_status,
		        o.roll_number, o.collected_at, o.created_at,
		        p.razorpay_transaction_id, p.transaction_info, p.created_at AS payment_created_at
		   FROM orders o
		   LEFT JOIN payments p ON p.order_id = o.order_id
		  WHERE o.order_id = ?`,
	)
		.bind(orderId)
		.first<{
			order_id: string;
			order_info: string;
			total_price_paise: number;
			payment_status: string;
			collection_status: CollectionStatus;
			roll_number: string | null;
			collected_at: string | null;
			created_at: string;
			razorpay_transaction_id: string | null;
			transaction_info: string | null;
			payment_created_at: string | null;
		}>();
	if (!order) throw notFound('No such order');

	// transaction_info is NOT NULL on the payments table, so a null here means the LEFT
	// JOIN found no row at all — an unpaid order — rather than a payment missing a field.
	const payment = order.transaction_info === null ? null : order;

	return json(
		{
			order: {
				order_id: order.order_id,
				// NULL on orders placed before roll numbers were collected — the counter
				// shows a dash rather than pretending it knows.
				roll_number: order.roll_number,
				// Every line carries its own `collected` flag — see PricedLine. An order
				// placed before this feature existed never had one written; default it to 0
				// on the way out rather than rewriting every historical row for it.
				items: (JSON.parse(order.order_info) as PricedLine[]).map((l) => ({
					...l,
					collected: l.collected === 1 ? 1 : 0,
				})),
				total_price_paise: order.total_price_paise,
				payment_status: order.payment_status,
				collection_status: order.collection_status,
				collected_at: order.collected_at,
				created_at: order.created_at,
			},
			payment: payment
				? {
						razorpay_transaction_id: payment.razorpay_transaction_id,
						transaction_info: JSON.parse(payment.transaction_info!),
						recorded_at: payment.payment_created_at,
					}
				: null,
		},
		{},
		cors,
	);
}


/**
 * Strikes the given line indexes off an order and recomputes its collection_status.
 * Shared with the admin panel and the counter session routes — see scanOrder above.
 *
 * `lines` omitted means "everything still outstanding" — what the panel's own
 * "Mark All as collected" button sends, and what an external caller of the old
 * whole-order collect contract gets by not passing the field at all.
 *
 * A line, once struck off, cannot be struck back on through this endpoint — the
 * merge below only ever turns 0 into 1. There is no undo in the counter UI, so there
 * is none here either.
 */
export async function collectItems(env: Env, orderId: unknown, lines: unknown, cors: Cors): Promise<Response> {
	if (!looksLikeOrderId(orderId)) throw bad('bad_order_id', 'Malformed order id');

	const row = await env.DB.prepare(`SELECT order_info, payment_status, collection_status FROM orders WHERE order_id = ?`)
		.bind(orderId)
		.first<{ order_info: string; payment_status: string; collection_status: CollectionStatus }>();

	if (!row) throw notFound('No such order');
	if (row.payment_status !== 'paid') throw new ApiError(409, 'unpaid', 'Order is not paid');
	if (row.collection_status === 'collected')
		throw new ApiError(409, 'already_collected', 'Every item on this order is already collected');

	const items = (JSON.parse(row.order_info) as PricedLine[]).map((l) => ({
		...l,
		collected: (l.collected === 1 ? 1 : 0) as 0 | 1,
	}));

	const targets =
		lines === undefined
			? items.flatMap((l, i) => (l.collected === 0 ? [i] : []))
			: parseLineIndexes(lines, items.length);
	if (targets.length === 0) throw bad('no_items', 'Nothing was selected to collect');

	const newItems = items.map((l, i) => (targets.includes(i) ? { ...l, collected: 1 as const } : l));
	const allCollected = newItems.every((l) => l.collected === 1);
	const newStatus: CollectionStatus = allCollected ? 'collected' : 'partial';
	const newOrderInfo = JSON.stringify(newItems);

	// order_info is repeated in the WHERE clause as an optimistic-concurrency check:
	// if two scans of the same ticket ever race, whichever write lands second finds
	// the row already changed underneath it and gets a clean 409 instead of silently
	// clobbering the first volunteer's selection.
	const res = await env.DB.prepare(
		`UPDATE orders
		    SET order_info = ?, collection_status = ?,
		        collected_at = CASE WHEN ? = 'collected' THEN datetime('now') ELSE collected_at END,
		        updated_at = datetime('now')
		  WHERE order_id = ? AND payment_status = 'paid' AND collection_status != 'collected' AND order_info = ?`,
	)
		.bind(newOrderInfo, newStatus, newStatus, orderId, row.order_info)
		.run();

	if (res.meta.changes === 1)
		return json({ ok: true, order_id: orderId, collection_status: newStatus, items: newItems }, {}, cors);

	// Nothing changed — the row moved under us since it was read above. Re-read to say
	// precisely why rather than a bare failure.
	const current = await env.DB.prepare(
		`SELECT payment_status, collection_status, collected_at FROM orders WHERE order_id = ?`,
	)
		.bind(orderId)
		.first<{ payment_status: string; collection_status: CollectionStatus; collected_at: string | null }>();

	if (!current) throw notFound('No such order');
	if (current.payment_status !== 'paid') throw new ApiError(409, 'unpaid', 'Order is not paid');
	if (current.collection_status === 'collected')
		throw new ApiError(409, 'already_collected', `Already collected at ${current.collected_at}`);
	throw new ApiError(409, 'stale', 'This order changed since it was scanned — rescan it');
}

// ============================================================
// Roll-number lookup — the counter's path when there is no QR to scan
// ============================================================
/**
 * Every order belonging to one roll number, newest first.
 *
 * A list, not a single order: a student can buy more than once, and silently picking
 * "the latest" would hand over the wrong bag with no way for the volunteer to tell.
 * The caller shows the list and scans whichever order the student is actually here for.
 *
 * Matching is case-insensitive at both ends — normaliseRoll uppercases the input, and
 * COLLATE NOCASE covers anything that reached the column by another route.
 */
export async function lookupByRoll(env: Env, roll: unknown, cors: Cors): Promise<Response> {
	const rollNumber = normaliseRoll(roll);

	const { results } = await env.DB.prepare(
		`SELECT order_id, order_info, total_price_paise, payment_status, collection_status,
		        collected_at, created_at
		   FROM orders
		  WHERE roll_number = ? COLLATE NOCASE
		  ORDER BY created_at DESC, order_id DESC`,
	)
		.bind(rollNumber)
		.all<{
			order_id: string;
			order_info: string;
			total_price_paise: number;
			payment_status: string;
			collection_status: CollectionStatus;
			collected_at: string | null;
			created_at: string;
		}>();

	// 404 rather than an empty list: "no such roll" is the same dead end as "no such
	// order", and the counter page already knows how to word that.
	if (results.length === 0) throw notFound(`No order for ${rollNumber}`);

	return json(
		{
			roll_number: rollNumber,
			orders: results.map((o) => {
				const items = (JSON.parse(o.order_info) as PricedLine[]).map((l) => ({
					...l,
					collected: l.collected === 1 ? 1 : 0,
				}));
				return {
					order_id: o.order_id,
					items,
					total_price_paise: o.total_price_paise,
					payment_status: o.payment_status,
					collection_status: o.collection_status,
					collected_at: o.collected_at,
					created_at: o.created_at,
				};
			}),
		},
		{},
		cors,
	);
}

/** `lines` off the wire: must be a non-empty array of distinct in-range indexes. */
function parseLineIndexes(lines: unknown, itemCount: number): number[] {
	if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES)
		throw bad('bad_lines', 'lines must be a non-empty array of item indexes');
	const seen = new Set<number>();
	for (const v of lines) {
		if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= itemCount)
			throw bad('bad_lines', `${String(v)} is not a valid item index for this order`);
		seen.add(v as number);
	}
	return [...seen];
}

// ============================================================
// 8. POST /api/pay — INTERIM counter payment, stands in for Razorpay
// ============================================================
/**
 * Settles an order without a gateway: the buyer hands over their details, the worker
 * mints its own transaction id and writes the same rows the Razorpay webhook would.
 *
 * Gated on DIRECT_PAY so it cannot coexist with a live gateway — once Razorpay is
 * wired, dropping that var makes this route 404 and the only way to mark an order paid
 * is a signature-verified webhook. Leaving both live would mean anyone could mark any
 * order paid by POSTing here.
 */
export async function directPay(
	env: Env,
	req: Request,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	if (env.DIRECT_PAY !== '1') throw notFound();
	await requireBudget(env, req, 'pay');

	const body = await readJson<{ order_id?: string }>(req);
	if (!looksLikeOrderId(body.order_id)) throw bad('bad_order_id', 'Malformed order id');
	const customer = parseCustomer(body); // throws before anything is written

	const order = await env.DB.prepare(
		`SELECT order_id, order_info, total_price_paise, payment_status
		   FROM orders WHERE order_id = ?`,
	)
		.bind(body.order_id)
		.first<{ order_id: string; order_info: string; total_price_paise: number; payment_status: string }>();
	if (!order) throw notFound('No such order');

	// Paying twice must not create a second payment row or overwrite the first.
	if (order.payment_status === 'paid') {
		const existing = await env.DB.prepare(
			`SELECT razorpay_transaction_id FROM payments WHERE order_id = ?`,
		)
			.bind(order.order_id)
			.first<{ razorpay_transaction_id: string | null }>();
		return json(
			{ ok: true, idempotent: true, order_id: order.order_id, transaction_id: existing?.razorpay_transaction_id ?? null, payment_status: 'paid' },
			{},
			cors,
		);
	}
	if (order.payment_status === 'failed') throw new ApiError(409, 'order_failed', 'This order cannot be paid');

	const txnId = newTransactionId();
	const info = {
		id: txnId,
		method: 'counter',
		amount: order.total_price_paise,
		status: 'captured',
		name: customer.name,
		contact: customer.phone,
		email: customer.email,
		created_at: Math.floor(Date.now() / 1000),
		note: 'Collected at the counter — no payment gateway involved',
	};

	// Same transaction shape as the webhook: order flips and the payment lands together.
	await env.DB.batch([
		env.DB.prepare(
			`UPDATE orders SET payment_status = 'paid', roll_number = ?, updated_at = datetime('now')
			  WHERE order_id = ? AND payment_status = 'unpaid'`,
		).bind(customer.rollNumber, order.order_id),
		env.DB.prepare(
			`INSERT OR IGNORE INTO payments (payment_id, order_id, razorpay_transaction_id, transaction_info)
			 VALUES (?, ?, ?, ?)`,
		).bind(newPaymentId(), order.order_id, txnId, JSON.stringify(info)),
	]);

	const items: PricedLine[] = JSON.parse(order.order_info);

	// Only after the batch commits: an email must never describe an order that failed
	// to save. waitUntil lets the response go back immediately while the mail is still
	// in flight, and sendOrderEmail swallows its own failures — a confirmation that
	// does not arrive is not a reason to tell the student their payment failed.
	const mail = sendOrderEmail(env, {
		to: customer.email,
		name: customer.name,
		orderId: order.order_id,
		transactionId: txnId,
		items,
		totalPaise: order.total_price_paise,
	});
	if (ctx) ctx.waitUntil(mail);

	return json(
		{
			ok: true,
			order_id: order.order_id,
			transaction_id: txnId,
			payment_status: 'paid',
			total_price_paise: order.total_price_paise,
			items,
			customer,
		},
		{ status: 201 },
		cors,
	);
}
