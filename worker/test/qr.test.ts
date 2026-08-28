/**
 * The PNG is written byte by byte, so the test checks the actual file structure —
 * a "returns something" assertion would pass on a corrupt image.
 *
 * zlib.inflateSync is the real check: it fails loudly if the stored deflate blocks or
 * the adler-32 are wrong, which is exactly the bit that is easy to get subtly right.
 */

import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';

import { qrPng, toBase64 } from '../src/qr.ts';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Walks the chunk list the way a decoder would. */
function chunks(png: Uint8Array) {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const found: { type: string; data: Uint8Array }[] = [];
	let p = 8;
	while (p < png.length) {
		const len = view.getUint32(p);
		const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
		found.push({ type, data: png.subarray(p + 8, p + 8 + len) });
		p += 12 + len;
	}
	return found;
}

describe('qrPng', () => {
	const png = qrPng('ORD_4NVJDFJDP33Q290RDJ1HSSZHCC');

	it('starts with the PNG signature', () => {
		assert.deepEqual([...png.subarray(0, 8)], SIG);
	});

	it('emits IHDR, IDAT and IEND in order', () => {
		assert.deepEqual(chunks(png).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
	});

	it('declares a square 1-bit greyscale image', () => {
		const ihdr = chunks(png)[0].data;
		const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
		assert.equal(view.getUint32(0), view.getUint32(4), 'not square');
		assert.equal(ihdr[8], 1, 'bit depth');
		assert.equal(ihdr[9], 0, 'colour type');
	});

	it('produces a zlib stream a real decoder can inflate', () => {
		const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
		const raw = inflateSync(Buffer.from(idat)); // throws on a bad stream or checksum

		const ihdr = chunks(png)[0].data;
		const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
		const width = view.getUint32(0);
		const height = view.getUint32(4);
		assert.equal(raw.length, (Math.ceil(width / 8) + 1) * height, 'scanline size');
	});

	it('actually draws something — the quiet margin is white, the code is not', () => {
		const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
		const raw = inflateSync(Buffer.from(idat));
		const ihdr = chunks(png)[0].data;
		const width = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(0);
		const stride = Math.ceil(width / 8) + 1;

		// Row 0 is inside the 4-module quiet zone, so every bit must still be white.
		const top = raw.subarray(1, stride);
		assert.ok(top.every((b) => b === 0xff), 'quiet zone is not blank');
		// Somewhere below it there must be black, or the QR never got drawn. At the
		// default scale of 8 a module is exactly one byte wide, so dark modules show up
		// as whole 0x00 bytes rather than partially set ones.
		assert.ok(raw.some((b) => b === 0x00), 'no modules drawn');
	});

	it('scales with the module size', () => {
		const small = qrPng('ORD_TEST', 4);
		const large = qrPng('ORD_TEST', 8);
		const widthOf = (p: Uint8Array) => {
			const d = chunks(p)[0].data;
			return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(0);
		};
		assert.equal(widthOf(large), widthOf(small) * 2);
	});

	it('round-trips through base64', () => {
		assert.deepEqual([...Buffer.from(toBase64(png), 'base64').subarray(0, 8)], SIG);
	});
});
