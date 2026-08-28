/**
 * Anvesha '26 merch API — Cloudflare Worker.
 *
 *   GET  /api/merch                     catalogue
 *   GET  /api/merch/:id/image           image, streamed from R2
 *   POST /api/checkout                  price the cart, open an order
 *   POST /api/pay                       interim counter payment (no gateway)
 *   POST /api/webhooks/razorpay         payment result (Razorpay -> us)
 *   GET  /api/orders/:order_id          receipt + QR payload
 *   GET  /api/distribution/:id          is this counter link live?
 *   POST /api/distribution/:id/scan     verify a scanned QR      [session in url]
 *   POST /api/distribution/:id/collect  mark handed over         [session in url]
 */

import {
	adminCollect,
	adminCreateMerch,
	adminDeleteMerch,
	adminDeleteOrder,
	adminListMerch,
	adminListOrders,
	adminScan,
	adminLogin,
	adminLogout,
	adminUpdateMerch,
} from './admin.ts';
import {
	checkSession,
	endDistribution,
	getDistribution,
	sessionCollect,
	sessionLookup,
	sessionScan,
	startDistribution,
} from './distribution.ts';
import {
	checkout,
	directPay,
	getOrder,
	listMerch,
	merchImage,
	razorpayWebhook,
} from './routes.ts';
import { ApiError, bad, corsHeaders, type Env, json, notFound, requireBudget } from './util.ts';

// The Durable Object class must be exported from the entry point for the runtime to
// find it — the binding in wrangler.jsonc only names it.
export { CatalogueHub } from './hub.ts';

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const cors = corsHeaders(env, req);
		if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

		const { pathname } = new URL(req.url);
		const method = req.method;

		try {
			if (method === 'GET' && pathname === '/api/merch') return await listMerch(env, cors, req, ctx);

			// /image is the primary view; /image/:n indexes into the carousel (0 = primary).
			const image = pathname.match(/^\/api\/merch\/([^/]+)\/image(?:\/(\d+))?$/);
			if (method === 'GET' && image)
				return await merchImage(env, decodeURIComponent(image[1]), cors, Number(image[2] ?? 0), req, ctx);

			if (method === 'POST' && pathname === '/api/checkout') return await checkout(env, req, cors);

			// No CORS headers here on purpose: Razorpay calls this server-to-server,
			// and no browser origin should be able to reach it.
			if (method === 'POST' && pathname === '/api/webhooks/razorpay') return await razorpayWebhook(env, req);

			const order = pathname.match(/^\/api\/orders\/([^/]+)$/);
			if (method === 'GET' && order) return await getOrder(env, decodeURIComponent(order[1]), cors);


			// ---- distribution sessions ----
			// No Authorization header: the session id in the path is the credential, which
			// is what lets a volunteer work from a copied link without an admin login.
			const dist = pathname.match(/^\/api\/distribution\/([^/]+)(?:\/(scan|collect|lookup))?$/);
			if (dist) {
				const id = decodeURIComponent(dist[1]);
				if (method === 'GET' && !dist[2]) return await checkSession(env, id, cors);
				if (method === 'POST' && dist[2] === 'scan') return await sessionScan(env, id, req, cors);
				if (method === 'POST' && dist[2] === 'lookup') return await sessionLookup(env, id, req, cors);
				if (method === 'POST' && dist[2] === 'collect')
					return await sessionCollect(env, id, req, cors, ctx);
			}

			// interim counter payment; 404s unless DIRECT_PAY=1
			if (method === 'POST' && pathname === '/api/pay') return await directPay(env, req, cors, ctx);

			// ---- admin panel ----
			// Login is rate limited on its own budget: it is the one route where guessing
			// is the attack, and the shared password makes that worth slowing down.
			if (method === 'POST' && pathname === '/api/admin/login') {
				await requireBudget(env, req, 'admin-login');
				return await adminLogin(env, req, cors);
			}
			if (method === 'POST' && pathname === '/api/admin/logout') return await adminLogout(env, req, cors);
			if (method === 'GET' && pathname === '/api/admin/merch') return await adminListMerch(env, req, cors);
			if (method === 'POST' && pathname === '/api/admin/merch')
				return await adminCreateMerch(env, req, cors, ctx);

			const adminItem = pathname.match(/^\/api\/admin\/merch\/([^/]+)$/);
			if (method === 'PUT' && adminItem)
				return await adminUpdateMerch(env, req, decodeURIComponent(adminItem[1]), cors, ctx);
			if (method === 'DELETE' && adminItem)
				return await adminDeleteMerch(env, req, decodeURIComponent(adminItem[1]), cors, ctx);

			if (method === 'POST' && pathname === '/api/admin/scan') return await adminScan(env, req, cors);
			if (method === 'POST' && pathname === '/api/admin/collect')
				return await adminCollect(env, req, cors, ctx);

			if (pathname === '/api/admin/distribution') {
				if (method === 'GET') return await getDistribution(env, req, cors);
				if (method === 'POST') return await startDistribution(env, req, cors);
				if (method === 'DELETE') return await endDistribution(env, req, cors);
			}

			if (method === 'GET' && pathname === '/api/admin/orders') return await adminListOrders(env, req, cors);
			const adminOrder = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
			if (method === 'DELETE' && adminOrder)
				return await adminDeleteOrder(env, req, decodeURIComponent(adminOrder[1]), cors, ctx);

			// ---- live catalogue updates ----
			// Unauthenticated on purpose: the payload is only "something changed", never
			// data. Clients then re-fetch through whatever auth they already hold, so a
			// listener learns nothing a plain GET /api/merch would not already tell them.
			if (pathname === '/api/live') {
				if (req.headers.get('Upgrade') !== 'websocket')
					throw bad('expected_websocket', 'This endpoint speaks WebSocket');
				const hub = env.HUB.get(env.HUB.idFromName('catalogue'));
				return await hub.fetch(req);
			}

			if (method === 'GET' && pathname === '/api/health')
				return json({ ok: true, environment: env.ENVIRONMENT }, {}, cors);

			throw notFound(`No route for ${method} ${pathname}`);
		} catch (e) {
			if (e instanceof ApiError)
				return json({ error: e.code, message: e.message }, { status: e.status }, cors);

			// Never surface an internal error message to the client: stack traces and
			// SQL fragments are exactly what an attacker wants. Log it, return nothing.
			console.error('unhandled', e);
			return json({ error: 'internal_error', message: 'Something went wrong' }, { status: 500 }, cors);
		}
	},
} satisfies ExportedHandler<Env>;
