/**
 * QR -> PNG, with no canvas and no image library.
 *
 * Workers have no DOM, so the browser's `canvas.toDataURL()` trick is unavailable and
 * every image encoder on npm pulls in a binary. A QR is a 1-bit bitmap, which is the
 * one case where writing the PNG by hand is genuinely small: the format allows
 * *uncompressed* deflate blocks, so no compressor is needed either.
 *
 * The output is byte-for-byte deterministic, which is what makes it testable — see
 * ../test/qr.test.ts.
 */

import qrcode from 'qrcode-generator';

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 over the *uncompressed* data — the checksum that closes a zlib stream. */
function adler32(data: Uint8Array): number {
	let a = 1;
	let b = 0;
	for (const byte of data) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}
	return (((b << 16) | a) >>> 0);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	// The CRC covers the type and the data, but not the length.
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/**
 * Wraps raw bytes in a zlib stream of stored (BTYPE=00) deflate blocks.
 * Stored blocks are literally "here are N bytes", so this is a valid zlib stream that
 * every PNG decoder accepts without a single line of compression code.
 */
function zlibStored(raw: Uint8Array): Uint8Array {
	const MAX = 0xffff; // a stored block's length field is 16 bits
	const blockCount = Math.max(1, Math.ceil(raw.length / MAX));
	const out = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
	let p = 0;

	out[p++] = 0x78; // CM=8 (deflate), CINFO=7 (32K window)
	out[p++] = 0x01; // FCHECK so the header is a multiple of 31, no preset dictionary

	for (let off = 0, i = 0; i < blockCount; i++, off += MAX) {
		const len = Math.min(MAX, raw.length - off);
		out[p++] = i === blockCount - 1 ? 1 : 0; // BFINAL on the last block, BTYPE=00
		out[p++] = len & 0xff;
		out[p++] = (len >> 8) & 0xff;
		out[p++] = ~len & 0xff; // NLEN is the one's complement of LEN
		out[p++] = (~len >> 8) & 0xff;
		out.set(raw.subarray(off, off + len), p);
		p += len;
	}

	new DataView(out.buffer).setUint32(p, adler32(raw));
	return out;
}

/** A 1-bit greyscale PNG. `rows` holds one packed row per entry, MSB first, 0 = black. */
function png1bit(width: number, height: number, rows: Uint8Array[]): Uint8Array {
	const stride = rows[0].length;
	// Each scanline is prefixed with its filter type. 0 = None: the bitmap is already
	// tiny and a filter would only cost code.
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		raw.set(rows[y], y * (stride + 1) + 1);
	}

	const ihdr = new Uint8Array(13);
	const view = new DataView(ihdr.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	ihdr[8] = 1; // bit depth
	ihdr[9] = 0; // colour type 0 = greyscale
	ihdr[10] = 0; // deflate
	ihdr[11] = 0; // adaptive filtering
	ihdr[12] = 0; // no interlace

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlibStored(raw)),
		chunk('IEND', new Uint8Array(0)),
	];

	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let p = 0;
	for (const part of parts) {
		out.set(part, p);
		p += part.length;
	}
	return out;
}

/**
 * Encodes `text` as a QR PNG.
 *
 * `scale` is device pixels per module and `quiet` the mandatory silent margin in
 * modules — without that margin many scanners simply refuse to see the code.
 */
export function qrPng(text: string, scale = 8, quiet = 4): Uint8Array {
	const qr = qrcode(0, 'M'); // 0 = pick the smallest version that fits
	qr.addData(text);
	qr.make();

	const count = qr.getModuleCount();
	const size = (count + quiet * 2) * scale;
	const stride = Math.ceil(size / 8);

	const rows: Uint8Array[] = [];
	for (let y = 0; y < size; y++) {
		const row = new Uint8Array(stride).fill(0xff); // start all-white
		const moduleY = Math.floor(y / scale) - quiet;
		if (moduleY >= 0 && moduleY < count) {
			for (let x = 0; x < size; x++) {
				const moduleX = Math.floor(x / scale) - quiet;
				if (moduleX >= 0 && moduleX < count && qr.isDark(moduleY, moduleX))
					row[x >> 3] &= ~(0x80 >> (x & 7)); // clear the bit -> black
			}
		}
		rows.push(row);
	}

	return png1bit(size, size, rows);
}

/** Base64, for a Resend attachment. Built in chunks so a big image cannot blow the stack. */
export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}
