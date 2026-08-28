/**
 * Order confirmation email, sent through Resend.
 *
 * Everything here is best-effort by design. A paid order is already durable in D1 by
 * the time this runs, so a Resend outage, a bounced address or a missing key must
 * never turn a successful payment into a failed request — `sendOrderEmail` therefore
 * resolves rather than throws, and logs instead.
 *
 * The markup is deliberately 2005-era: tables, inline styles, no flexbox and no
 * external CSS. Mail clients are not browsers; Outlook still renders with Word.
 */

import { formatRupees, type PricedLine } from './cart.ts';
import { qrPng, toBase64 } from './qr.ts';
import type { Env } from './util.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resend's shared sender. Works with no domain set up, but only delivers to the
// address that owns the Resend account — set MAIL_FROM once a domain is verified.
const DEFAULT_FROM = "Anvesha '26 <onboarding@resend.dev>";

const INK = '#0b0b0f';
const ACCENT = '#9333ea'; // keep in sync with --accent in src/styles/theme.css
const PAPER = '#ffffff';
const SINK = '#f5f5f6';
const MONO = "'DM Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
const SANS = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface OrderEmail {
	to: string;
	name: string;
	orderId: string;
	transactionId: string;
	items: PricedLine[];
	totalPaise: number;
}

/** Escapes text bound for HTML. Item names come from D1, but nothing untrusted is
 *  ever interpolated raw — an apostrophe in a product name should not be able to
 *  break the markup. */
function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const label = (l: PricedLine) => `${l.name}${l.size ? ` · ${l.size}` : ''} × ${l.quantity}`;

function html(o: OrderEmail): string {
	const rows = o.items
		.map(
			(l) => `
			<tr>
				<td style="padding:10px 0;border-bottom:1px solid #e6e6e8;font:14px ${SANS};color:${INK};">${esc(label(l))}</td>
				<td style="padding:10px 0;border-bottom:1px solid #e6e6e8;font:600 14px ${SANS};color:${INK};text-align:right;white-space:nowrap;">₹${formatRupees(l.line_total_paise)}</td>
			</tr>`,
		)
		.join('');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Order confirmed — Anvesha '26</title>
</head>
<body style="margin:0;padding:0;background:${SINK};">
	<!-- preheader: the grey line mail clients show beside the subject -->
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
		Order ${esc(o.orderId)} is confirmed. Your collection QR is attached.
	</div>

	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SINK};padding:28px 12px;">
		<tr><td align="center">
			<table role="presentation" width="600" cellpadding="0" cellspacing="0"
			       style="width:100%;max-width:600px;background:${PAPER};border:2px solid ${INK};">

				<!-- masthead -->
				<tr><td style="padding:26px 30px 0;">
					<div style="font:800 20px ${SANS};letter-spacing:.06em;color:${INK};">
						ANVESHA<span style="color:${ACCENT};">'26</span>
					</div>
					<div style="height:4px;background:${ACCENT};width:56px;margin-top:12px;"></div>
				</td></tr>

				<tr><td style="padding:22px 30px 0;">
					<h1 style="margin:0;font:800 26px ${SANS};letter-spacing:-.01em;color:${INK};">Order confirmed</h1>
					<p style="margin:12px 0 0;font:15px ${SANS};line-height:1.6;color:#4a4a52;">
						Hi ${esc(o.name)}, we've got your order and your payment. Your collection QR
						is attached to this email.
					</p>
				</td></tr>

				<!-- invoice -->
				<tr><td style="padding:26px 30px 0;">
					<div style="font:${MONO};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8a8a92;padding-bottom:6px;">Invoice</div>
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
						${rows}
						<tr>
							<td style="padding:14px 0 0;font:800 16px ${SANS};color:${INK};">Total paid</td>
							<td style="padding:14px 0 0;font:800 22px ${SANS};color:${INK};text-align:right;white-space:nowrap;">₹${formatRupees(o.totalPaise)}</td>
						</tr>
					</table>
				</td></tr>

				<!-- ids -->
				<tr><td style="padding:24px 30px 0;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
					       style="background:${SINK};border:2px solid ${INK};">
						<tr><td style="padding:14px 16px;">
							<div style="font:${MONO};font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#8a8a92;">Order id</div>
							<div style="font:${MONO};font-size:13px;color:${INK};word-break:break-all;padding-top:4px;">${esc(o.orderId)}</div>
							<div style="font:${MONO};font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#8a8a92;padding-top:12px;">Transaction</div>
							<div style="font:${MONO};font-size:13px;color:${INK};word-break:break-all;padding-top:4px;">${esc(o.transactionId)}</div>
						</td></tr>
					</table>
				</td></tr>

				<!-- collection -->
				<tr><td style="padding:24px 30px 0;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
					       style="background:${PAPER};border:2px solid ${INK};">
						<tr><td style="padding:14px 16px;font:14px ${SANS};line-height:1.6;color:${INK};">
							<strong style="color:${ACCENT};">Collecting your order.</strong> Show the attached QR
							at the Anvesha merch desk. Keep it safe — anyone holding it can collect this order.
						</td></tr>
					</table>
				</td></tr>

				<tr><td style="padding:22px 30px 30px;">
					<p style="margin:0;font:12px ${SANS};line-height:1.6;color:#8a8a92;">
						Paid at the counter. This email is your receipt — no reply needed.
					</p>
				</td></tr>
			</table>

			<div style="font:11px ${SANS};color:#9a9aa2;padding-top:14px;">
				Anvesha '26 · IISER Thiruvananthapuram
			</div>
		</td></tr>
	</table>
</body>
</html>`;
}

/** Plain-text alternative. Not optional: a mail with no text part scores worse with
 *  spam filters and is unreadable in text-only clients. */
function text(o: OrderEmail): string {
	const lines = o.items.map((l) => `  ${label(l)}  —  ₹${formatRupees(l.line_total_paise)}`).join('\n');
	return [
		"ANVESHA '26 — ORDER CONFIRMED",
		'',
		`Hi ${o.name}, we've got your order and your payment.`,
		'',
		'INVOICE',
		lines,
		`  Total paid: ₹${formatRupees(o.totalPaise)}`,
		'',
		`Order id:    ${o.orderId}`,
		`Transaction: ${o.transactionId}`,
		'',
		'Show the attached QR at the Anvesha merch desk to collect.',
		'Keep it safe — anyone holding it can collect this order.',
		'',
		"Anvesha '26 · IISER Thiruvananthapuram",
	].join('\n');
}

/**
 * Sends the confirmation. Resolves either way — never throws into the payment path.
 * Returns whether the mail was actually accepted, which is what the tests assert on.
 */
export async function sendOrderEmail(env: Env, o: OrderEmail): Promise<boolean> {
	if (!env.RESEND_API_KEY) {
		// Local dev and CI run without a key; that is not an error worth failing over.
		console.warn('email: RESEND_API_KEY not set, skipping confirmation for', o.orderId);
		return false;
	}

	try {
		const res = await fetch(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: env.MAIL_FROM || DEFAULT_FROM,
				to: [o.to],
				subject: `Your Anvesha '26 order — ${o.orderId}`,
				html: html(o),
				text: text(o),
				attachments: [
					{
						filename: `anvesha-${o.orderId}.png`,
						content: toBase64(qrPng(o.orderId)),
					},
				],
			}),
		});

		if (!res.ok) {
			console.error('email: resend rejected', res.status, await res.text());
			return false;
		}
		return true;
	} catch (e) {
		console.error('email: send failed for', o.orderId, e);
		return false;
	}
}
