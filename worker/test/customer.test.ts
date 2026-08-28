/** parseCustomer is the only guard on buyer details — it gets a real test. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCustomer } from '../src/customer.ts';

const ok = { name: 'Ananya Rao', phone: '9876543210', email: 'ananya@iisertvm.ac.in', roll_number: 'IMS24101' };

describe('parseCustomer', () => {
	it('accepts a clean record', () => {
		const c = parseCustomer(ok);
		assert.deepEqual(c, {
			name: ok.name, phone: ok.phone, email: ok.email, rollNumber: ok.roll_number,
		});
	});

	it('uppercases the roll number and strips stray spacing', () => {
		assert.equal(parseCustomer({ ...ok, roll_number: ' ims 24101 ' }).rollNumber, 'IMS24101');
	});

	it('rejects a roll number that is not IMS + 5 digits', () => {
		for (const roll of ['IMS2410', 'IMS241012', 'IMSABCDE', 'IM24101', '24101', 'BSMS24101', '', null])
			assert.throws(() => parseCustomer({ ...ok, roll_number: roll }), /roll number/i, `accepted ${String(roll)}`);
	});

	it('collapses whitespace in the name', () => {
		assert.equal(parseCustomer({ ...ok, name: '  Ananya   Rao  ' }).name, 'Ananya Rao');
	});

	it('lowercases the email', () => {
		assert.equal(parseCustomer({ ...ok, email: 'Ananya@IISERTVM.AC.IN' }).email, 'ananya@iisertvm.ac.in');
	});

	it('normalises every way of writing the same phone to one value', () => {
		// The point of normalising: these must not become four different records.
		for (const p of ['+91 98765 43210', '+919876543210', '098765-43210', '91 9876543210']) {
			assert.equal(parseCustomer({ ...ok, phone: p }).phone, '9876543210', `failed on ${p}`);
		}
	});

	it('rejects a short name', () => {
		assert.throws(() => parseCustomer({ ...ok, name: 'A' }), /2 to 80/);
	});

	it('rejects a phone that is not an Indian mobile', () => {
		// too short, too long, and a landline-style leading digit
		for (const p of ['12345', '98765432100', '1234567890', '5876543210']) {
			assert.throws(() => parseCustomer({ ...ok, phone: p }), /10-digit/, `accepted ${p}`);
		}
	});

	it('rejects a malformed email', () => {
		for (const e of ['nope', 'a@b', 'a@b.c', '@iisertvm.ac.in', 'a b@iisertvm.ac.in']) {
			assert.throws(() => parseCustomer({ ...ok, email: e }), /@iisertvm\.ac\.in/, `accepted ${e}`);
		}
	});

	it('rejects any domain other than iisertvm.ac.in', () => {
		// A well-formed address at the wrong college, and a lookalike domain that only
		// starts the right way — both must fail exactly the same as garbage input.
		for (const e of ['ananya@gmail.com', 'ananya@college.edu', 'ananya@iisertvm.ac.in.evil.com']) {
			assert.throws(() => parseCustomer({ ...ok, email: e }), /@iisertvm\.ac\.in/, `accepted ${e}`);
		}
	});

	it('rejects missing fields outright', () => {
		assert.throws(() => parseCustomer({}), /2 to 80/);
		assert.throws(() => parseCustomer(null), /2 to 80/);
	});
});
