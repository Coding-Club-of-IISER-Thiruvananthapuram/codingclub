/**
 * The money path. Every rupee a student is charged comes out of priceCart(), so it
 * gets a real test — no D1, no network, just the arithmetic and the rejections.
 *
 *   npm test        (node --test, using Node's native TS type stripping)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_QTY_PER_LINE, parseCart, priceCart, type MerchRow } from '../src/cart.ts';

const CATALOGUE: MerchRow[] = [
	{ id: 'MER_A1B2C3D4', name: 'Anvesha Tee', price_paise: 49900, has_size: 1 },
	{ id: 'MER_P3Q4R5S6', name: 'Canvas Tote', price_paise: 34900, has_size: 0 },
];

const parse = (cart: unknown) => parseCart({ cart });
const price = (cart: unknown) => priceCart(parse(cart), CATALOGUE);

describe('parseCart', () => {
	it('rejects an empty cart', () => {
		assert.throws(() => parse([]), /Cart is empty/);
	});

	it('rejects a fractional quantity', () => {
		// 1.5 x 499 would produce a fractional paise total that cannot be charged.
		assert.throws(() => parse([{ merch_id: 'MER_A1B2C3D4', quantity: 1.5 }]), /whole number/);
	});

	it('rejects a quantity sent as a string', () => {
		assert.throws(() => parse([{ merch_id: 'MER_A1B2C3D4', quantity: '2' }]), /whole number/);
	});

	it('rejects zero, negative and absurd quantities', () => {
		for (const q of [0, -3, MAX_QTY_PER_LINE + 1]) {
			assert.throws(() => parse([{ merch_id: 'MER_A1B2C3D4', quantity: q }]), /whole number|1 to/);
		}
	});

	it('rejects a malformed merch id', () => {
		for (const id of [
			'DROP TABLE merch',
			'MER-000001', // the old sequential format is no longer an id
			'MER_SHORT', //  too few characters
			'MER_A1B2C3D45', // too many
			'MER_A1B2C3D!', // outside the alphabet
			'MER_a1b2c3d4', // lower case: the alphabet is upper only
			'MER_IL0UA1B2', // I, L, O and U are excluded on purpose
			'mer_A1B2C3D4',
			'',
		]) {
			assert.throws(() => parse([{ merch_id: id, quantity: 1 }]), /valid id/, `accepted ${id}`);
		}
	});
});

describe('priceCart', () => {
	it('totals a single line from catalogue prices', () => {
		const out = price([{ merch_id: 'MER_A1B2C3D4', quantity: 2, size: 'M' }]);
		assert.equal(out.total_price_paise, 99800); // 2 x 49900
		assert.equal(out.lines[0].unit_price_paise, 49900);
		assert.equal(out.lines[0].size, 'M');
	});

	it('totals a mixed cart', () => {
		const out = price([
			{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'L' },
			{ merch_id: 'MER_P3Q4R5S6', quantity: 3 },
		]);
		assert.equal(out.total_price_paise, 49900 + 3 * 34900); // 154600
	});

	it('ignores any price the client tries to send', () => {
		// The whole point: a hostile client cannot set its own price.
		const out = priceCart(
			parse([{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'S', price_paise: 1, unit_price_paise: 1 }]),
			CATALOGUE,
		);
		assert.equal(out.total_price_paise, 49900);
	});

	it('rejects an id that is not in the catalogue', () => {
		assert.throws(() => price([{ merch_id: 'MER_ZZZZZZZZ', quantity: 1 }]), /not in the catalogue/);
	});

	it('requires a size for a sized item', () => {
		assert.throws(() => price([{ merch_id: 'MER_A1B2C3D4', quantity: 1 }]), /needs a size/);
	});

	it('rejects an invalid size', () => {
		assert.throws(() => price([{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'XXL' }]), /not a valid size/);
	});

	it('normalises size casing', () => {
		const out = price([{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'm' }]);
		assert.equal(out.lines[0].size, 'M');
	});

	it('refuses a size on an unsized item', () => {
		assert.throws(() => price([{ merch_id: 'MER_P3Q4R5S6', quantity: 1, size: 'M' }]), /does not come in sizes/);
	});

	it('merges duplicate lines of the same id and size', () => {
		const out = price([
			{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'M' },
			{ merch_id: 'MER_A1B2C3D4', quantity: 2, size: 'M' },
		]);
		assert.equal(out.lines.length, 1);
		assert.equal(out.lines[0].quantity, 3);
		assert.equal(out.total_price_paise, 3 * 49900);
	});

	it('keeps the same id in different sizes as separate lines', () => {
		const out = price([
			{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'M' },
			{ merch_id: 'MER_A1B2C3D4', quantity: 1, size: 'L' },
		]);
		assert.equal(out.lines.length, 2);
		assert.equal(out.total_price_paise, 2 * 49900);
	});

	it('caps the merged quantity, not just the per-line one', () => {
		// Splitting a cart into many small lines must not get past the per-line cap.
		const cart = Array.from({ length: 6 }, () => ({ merch_id: 'MER_A1B2C3D4', quantity: 2, size: 'M' }));
		assert.throws(() => price(cart), /combined quantity exceeds/);
	});

	it('produces integer paise for every line', () => {
		const out = price([
			{ merch_id: 'MER_A1B2C3D4', quantity: 3, size: 'XL' },
			{ merch_id: 'MER_P3Q4R5S6', quantity: 2 },
		]);
		for (const l of out.lines) assert.ok(Number.isInteger(l.line_total_paise));
		assert.ok(Number.isInteger(out.total_price_paise));
	});
});
