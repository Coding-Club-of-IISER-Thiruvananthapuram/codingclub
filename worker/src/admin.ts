/**
 * Admin panel: one shared password, per-person audit trail.
 *
 * The password is shared, so `admin_login` is what makes an edit attributable — every
 * sign-in records who claimed it. That is weaker than real accounts and deliberately
 * so, but it means a change can always be traced to a name, a roll number and a time.
 *
 * Two rules hold everywhere below:
 *   1. The password is never stored, compared or logged in the clear.
 *   2. `login_validation.active` is re-read on EVERY authenticated request, not just at
 *      login — a kill switch that only stopped new logins would leave whoever is
 *      already inside with full access.
 */

import { type PricedLine } from './cart.ts';
import { type CollectionStatus, collectItems, scanOrder } from './routes.ts';
import {
	ApiError,
	type Env,
	bad,
	broadcastChange,
	json,
	looksLikeOrderId,
	newMerchId,
	purgeCatalogue,
	randomId,
	readJson,
	timingSafeEqual,
	unauthorized,
} from './util.ts';

type Cors = Record<string, string>;

/** How long a session survives. Short on purpose: the panel edits live prices. */
const SESSION_HOURS = 12;

const PBKDF2_ITERATIONS = 100_000;

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

/**
 * PBKDF2-SHA256. Not a bare SHA-256: a single hash of a human-chosen password falls to
 * a GPU wordlist in seconds, and the iteration count is what makes that expensive.
 * Exported so scripts/set-admin-password.mjs can prove it derives the same value.
 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		key,
		256,
	);
	return hex(new Uint8Array(bits));
}

/** The college-domain rule, shared by login and the DB CHECK constraint. */
export const isCollegeEmail = (email: string) => /^[^\s@]+@iisertvm\.ac\.in$/.test(email);

export interface AdminSession {
	id: number;
	name: string;
	roll_number: string;
	collegemail: string;
}

/**
 * Validates the Bearer session token. Throws 401 if it is missing, unknown, logged out
 * or stale, and 403 if the kill switch has since been thrown.
 */
export async function requireAdmin(env: Env, req: Request): Promise<AdminSession> {
	const header = req.headers.get('Authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	if (!token) throw unauthorized('Not signed in');

	// One round trip, not two: this runs on every authenticated request, and the session
	// lookup and the kill-switch read were two sequential awaits against the same
	// database. CROSS JOIN because login_validation is a single fixed row — there is no
	// key relating it to a session, and it must be read on every request rather than
	// cached, or flipping `active` to 0 would not lock out open sessions.
	//
	// Expiry lives in the WHERE clause: a session that has aged out simply stops
	// matching, so there is no separate sweep job to forget to run.
	const row = await env.DB.prepare(
		`SELECT a.id, a.name, a.roll_number, a.collegemail, v.active
		   FROM admin_login a, login_validation v
		  WHERE a.session_token = ?
		    AND a.logout_time IS NULL
		    AND a.login_time > datetime('now', ?)
		    AND v.id = 1`,
	)
		.bind(token, `-${SESSION_HOURS} hours`)
		.first<AdminSession & { active: number }>();

	// A missing row is either a bad/expired token or an unconfigured gate; both mean
	// "not signed in" and neither should say which, so the caller learns nothing about
	// whether a token was valid.
	if (!row) throw unauthorized('Session expired — sign in again');
	if (row.active !== 1) throw new ApiError(403, 'admin_disabled', 'Admin access is switched off');

	return { id: row.id, name: row.name, roll_number: row.roll_number, collegemail: row.collegemail };
}

// ============================================================
// POST /api/admin/login
// ============================================================
export async function adminLogin(env: Env, req: Request, cors: Cors): Promise<Response> {
	// readJson, not req.json(): this route is reachable unauthenticated, so the body
	// needs the same hard size cap as every other public entry point.
	const body = await readJson<Record<string, unknown>>(req);

	const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
	const rollNumber = String(body.roll_number ?? '').trim().toUpperCase();
	const email = String(body.collegemail ?? '').trim().toLowerCase();
	const password = String(body.password ?? '');

	if (name.length < 2 || name.length > 80) throw bad('bad_name', 'Name must be 2 to 80 characters');
	if (rollNumber.length < 2 || rollNumber.length > 32)
		throw bad('bad_roll_number', 'Enter your roll number');
	if (email.length > 120 || !isCollegeEmail(email))
		throw bad('bad_email', 'Use your @iisertvm.ac.in email address');
	if (!password) throw bad('bad_password', 'Enter the admin password');

	const gate = await env.DB.prepare(
		`SELECT password_hash, password_salt, active FROM login_validation WHERE id = 1`,
	).first<{ password_hash: string; password_salt: string; active: number }>();
	if (!gate) throw new ApiError(503, 'not_configured', 'No admin password is set');

	// Checked before the password so a disabled panel cannot be probed for a valid one.
	if (gate.active !== 1) throw new ApiError(403, 'admin_disabled', 'Admin access is switched off');

	const attempt = await hashPassword(password, gate.password_salt);
	// Constant-time: a plain === leaks how many leading characters were right.
	if (!timingSafeEqual(attempt, gate.password_hash)) {
		// Deliberately vague, and deliberately not logged with the attempted password.
		console.warn('admin: failed login for', email);
		throw unauthorized('Wrong password');
	}

	const token = randomId('ADM_');
	await env.DB.prepare(
		`INSERT INTO admin_login (name, roll_number, collegemail, session_token)
		 VALUES (?, ?, ?, ?)`,
	)
		.bind(name, rollNumber, email, token)
		.run();

	return json(
		{ ok: true, token, expires_in_hours: SESSION_HOURS, admin: { name, roll_number: rollNumber, collegemail: email } },
		{ status: 201 },
		cors,
	);
}

// ============================================================
// POST /api/admin/logout
// ============================================================
export async function adminLogout(env: Env, req: Request, cors: Cors): Promise<Response> {
	const session = await requireAdmin(env, req);
	// The token is cleared as well as stamped: it must not be reusable afterwards, and
	// UNIQUE would block a later login from reusing the value if it lingered.
	await env.DB.prepare(
		`UPDATE admin_login SET logout_time = datetime('now'), session_token = NULL WHERE id = ?`,
	)
		.bind(session.id)
		.run();
	return json({ ok: true }, {}, cors);
}

// ============================================================
// GET /api/admin/merch — the catalogue as an admin sees it
// ============================================================
export async function adminListMerch(env: Env, req: Request, cors: Cors): Promise<Response> {
	await requireAdmin(env, req);

	// Unlike the public route this returns inactive rows too — hiding them here would
	// make a deactivated item impossible to find and switch back on.
	const { results } = await env.DB.prepare(
		`SELECT id, name, description, designer, category, r2_path, price_paise,
		        has_size, is_active, created_at
		   FROM merch ORDER BY category, id`,
	).all<{ id: string; r2_path: string; has_size: number; is_active: number }>();

	// One query for every extra view, not one per item — same reason as the public
	// route. No is_active filter here: a hidden item still has to show its pictures.
	const { results: extras } = await env.DB.prepare(
		`SELECT merch_id, label FROM merch_images ORDER BY merch_id, sort, id`,
	).all<{ merch_id: string; label: string }>();

	const viewsFor = new Map<string, string[]>();
	for (const e of extras)
		(viewsFor.get(e.merch_id) ?? viewsFor.set(e.merch_id, []).get(e.merch_id)!).push(e.label);

	return json(
		{
			merch: results.map((m) => {
				const labels = viewsFor.get(m.id) ?? [];
				return {
					...m,
					has_size: m.has_size === 1,
					is_active: m.is_active === 1,
					image_url: `/api/merch/${m.id}/image`,
					// `has_primary` so the panel can tell "no picture yet" from "picture
					// that failed to load" without probing the URL.
					has_primary: Boolean(m.r2_path),
					views: [
						...(m.r2_path ? [{ label: 'Front', url: `/api/merch/${m.id}/image/0` }] : []),
						...labels.map((label, i) => ({ label, url: `/api/merch/${m.id}/image/${i + 1}` })),
					],
				};
			}),
		},
		{},
		cors,
	);
}

// ============================================================
// PUT /api/admin/merch/:id — edit one item
// ============================================================
export async function adminUpdateMerch(
	env: Env,
	req: Request,
	id: string,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	const session = await requireAdmin(env, req);

	const existing = await env.DB.prepare(`SELECT id FROM merch WHERE id = ?`).bind(id).first();
	if (!existing) throw new ApiError(404, 'not_found', 'No such item');

	const body = await readJson<Record<string, unknown>>(req);

	const name = String(body.name ?? '').trim();
	const description = String(body.description ?? '').trim();
	const designer = String(body.designer ?? '').trim();
	const category = String(body.category ?? '').trim() || 'General';
	const price = body.price_paise;

	if (name.length < 1 || name.length > 80) throw bad('bad_name', 'Name must be 1 to 80 characters');
	if (description.length > 500) throw bad('bad_description', 'Description is too long (max 500)');
	if (designer.length > 80) throw bad('bad_designer', 'Designer name is too long (max 80)');
	if (category.length > 40) throw bad('bad_category', 'Category is too long (max 40)');
	// Same rule as the cart: money is integer paise. A float here would be stored as one
	// and every total computed from it would drift.
	if (!Number.isInteger(price) || (price as number) <= 0)
		throw bad('bad_price', 'Price must be a whole number of paise, greater than zero');

	const hasSize = body.has_size ? 1 : 0;
	const isActive = body.is_active ? 1 : 0;

	await env.DB.prepare(
		`UPDATE merch
		    SET name = ?, description = ?, designer = ?, category = ?,
		        price_paise = ?, has_size = ?, is_active = ?
		  WHERE id = ?`,
	)
		.bind(name, description, designer, category, price, hasSize, isActive, id)
		.run();

	// Who changed what — the shared password means this log is the only attribution.
	console.log(`admin: ${session.collegemail} (${session.roll_number}) updated ${id}`);

	// After the write, never before: a browser that refetched on an early signal could
	// read the old row back and look like the save failed.
	const live = Promise.all([
		broadcastChange(env, 'catalogue', `updated ${id}`),
		purgeCatalogue(env, req, id),
	]);
	if (ctx) ctx.waitUntil(live);

	return json({ ok: true, id }, {}, cors);
}

// ============================================================
// GET /api/admin/orders — every order, with who placed it
// ============================================================
/**
 * The buyer's name, email and phone live in `payments.transaction_info`, not on the
 * order — the public receipt route deliberately withholds them. This is the
 * authenticated view, so it joins them back in and parses them into flat fields rather
 * than making the panel dig through a JSON blob.
 *
 * LEFT JOIN: an unpaid order has no payment row but still has to be listed.
 */
export async function adminListOrders(env: Env, req: Request, cors: Cors): Promise<Response> {
	await requireAdmin(env, req);

	const { results } = await env.DB.prepare(
		`SELECT o.order_id, o.order_info, o.total_price_paise, o.payment_status,
		        o.collection_status, o.roll_number, o.collected_at, o.created_at,
		        p.razorpay_transaction_id, p.transaction_info
		   FROM orders o
		   LEFT JOIN payments p ON p.order_id = o.order_id
		  ORDER BY o.created_at DESC, o.order_id DESC`,
	).all<{
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
	}>();

	return json(
		{
			orders: results.map((o) => {
				// Counter payments store name/contact/email; a Razorpay entity carries
				// email and contact but no name. Both are read the same way, and a
				// malformed blob costs one row's details rather than the whole page.
				let name = '';
				let email = '';
				let phone = '';
				try {
					const t = o.transaction_info ? (JSON.parse(o.transaction_info) as Record<string, unknown>) : null;
					if (t) {
						name = String(t.name ?? '');
						email = String(t.email ?? '');
						phone = String(t.contact ?? '');
					}
				} catch {
					console.warn('orders: unreadable transaction_info on', o.order_id);
				}

				return {
					order_id: o.order_id,
					name,
					email,
					phone,
					roll_number: o.roll_number,
					items: JSON.parse(o.order_info) as PricedLine[],
					transaction_id: o.razorpay_transaction_id,
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

// ============================================================
// POST /api/admin/scan — look up a scanned QR
// ============================================================
/**
 * The counter's own session routes do the same thing behind a distribution session id.
 * These exist so the panel can scan from the login an admin already has, without an
 * admin having to open a counter link. Both call the same implementation, so what a
 * scan shows cannot come to mean two different things.
 */
export async function adminScan(env: Env, req: Request, cors: Cors): Promise<Response> {
	await requireAdmin(env, req);
	const { order_id: orderId } = await readJson<{ order_id?: string }>(req);
	return scanOrder(env, orderId, cors);
}

// ============================================================
// POST /api/admin/collect — strike items off, hand them over
// ============================================================
export async function adminCollect(
	env: Env,
	req: Request,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	const session = await requireAdmin(env, req);
	const { order_id: orderId, lines } = await readJson<{ order_id?: string; lines?: unknown }>(req);

	// collectItems throws on anything but a clean write, so reaching the next line
	// means the row really did change.
	const res = await collectItems(env, orderId, lines, cors);

	console.log(`admin: ${session.collegemail} (${session.roll_number}) collected from ${String(orderId)}`);
	const live = broadcastChange(env, 'orders', `collected ${String(orderId)}`);
	if (ctx) ctx.waitUntil(live);

	return res;
}

// ============================================================
// DELETE /api/admin/orders/:order_id
// ============================================================
export async function adminDeleteOrder(
	env: Env,
	req: Request,
	orderId: string,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	const session = await requireAdmin(env, req);
	if (!looksLikeOrderId(orderId)) throw bad('bad_order_id', 'Malformed order id');

	const row = await env.DB.prepare(`SELECT order_id FROM orders WHERE order_id = ?`)
		.bind(orderId)
		.first();
	if (!row) throw new ApiError(404, 'not_found', 'No such order');

	// Payments first: the row references the order, and one batch means a half-deleted
	// order can never exist.
	await env.DB.batch([
		env.DB.prepare(`DELETE FROM payments WHERE order_id = ?`).bind(orderId),
		env.DB.prepare(`DELETE FROM orders WHERE order_id = ?`).bind(orderId),
	]);

	// Money left the student's hands; this log is the only trace left of the record.
	console.log(`admin: ${session.collegemail} (${session.roll_number}) DELETED ORDER ${orderId}`);

	const live = broadcastChange(env, 'orders', `deleted ${orderId}`);
	if (ctx) ctx.waitUntil(live);

	return json({ ok: true, order_id: orderId }, {}, cors);
}

// ============================================================
// DELETE /api/admin/merch/:id — remove an item for good
// ============================================================
/**
 * Past orders are unaffected: `orders.order_info` is a snapshot taken at purchase
 * time, so a receipt for a deleted item still shows its name and the price paid.
 * That is the whole reason the snapshot exists.
 */
export async function adminDeleteMerch(
	env: Env,
	req: Request,
	id: string,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	const session = await requireAdmin(env, req);

	const row = await env.DB.prepare(`SELECT r2_path FROM merch WHERE id = ?`)
		.bind(id)
		.first<{ r2_path: string }>();
	if (!row) throw new ApiError(404, 'not_found', 'No such item');

	const { results: images } = await env.DB.prepare(
		`SELECT r2_path FROM merch_images WHERE merch_id = ?`,
	)
		.bind(id)
		.all<{ r2_path: string }>();

	// Rows first, objects second. If the R2 delete fails afterwards the worst case is
	// orphaned bytes nobody references; doing it the other way round would leave rows
	// pointing at images that no longer exist.
	await env.DB.batch([
		env.DB.prepare(`DELETE FROM merch_images WHERE merch_id = ?`).bind(id),
		env.DB.prepare(`DELETE FROM merch WHERE id = ?`).bind(id),
	]);

	const keys = [row.r2_path, ...images.map((i) => i.r2_path)].filter(Boolean);
	if (keys.length) await env.MEDIA.delete(keys);

	console.log(`admin: ${session.collegemail} (${session.roll_number}) DELETED ${id}`);

	const live = Promise.all([
		broadcastChange(env, 'catalogue', `deleted ${id}`),
		purgeCatalogue(env, req, id),
	]);
	if (ctx) ctx.waitUntil(live);

	return json({ ok: true, id }, {}, cors);
}

// ============================================================
// POST /api/admin/merch — create an item, with its image
// ============================================================
/** Only formats every browser and R2 will serve back without transcoding. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
};

/**
 * multipart/form-data rather than JSON: the image rides along in the same request, so
 * an item can never end up in the catalogue pointing at an image that failed to upload.
 */
export async function adminCreateMerch(
	env: Env,
	req: Request,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	const session = await requireAdmin(env, req);

	const form = await req.formData().catch(() => null);
	if (!form) throw bad('bad_body', 'Expected multipart form data');

	const str = (k: string) => String(form.get(k) ?? '').trim();
	const name = str('name');
	const description = str('description');
	const designer = str('designer');
	const category = str('category') || 'General';
	const price = Number(str('price_paise'));
	const hasSize = str('has_size') === 'true' || str('has_size') === '1';
	const isActive = str('is_active') !== 'false' && str('is_active') !== '0';

	if (name.length < 1 || name.length > 80) throw bad('bad_name', 'Name must be 1 to 80 characters');
	if (description.length > 500) throw bad('bad_description', 'Description is too long (max 500)');
	if (designer.length > 80) throw bad('bad_designer', 'Designer name is too long (max 80)');
	if (category.length > 40) throw bad('bad_category', 'Category is too long (max 40)');
	if (!Number.isInteger(price) || price <= 0)
		throw bad('bad_price', 'Price must be a whole number of paise, greater than zero');

	// `image` is the primary view, `image_extra` any number of additional ones. All are
	// validated up front: a half-uploaded set would leave the carousel with gaps.
	const primary = form.get('image');
	const hasImage = primary instanceof File && primary.size > 0;
	const extras = form.getAll('image_extra').filter((f): f is File => f instanceof File && f.size > 0);

	for (const f of [...(hasImage ? [primary as File] : []), ...extras]) {
		if (!IMAGE_TYPES.has(f.type))
			throw bad('bad_image_type', `Unsupported image type ${f.type || 'unknown'}`);
		if (f.size > MAX_IMAGE_BYTES) throw bad('image_too_large', 'Each image must be 5MB or smaller');
	}
	if (extras.length > 12) throw bad('too_many_images', 'At most 12 additional images per item');

	// Minted, not counted. The old scheme read MAX(id) off the table and raced any other
	// admin doing the same, so it needed a retry loop; a random id cannot collide.
	const id = newMerchId();

	// r2_path is reserved now but the object is written after; a row pointing at a
	// missing image renders the category icon, which is the same as any item awaiting
	// artwork. The reverse — an orphaned upload — costs storage forever.
	await env.DB.prepare(
		`INSERT INTO merch (id, name, description, designer, category, r2_path,
		                    price_paise, has_size, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			name,
			description,
			designer,
			category,
			hasImage ? `merch/${id}_0.${EXT[(primary as File).type]}` : '',
			price,
			hasSize ? 1 : 0,
			isActive ? 1 : 0,
		)
		.run();

	// `_0` for the primary and `_1`, `_2`… for the extras: the suffix IS the carousel
	// position, so a key says where its picture belongs without consulting the database.
	if (hasImage) {
		const f = primary as File;
		await env.MEDIA.put(`merch/${id}_0.${EXT[f.type]}`, f.stream(), {
			httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=86400' },
		});
	}

	// Extra views. Uploaded first, recorded second: a row pointing at a missing object
	// would leave a permanent hole in the carousel, while an unreferenced object is only
	// wasted bytes.
	if (extras.length) {
		const rows = [];
		for (const [i, f] of extras.entries()) {
			const key = `merch/${id}_${i + 1}.${EXT[f.type]}`;
			await env.MEDIA.put(key, f.stream(), {
				httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=86400' },
			});
			rows.push(
				env.DB.prepare(
					`INSERT INTO merch_images (merch_id, r2_path, label, sort) VALUES (?, ?, ?, ?)`,
				).bind(id, key, `View ${i + 2}`, i + 1),
			);
		}
		await env.DB.batch(rows);
	}

	console.log(`admin: ${session.collegemail} (${session.roll_number}) created ${id}`);

	const live = Promise.all([
		broadcastChange(env, 'catalogue', `created ${id}`),
		purgeCatalogue(env, req, id),
	]);
	if (ctx) ctx.waitUntil(live);

	return json({ ok: true, id }, { status: 201 }, cors);
}
