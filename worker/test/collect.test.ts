/**
 * collectItems is the only writer of order_info's per-line `collected` flags and of
 * collection_status — a bug here either hands out merch twice or leaves it stuck
 * "pending" forever, so the state machine (pending -> partial -> collected, the
 * concurrency guard, the input validation) gets a real test.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type PricedLine } from '../src/cart.ts';
import { collectItems, type CollectionStatus } from '../src/routes.ts';
import { ApiError, type Env, randomId } from '../src/util.ts';

const ORDER = randomId('ORD_');

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
	merch_id: 'MER_TEST0000',
	name: 'Trial Tee',
	quantity: 1,
	size: null,
	unit_price_paise: 10000,
	line_total_paise: 10000,
	collected: 0,
	...over,
});

/** One `orders` row, enough of D1 to exercise the real read -> compute -> guarded
 *  write -> re-read path in collectItems without a real database. */
function fakeEnv(row: {
	order_info: PricedLine[];
	payment_status: string;
	collection_status: CollectionStatus;
	collected_at: string | null;
} | null): Env {
	const state = row && { ...row, order_info: JSON.stringify(row.order_info) };
	const DB = {
		prepare: (sql: string) => ({
			bind: (...args: unknown[]) => ({
				async first() {
					return state ? { ...state } : null;
				},
				async run() {
					if (!state) return { meta: { changes: 0 } };
					const [newOrderInfo, newStatus, , , oldOrderInfo] = args as
						[string, CollectionStatus, CollectionStatus, string, string];
					const matches =
						state.payment_status === 'paid' &&
						state.collection_status !== 'collected' &&
						state.order_info === oldOrderInfo;
					if (!matches) return { meta: { changes: 0 } };
					state.order_info = newOrderInfo;
					state.collection_status = newStatus;
					if (newStatus === 'collected') state.collected_at = 'NOW';
					return { meta: { changes: 1 } };
				},
			}),
		}),
	};
	return { DB } as unknown as Env;
}

async function statusOf(fn: () => Promise<unknown>): Promise<number> {
	try {
		await fn();
		return 200;
	} catch (e) {
		assert.ok(e instanceof ApiError, `expected an ApiError, got ${String(e)}`);
		return e.status;
	}
}

describe('collectItems', () => {
	it('strikes one line off a two-line order and leaves it partial', async () => {
		const env = fakeEnv({
			order_info: [line({ name: 'A' }), line({ name: 'B' })],
			payment_status: 'paid',
			collection_status: 'pending',
			collected_at: null,
		});
		const res = await collectItems(env, ORDER, [0], {});
		const body = (await res.json()) as { collection_status: string; items: PricedLine[] };
		assert.equal(body.collection_status, 'partial');
		assert.equal(body.items[0].collected, 1);
		assert.equal(body.items[1].collected, 0);
	});

	it('reaches collected only once every line is struck off', async () => {
		const env = fakeEnv({
			order_info: [line({ name: 'A', collected: 1 }), line({ name: 'B' })],
			payment_status: 'paid',
			collection_status: 'partial',
			collected_at: null,
		});
		const res = await collectItems(env, ORDER, [1], {});
		const body = (await res.json()) as { collection_status: string; items: PricedLine[] };
		assert.equal(body.collection_status, 'collected');
		assert.ok(body.items.every((l) => l.collected === 1));
	});

	it('a line already struck off stays struck off even if selected again', async () => {
		const env = fakeEnv({
			order_info: [line({ name: 'A', collected: 1 }), line({ name: 'B' })],
			payment_status: 'paid',
			collection_status: 'partial',
			collected_at: null,
		});
		// Selecting both, not just the new one — the merge must not un-collect A.
		const res = await collectItems(env, ORDER, [0, 1], {});
		const body = (await res.json()) as { items: PricedLine[] };
		assert.ok(body.items.every((l) => l.collected === 1));
	});

	it('omitting `lines` collects everything still outstanding — "Mark All"', async () => {
		const env = fakeEnv({
			order_info: [line({ name: 'A' }), line({ name: 'B' }), line({ name: 'C', collected: 1 })],
			payment_status: 'paid',
			collection_status: 'partial',
			collected_at: null,
		});
		const res = await collectItems(env, ORDER, undefined, {});
		const body = (await res.json()) as { collection_status: string; items: PricedLine[] };
		assert.equal(body.collection_status, 'collected');
		assert.ok(body.items.every((l) => l.collected === 1));
	});

	it('refuses an unpaid order', async () => {
		const env = fakeEnv({
			order_info: [line()],
			payment_status: 'unpaid',
			collection_status: 'pending',
			collected_at: null,
		});
		assert.equal(await statusOf(() => collectItems(env, ORDER, [0], {})), 409);
	});

	it('refuses an order that is already fully collected', async () => {
		const env = fakeEnv({
			order_info: [line({ collected: 1 })],
			payment_status: 'paid',
			collection_status: 'collected',
			collected_at: 'NOW',
		});
		assert.equal(await statusOf(() => collectItems(env, ORDER, [0], {})), 409);
	});

	it('404s an order that does not exist', async () => {
		assert.equal(await statusOf(() => collectItems(fakeEnv(null), ORDER, [0], {})), 404);
	});

	it('rejects an index outside the order', async () => {
		const env = fakeEnv({
			order_info: [line()],
			payment_status: 'paid',
			collection_status: 'pending',
			collected_at: null,
		});
		assert.equal(await statusOf(() => collectItems(env, ORDER, [1], {})), 400);
	});

	it('rejects a non-array and an empty array', async () => {
		const env = fakeEnv({
			order_info: [line()],
			payment_status: 'paid',
			collection_status: 'pending',
			collected_at: null,
		});
		assert.equal(await statusOf(() => collectItems(env, ORDER, 'nope', {})), 400);
		assert.equal(await statusOf(() => collectItems(env, ORDER, [], {})), 400);
	});

	it('409s as stale when the row changes between read and write', async () => {
		const env = fakeEnv({
			order_info: [line(), line({ name: 'B' })],
			payment_status: 'paid',
			collection_status: 'pending',
			collected_at: null,
		});
		// Simulate a second scan winning the race: mutate the row's order_info out from
		// under the first request's optimistic-concurrency check.
		const db = (env as unknown as { DB: { prepare: (s: string) => unknown } }).DB;
		const originalPrepare = db.prepare.bind(db);
		let firstRunSeen = false;
		db.prepare = (sql: string) => {
			const stmt = originalPrepare(sql) as {
				bind: (...a: unknown[]) => { run: () => Promise<{ meta: { changes: number } }>; first: () => Promise<unknown> };
			};
			return {
				bind: (...args: unknown[]) => {
					const bound = stmt.bind(...args);
					return {
						...bound,
						run: async () => {
							if (!firstRunSeen) {
								firstRunSeen = true;
								return { meta: { changes: 0 } }; // the race: someone else won
							}
							return bound.run();
						},
					};
				},
			};
		};
		assert.equal(await statusOf(() => collectItems(env, ORDER, [0], {})), 409);
	});
});
