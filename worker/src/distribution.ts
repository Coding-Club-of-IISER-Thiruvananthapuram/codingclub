/**
 * Distribution sessions — the counter's pass.
 *
 * An admin opens a session, copies the link, and whoever holds that link can scan
 * tickets and hand merch over until the admin ends it. Two consequences shape
 * everything below:
 *
 *   1. The id in the URL *is* the credential. It gets the same 128 bits as an order id
 *      and is never derived from anything guessable (a timestamp, a counter, a name).
 *   2. Ending a session must take effect immediately, so `end_time IS NULL` is
 *      re-checked on every scan and every hand-over rather than trusted once at open.
 *
 * One session runs at a time. Starting a new one closes whatever was open, which is
 * what stops yesterday's link from still working today.
 */

import { requireAdmin } from './admin.ts';
import { collectItems, lookupByRoll, scanOrder } from './routes.ts';
import { ApiError, type Env, broadcastChange, json, randomId, readJson, requireBudget } from './util.ts';

/** Its own code, not the generic `notFound()` — a scan inside a dead session and a
 *  scan of an order that just doesn't exist are both 404s, and the counter page has to
 *  tell them apart to know whether to keep scanning or show "this link is dead". */
const noSuchSession = () => new ApiError(404, 'no_such_session', 'No such distribution session');

type Cors = Record<string, string>;

export interface DistributionSession {
	session_id: string;
	start_time: string;
	end_time: string | null;
	started_by_roll: string | null;
	started_by_name: string | null;
}

/**
 * What the counter page is allowed to see. Deliberately not the whole row: /api/distribution/:id
 * is unauthenticated — the link IS the credential — so it must not hand the volunteer
 * holding it the name and roll number of the admin who opened the session.
 */
export type OpenSession = Omit<DistributionSession, 'started_by_roll' | 'started_by_name'>;

/** Cheap shape check before a DB round trip — same alphabet as an order id. */
export const looksLikeSessionId = (v: unknown): v is string =>
	typeof v === 'string' && /^DST_[0-9A-HJKMNP-TV-Z]{26}$/.test(v);

/**
 * The gate every volunteer request goes through. Throws unless the session exists and
 * is still open; a closed one is 410 rather than 404 so the page can say "this
 * distribution has ended" instead of "no such link".
 */
export async function requireOpenSession(env: Env, sessionId: unknown): Promise<OpenSession> {
	if (!looksLikeSessionId(sessionId)) throw noSuchSession();

	const row = await env.DB.prepare(
		`SELECT session_id, start_time, end_time FROM distributions WHERE session_id = ?`,
	)
		.bind(sessionId)
		.first<OpenSession>();

	if (!row) throw noSuchSession();
	if (row.end_time) throw new ApiError(410, 'session_ended', `This distribution ended at ${row.end_time}`);
	return row;
}

// ============================================================
// POST /api/admin/distribution — start
// ============================================================
export async function startDistribution(env: Env, req: Request, cors: Cors): Promise<Response> {
	const admin = await requireAdmin(env, req);
	const sessionId = randomId('DST_');

	// Close first, then open. Batched so there is never a moment with two live links,
	// and so a failure leaves the old session running rather than none at all.
	await env.DB.batch([
		env.DB.prepare(`UPDATE distributions SET end_time = datetime('now') WHERE end_time IS NULL`),
		env.DB.prepare(
			`INSERT INTO distributions (session_id, started_by_roll, started_by_name) VALUES (?, ?, ?)`,
		).bind(sessionId, admin.roll_number, admin.name),
	]);

	const row = await env.DB.prepare(
		`SELECT session_id, start_time, end_time, started_by_roll, started_by_name
		   FROM distributions WHERE session_id = ?`,
	)
		.bind(sessionId)
		.first<DistributionSession>();

	console.log(`admin: ${admin.collegemail} (${admin.roll_number}) started distribution ${sessionId}`);
	return json({ session: row }, {}, cors);
}

// ============================================================
// DELETE /api/admin/distribution — end whatever is open
// ============================================================
export async function endDistribution(env: Env, req: Request, cors: Cors): Promise<Response> {
	const admin = await requireAdmin(env, req);

	// Conditional UPDATE, not read-then-write: two admins clicking END at once would
	// both pass a read and the second would overwrite the first one's timestamp.
	const res = await env.DB.prepare(
		`UPDATE distributions SET end_time = datetime('now') WHERE end_time IS NULL`,
	).run();

	console.log(`admin: ${admin.collegemail} (${admin.roll_number}) ended distribution`);
	return json({ ok: true, ended: res.meta.changes }, {}, cors);
}

// ============================================================
// GET /api/admin/distribution — the session that is running, if any
// ============================================================
export async function getDistribution(env: Env, req: Request, cors: Cors): Promise<Response> {
	await requireAdmin(env, req);

	// The panel reloads and the dialog has to come back showing the same link. Without
	// this an admin who refreshed could only recover it by starting a second session.
	const row = await env.DB.prepare(
		`SELECT session_id, start_time, end_time, started_by_roll, started_by_name
		   FROM distributions
		  WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1`,
	).first<DistributionSession>();

	return json({ session: row ?? null }, {}, cors);
}

// ============================================================
// GET /api/distribution/:id — is this link still good?
// ============================================================
export async function checkSession(env: Env, sessionId: string, cors: Cors): Promise<Response> {
	const session = await requireOpenSession(env, sessionId);
	return json({ session }, {}, cors);
}

// ============================================================
// POST /api/distribution/:id/scan
// ============================================================
export async function sessionScan(env: Env, sessionId: string, req: Request, cors: Cors): Promise<Response> {
	// Rate limited before the session is even looked up. These two routes are the only
	// unauthenticated write path into the orders table — the URL is the whole credential
	// — so a leaked link should cost an attacker a budget, not unlimited D1 reads.
	await requireBudget(env, req, 'dist-scan');
	await requireOpenSession(env, sessionId);
	const { order_id: orderId } = await readJson<{ order_id?: string }>(req);
	return scanOrder(env, orderId, cors);
}

// ============================================================
// POST /api/distribution/:id/lookup — find a student's orders by roll number
// ============================================================
export async function sessionLookup(env: Env, sessionId: string, req: Request, cors: Cors): Promise<Response> {
	await requireBudget(env, req, 'dist-lookup');
	await requireOpenSession(env, sessionId);
	const { roll_number: roll } = await readJson<{ roll_number?: string }>(req);
	return lookupByRoll(env, roll, cors);
}

// ============================================================
// POST /api/distribution/:id/collect
// ============================================================
export async function sessionCollect(
	env: Env,
	sessionId: string,
	req: Request,
	cors: Cors,
	ctx?: ExecutionContext,
): Promise<Response> {
	await requireBudget(env, req, 'dist-collect');
	await requireOpenSession(env, sessionId);
	const { order_id: orderId, lines } = await readJson<{ order_id?: string; lines?: unknown }>(req);

	// collectItems throws on anything but a clean write, so reaching the next line
	// means the row really did change.
	const res = await collectItems(env, orderId, lines, cors);

	console.log(`distribution ${sessionId}: collected ${String(orderId)}`);
	const live = broadcastChange(env, 'orders', `collected ${String(orderId)}`);
	if (ctx) ctx.waitUntil(live);

	return res;
}
