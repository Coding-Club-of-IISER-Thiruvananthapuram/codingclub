/**
 * requireOpenSession is the only thing standing between a copied URL and the ability
 * to mark merch collected — it gets a real test.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeSessionId, requireOpenSession, type OpenSession } from '../src/distribution.ts';
import { ApiError, type Env, randomId } from '../src/util.ts';

const LIVE = randomId('DST_');

/** Just enough D1 to answer the one SELECT the gate makes. */
const dbWith = (row: OpenSession | null) =>
	({ DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) } }) as unknown as Env;

const session = (end: string | null): OpenSession => ({
	session_id: LIVE,
	start_time: '2026-08-17 12:00:00',
	end_time: end,
});

async function statusOf(fn: () => Promise<unknown>): Promise<number> {
	try {
		await fn();
		return 200;
	} catch (e) {
		assert.ok(e instanceof ApiError, `expected an ApiError, got ${String(e)}`);
		return e.status;
	}
}

describe('looksLikeSessionId', () => {
	it('accepts a freshly minted id', () => assert.ok(looksLikeSessionId(randomId('DST_'))));

	it('rejects other kinds of id, junk and non-strings', () => {
		for (const v of [randomId('ORD_'), 'DST_', 'DST_short', `${LIVE}X`, '', null, 42, {}])
			assert.ok(!looksLikeSessionId(v), `should have rejected ${String(v)}`);
	});

	it('rejects the ambiguous letters the alphabet leaves out', () => {
		// I, L, O and U are not in the alphabet, so an id containing one was mistyped.
		assert.ok(!looksLikeSessionId('DST_IIIIIIIIIIIIIIIIIIIIIIIIII'));
	});
});

describe('requireOpenSession', () => {
	it('passes an open session through', async () => {
		const row = await requireOpenSession(dbWith(session(null)), LIVE);
		assert.equal(row.session_id, LIVE);
	});

	it('410s an ended session — a stale link must not still work', async () => {
		assert.equal(await statusOf(() => requireOpenSession(dbWith(session('2026-08-17 18:00:00')), LIVE)), 410);
	});

	it('404s an id that is not in the table', async () => {
		assert.equal(await statusOf(() => requireOpenSession(dbWith(null), LIVE)), 404);
	});

	it('404s a malformed id without touching the database', async () => {
		// The stub would happily return a live row; reaching it would mean the shape
		// check was skipped and any string could be probed against D1.
		const trap = dbWith(session(null));
		assert.equal(await statusOf(() => requireOpenSession(trap, 'DST_nope')), 404);
		assert.equal(await statusOf(() => requireOpenSession(trap, undefined)), 404);
	});
});
