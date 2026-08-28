#!/usr/bin/env node
/**
 * Sets (or changes) the admin panel password.
 *
 *   node scripts/set-admin-password.mjs --local
 *   node scripts/set-admin-password.mjs --remote
 *
 * The password is read from a hidden prompt and never appears in argv, so it cannot
 * end up in your shell history or in `ps` output.
 *
 * The hash is derived here with node:crypto using exactly the parameters src/admin.ts
 * uses with WebCrypto — PBKDF2-SHA256, 100k iterations, 32-byte output. `--verify`
 * checks that equivalence instead of trusting the comment.
 */

import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline';

const ITERATIONS = 100_000;

const derive = (password, saltHex) =>
	pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), ITERATIONS, 32, 'sha256').toString('hex');

/** Proves node:crypto and WebCrypto agree — if they ever diverge, login breaks silently. */
async function verify() {
	const salt = randomBytes(16).toString('hex');
	const password = 'correct horse battery staple';

	const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const bits = await webcrypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: Buffer.from(salt, 'hex'), iterations: ITERATIONS, hash: 'SHA-256' },
		key,
		256,
	);
	const web = Buffer.from(bits).toString('hex');
	const node = derive(password, salt);

	console.log(node === web ? '✔ node:crypto and WebCrypto derive the same hash' : '✖ MISMATCH');
	process.exit(node === web ? 0 : 1);
}

/** Reads a line without echoing it to the terminal. */
function askHidden(question) {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		const onData = (char) => {
			// Re-print the prompt with no characters, so nothing is shown as it is typed.
			if (!['\n', '\r', ''].includes(char.toString())) {
				process.stdout.clearLine(0);
				process.stdout.cursorTo(0);
				process.stdout.write(question);
			}
		};
		process.stdin.on('data', onData);
		rl.question(question, (answer) => {
			process.stdin.off('data', onData);
			rl.close();
			process.stdout.write('\n');
			resolve(answer);
		});
	});
}

const args = process.argv.slice(2);
if (args.includes('--verify')) await verify();

const target = args.includes('--remote') ? '--remote' : '--local';

const password = await askHidden('New admin password: ');
if (password.length < 8) {
	console.error('Refusing: use at least 8 characters. This is the only gate on the panel.');
	process.exit(1);
}
const again = await askHidden('Confirm password: ');
if (password !== again) {
	console.error('Refusing: the two entries do not match.');
	process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = derive(password, salt);

// INSERT OR REPLACE on the fixed id keeps this a single-row table: running the script
// again changes the password rather than adding a second one that also works.
const sql = `INSERT OR REPLACE INTO login_validation (id, password_hash, password_salt, active, updated_at)
             VALUES (1, '${hash}', '${salt}', 1, datetime('now'));`;

execFileSync('npx', ['wrangler', 'd1', 'execute', 'anvesha', target, '--command', sql], {
	stdio: ['ignore', 'inherit', 'inherit'],
});

console.log(`\n✔ Admin password set (${target.replace('--', '')}). The panel is active.`);
console.log('  Disable it any time with:');
console.log(`  npx wrangler d1 execute anvesha ${target} --command "UPDATE login_validation SET active = 0 WHERE id = 1"`);
