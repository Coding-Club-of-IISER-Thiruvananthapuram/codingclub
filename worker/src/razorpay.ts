/** Razorpay: order creation and webhook signature verification. */

import { ApiError, type Env, timingSafeEqual } from './util.ts';

export interface RazorpayOrder {
	id: string; // order_xxxxxxxxxxxx
	amount: number; // paise
	currency: string;
	status: string;
}

const API = 'https://api.razorpay.com/v1';

/**
 * Creates the Razorpay order that the browser's Checkout widget opens against.
 *
 * With RAZORPAY_STUB=1 this returns a fake order so the whole flow can be exercised
 * locally before a Razorpay account exists. It refuses to stub in production — a
 * silent stub on a live deploy would hand out merch for orders nobody paid for.
 */
export async function createRazorpayOrder(
	env: Env,
	receipt: string,
	amountPaise: number,
): Promise<RazorpayOrder> {
	if (env.RAZORPAY_STUB === '1') {
		if (env.ENVIRONMENT === 'production')
			throw new ApiError(500, 'stub_in_production', 'RAZORPAY_STUB must not be set in production');
		return { id: `order_STUB${receipt.slice(-12)}`, amount: amountPaise, currency: 'INR', status: 'created' };
	}

	const { RAZORPAY_KEY_ID: key, RAZORPAY_KEY_SECRET: secret } = env;
	if (!key || !secret)
		throw new ApiError(503, 'not_configured', 'Razorpay keys are not configured');

	const res = await fetch(`${API}/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			amount: amountPaise, // Razorpay speaks paise, same unit we store
			currency: 'INR',
			receipt,
			notes: { source: 'anvesha-merch' },
		}),
	});

	if (!res.ok) {
		const detail = await res.text();
		console.error('razorpay order create failed', res.status, detail);
		throw new ApiError(502, 'razorpay_error', 'Could not create the payment order');
	}
	return (await res.json()) as RazorpayOrder;
}

/**
 * Verifies the `X-Razorpay-Signature` header against the raw request body.
 *
 * This is the entire trust boundary for the webhook: without it, anyone who learns
 * the endpoint URL could POST "payment.captured" and mark any order paid. The body
 * must be the exact bytes received — re-serialising the parsed JSON changes key
 * order and whitespace, and the HMAC no longer matches.
 */
export async function verifyWebhookSignature(
	env: Env,
	rawBody: string,
	signature: string | null,
): Promise<boolean> {
	const secret = env.RAZORPAY_WEBHOOK_SECRET;
	if (!secret) throw new ApiError(503, 'not_configured', 'RAZORPAY_WEBHOOK_SECRET is not set');
	if (!signature) return false;

	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
	const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return timingSafeEqual(hex, signature.trim().toLowerCase());
}

/** The bits of a Razorpay payment entity we care about. */
export interface PaymentEntity {
	id: string; // pay_xxxxxxxxxxxx
	order_id: string; // order_xxxxxxxxxxxx
	amount: number;
	status: string;
	method?: string;
	email?: string;
	contact?: string;
	created_at?: number;
	[k: string]: unknown;
}

export interface WebhookEvent {
	event: string;
	payload?: { payment?: { entity?: PaymentEntity } };
}

/** Pulls the payment entity out of a webhook body, or null if the event has none. */
export function paymentFromEvent(body: WebhookEvent): PaymentEntity | null {
	const entity = body?.payload?.payment?.entity;
	return entity && typeof entity.id === 'string' && typeof entity.order_id === 'string' ? entity : null;
}
