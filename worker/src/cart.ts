/**
 * Cart validation and totalling. Deliberately pure: it takes the client's cart plus
 * the rows already read from D1 and returns priced lines, so the money maths can be
 * tested without a database. See ../test/cart.test.ts.
 *
 * The client never sends a price. Every rupee here comes from the `merch` row.
 */

import { bad, looksLikeMerchId } from './util.ts';

export const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
export type Size = (typeof SIZES)[number];

export const MAX_LINES = 20;
export const MAX_QTY_PER_LINE = 10;

/** What the browser posts. `size` is absent for items with has_size = 0. */
export interface CartLineInput {
	merch_id: string;
	quantity: number;
	size?: string | null;
}

/** The subset of a `merch` row this module needs. */
export interface MerchRow {
	id: string;
	name: string;
	price_paise: number;
	has_size: number; // SQLite has no bool: 0 | 1
}

/** A priced line, snapshotted into `orders.order_info`.
 *
 *  `collected` lives on the line, not just on the order, because collection happens
 *  per line at the counter — one line struck off does not mean the whole order was
 *  handed over. It starts at 0 here and is the only field of a line that ever
 *  changes after checkout; see collectItems in routes.ts. */
export interface PricedLine {
	merch_id: string;
	name: string;
	quantity: number;
	size: Size | null;
	unit_price_paise: number;
	line_total_paise: number;
	collected: 0 | 1;
}

export interface PricedCart {
	lines: PricedLine[];
	total_price_paise: number;
}

/** Structural check on the raw body, before anything touches the database. */
export function parseCart(body: unknown): CartLineInput[] {
	const cart = (body as { cart?: unknown })?.cart;
	if (!Array.isArray(cart) || cart.length === 0) throw bad('empty_cart', 'Cart is empty');
	if (cart.length > MAX_LINES) throw bad('too_many_lines', `At most ${MAX_LINES} distinct items`);

	return cart.map((raw, i) => {
		const line = raw as Record<string, unknown>;
		const merch_id = line.merch_id;
		const quantity = line.quantity;

		if (!looksLikeMerchId(merch_id))
			throw bad('bad_merch_id', `Line ${i + 1}: merch_id is not a valid id`);

		// Number.isInteger rejects 1.5, NaN, Infinity and "2" in one call — a `> 0`
		// test alone would let a float through and produce a fractional total.
		if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QTY_PER_LINE)
			throw bad('bad_quantity', `Line ${i + 1}: quantity must be a whole number from 1 to ${MAX_QTY_PER_LINE}`);

		const size = line.size == null ? null : String(line.size).toUpperCase();
		return { merch_id, quantity: quantity as number, size };
	});
}

/**
 * Prices a parsed cart against the catalogue rows.
 * Throws on any unknown id, inactive item, or size mismatch — a checkout that
 * cannot be priced exactly must fail rather than guess.
 */
export function priceCart(lines: CartLineInput[], rows: MerchRow[]): PricedCart {
	const catalogue = new Map(rows.map((r) => [r.id, r]));

	// Two lines with the same id and size would let the same item be counted twice
	// under different quantities; merge them so the order snapshot is unambiguous.
	const merged = new Map<string, CartLineInput>();
	for (const line of lines) {
		const key = `${line.merch_id}::${line.size ?? ''}`;
		const seen = merged.get(key);
		if (seen) {
			const total = seen.quantity + line.quantity;
			if (total > MAX_QTY_PER_LINE)
				throw bad('bad_quantity', `${line.merch_id}: combined quantity exceeds ${MAX_QTY_PER_LINE}`);
			seen.quantity = total;
		} else {
			merged.set(key, { ...line });
		}
	}

	const priced: PricedLine[] = [];
	let total = 0;

	for (const line of merged.values()) {
		const item = catalogue.get(line.merch_id);
		if (!item) throw bad('unknown_merch', `${line.merch_id} is not in the catalogue`);

		let size: Size | null = null;
		if (item.has_size === 1) {
			if (!line.size) throw bad('size_required', `${item.name} needs a size`);
			if (!(SIZES as readonly string[]).includes(line.size))
				throw bad('bad_size', `${line.size} is not a valid size for ${item.name}`);
			size = line.size as Size;
		} else if (line.size) {
			// Not merely cosmetic: accepting a size here would write a size into the
			// order snapshot that the distributor then has to hand out.
			throw bad('size_not_allowed', `${item.name} does not come in sizes`);
		}

		const line_total_paise = item.price_paise * line.quantity;
		total += line_total_paise;

		priced.push({
			merch_id: item.id,
			name: item.name,
			quantity: line.quantity,
			size,
			unit_price_paise: item.price_paise,
			line_total_paise,
			collected: 0,
		});
	}

	if (total <= 0) throw bad('bad_total', 'Order total must be positive');
	return { lines: priced, total_price_paise: total };
}

export const formatRupees = (paise: number) => (paise / 100).toFixed(2);
