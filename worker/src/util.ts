/** Ids, HTTP helpers and CORS. No D1, no Razorpay — safe to import anywhere. */

export interface Env {
	DB: D1Database;
	MEDIA: R2Bucket;
	ALLOWED_ORIGINS: string;
	ENVIRONMENT: string;
	RAZORPAY_STUB?: string;
	DIRECT_PAY?: string;
	RAZORPAY_KEY_ID?: string;
	RAZORPAY_KEY_SECRET?: string;
	RAZORPAY_WEBHOOK_SECRET?: string;
	// Confirmation email. Unset means no mail is sent — the order still completes.
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
	MONEY_RL: RateLimit;
	HUB: DurableObjectNamespace<import('./hub.ts').CatalogueHub>;
}

/**
 * Tells every connected browser something moved. Fire-and-forget on purpose: the write
 * it follows is already committed, so a hub that is unreachable must cost the caller
 * nothing but a log line. Pass to ctx.waitUntil so the response is not delayed.
 *
 * `type` lets a listener care about only what it renders — a storefront has no reason
 * to re-fetch because an order was deleted.
 */
export async function broadcastChange(
	env: Env,
	type: 'catalogue' | 'orders',
	reason: string,
): Promise<void> {
	try {
		// One well-known name = one object = every viewer on the same fan-out point.
		const hub = env.HUB.get(env.HUB.idFromName('catalogue'));
		await hub.broadcast(JSON.stringify({ type, reason, at: Date.now() }));
	} catch (e) {
		console.error('hub: broadcast failed', e);
	}
}

/**
 * Drop the edge-cached catalogue, and one item's images when `id` is given.
 *
 * The catalogue and every image are served from `caches.default`; without this an admin
 * edit stays invisible until the TTL runs out — 24 hours, for a replaced picture. Pass
 * `id` whenever that item's imagery may have changed.
 *
 * Only purges the colo this request landed in, which is why the cached copies still
 * carry a short max-age: the admin's own region updates at once, everywhere else heals
 * on expiry. Runs on admin writes only, so the extra COUNT costs nothing in practice.
 */
export async function purgeCatalogue(env: Env, req: Request, id?: string): Promise<void> {
	try {
		const { origin } = new URL(req.url);
		const keys = [`${origin}/api/merch`];
		if (id) {
			const item = encodeURIComponent(id);
			const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM merch_images WHERE merch_id = ?`)
				.bind(id)
				.first<{ n: number }>();
			// Index 0 is the primary image, then one key per extra view. The bare
			// /image URL is a separate cache entry from /image/0 and needs its own purge.
			keys.push(`${origin}/api/merch/${item}/image`);
			for (let i = 0; i <= (row?.n ?? 0); i++) keys.push(`${origin}/api/merch/${item}/image/${i}`);
		}
		await Promise.all(keys.map((k) => caches.default.delete(k)));
	} catch (e) {
		// A stale cache entry is not worth failing an admin save that already committed.
		console.error('cache: purge failed', e);
	}
}

// ---------- ids ----------
// Crockford base32: no I, L, O or U, so an id read aloud or typed off a screen
// cannot be mistaken for a different one.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `prefix` + 128 bits of CSPRNG randomness, base32-encoded (26 chars). */
export function randomId(prefix: string, bytes = 16): string {
	const raw = crypto.getRandomValues(new Uint8Array(bytes));
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of raw) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return prefix + out;
}

export const newOrderId = () => randomId('ORD_');
export const newPaymentId = () => randomId('PAY_');
/**
 * Random, not sequential. A counter had to ask the table for its own maximum and then
 * race another admin for it; this cannot collide in the first place.
 *
 * 5 bytes, not 16 like an order id: an order id is a capability — holding it is proof
 * of purchase, so it must be unguessable. A merch id is public catalogue data anyone
 * can already list, so it only has to be unique. 40 bits is ample for a fest catalogue
 * and keeps the id short enough to read out.
 */
export const newMerchId = () => randomId('MER_', 5);

/** Same shape check as looksLikeOrderId, for the ids a cart quotes back at us. */
export const looksLikeMerchId = (v: unknown): v is string =>
	typeof v === 'string' && /^MER_[0-9A-HJKMNP-TV-Z]{8}$/.test(v);
// Our own transaction id, minted where Razorpay's would otherwise arrive. Prefixed
// differently from a real `pay_...` so counter payments are never mistaken for gateway ones.
export const newTransactionId = () => randomId('TXN_');

/** Cheap shape check before a DB round trip. */
export const looksLikeOrderId = (v: unknown): v is string =>
	typeof v === 'string' && /^ORD_[0-9A-HJKMNP-TV-Z]{26}$/.test(v);

// ---------- HTTP ----------
export function corsHeaders(env: Env, req: Request): Record<string, string> {
	const origin = req.headers.get('Origin') ?? '';
	const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
	const base = {
		'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type,Authorization',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
	// Echo the origin only when it is on the list — never reflect an arbitrary one, and
	// never '*', since the admin routes carry an Authorization header.
	// An unlisted origin gets NO Allow-Origin header at all rather than a fallback: a
	// header naming some *other* site is what the browser must reject, so emitting one
	// only obscured which origins are actually configured.
	if (!allowed.includes(origin)) return base;
	return { ...base, 'Access-Control-Allow-Origin': origin };
}

export function json(data: unknown, init: ResponseInit = {}, cors: Record<string, string> = {}) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...(init.headers ?? {}) },
	});
}

/** A thrown ApiError becomes a clean JSON response; anything else becomes a 500. */
export class ApiError extends Error {
	// Explicit fields rather than TS parameter properties: those are erased-plus-emitted,
	// which Node's strip-only type stripping refuses, and `npm test` runs these files raw.
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export const bad = (code: string, message: string) => new ApiError(400, code, message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const unauthorized = (message = 'Unauthorized') => new ApiError(401, 'unauthorized', message);
export const tooMany = () => new ApiError(429, 'rate_limited', 'Too many requests — wait a moment and try again');

/** Client IP as Cloudflare sees it — the header a Worker cannot receive forged, since
 *  Cloudflare's edge sets it and strips any client-supplied copy first. */
export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'unknown';

/** Throws 429 before any DB work happens, so a rate-limited request costs almost
 *  nothing. `route` is folded into the key so checkout and pay don't share one
 *  student's budget — a burst of legitimate checkouts must not lock out paying. */
export async function requireBudget(env: Env, req: Request, route: string): Promise<void> {
	const { success } = await env.MONEY_RL.limit({ key: `${route}:${clientIp(req)}` });
	if (!success) throw tooMany();
}

/** Constant-time comparison — a plain `===` on a secret leaks its prefix via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}


/** Body parser with a hard size cap, so a huge POST cannot be used to burn CPU. */
export async function readJson<T>(req: Request, maxBytes = 32_768): Promise<T> {
	const text = await req.text();
	if (text.length > maxBytes) throw bad('payload_too_large', 'Request body too large');
	try {
		return JSON.parse(text) as T;
	} catch {
		throw bad('invalid_json', 'Body is not valid JSON');
	}
}
