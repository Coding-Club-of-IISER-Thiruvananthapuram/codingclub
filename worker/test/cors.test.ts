/**
 * The origin allow-list. This is the only thing stopping a page on someone else's
 * domain from driving the admin and distribution routes with a stolen session, so the
 * "not on the list" branch gets a test rather than a code review.
 *
 *   npm test        (node --test, using Node's native TS type stripping)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { corsHeaders, type Env } from '../src/util.ts';

const ORIGINS = 'https://anvesha26.in,https://www.anvesha26.in,https://anvesha-26.vercel.app';
const env = { ALLOWED_ORIGINS: ORIGINS } as Env;

const headersFor = (origin?: string) =>
	corsHeaders(env, new Request('https://api.test/api/merch', origin ? { headers: { Origin: origin } } : {}));

describe('corsHeaders', () => {
	it('echoes an origin that is on the list', () => {
		for (const o of ORIGINS.split(',')) {
			assert.equal(headersFor(o)['Access-Control-Allow-Origin'], o);
		}
	});

	it('sends no Allow-Origin at all for an origin that is not', () => {
		for (const o of ['https://evil.example.com', 'http://localhost:4321', 'null']) {
			assert.equal(headersFor(o)['Access-Control-Allow-Origin'], undefined);
		}
	});

	it('does not leak a fallback origin to a request with no Origin header', () => {
		assert.equal(headersFor()['Access-Control-Allow-Origin'], undefined);
	});

	// A near-miss must not pass: subdomain and scheme are part of the identity, and
	// substring-style matching is the classic way an allow-list gets bypassed.
	it('rejects look-alike origins', () => {
		for (const o of [
			'https://anvesha26.in.evil.com',
			'http://anvesha26.in',
			'https://evil-anvesha26.in',
			'https://anvesha26.in:8080',
		]) {
			assert.equal(headersFor(o)['Access-Control-Allow-Origin'], undefined, o);
		}
	});

	// Vary must be present whether or not the origin matched, or a shared cache can
	// serve one origin's allow header to another.
	it('always varies on Origin', () => {
		assert.equal(headersFor('https://anvesha26.in').Vary, 'Origin');
		assert.equal(headersFor('https://evil.example.com').Vary, 'Origin');
	});
});
