# Anvesha '26 — merch API

Cloudflare Worker + D1 + R2. Handles the catalogue, checkout, Razorpay settlement and
merch collection.

Everything below runs **locally with no Cloudflare or Razorpay account**.

```bash
cd worker
npm install
npm run db:local     # create tables in the local D1
npm run db:seed      # 7 sample items
cp .dev.vars.example .dev.vars   # edit the two secrets to anything
npm run dev          # http://127.0.0.1:8787
```

Then, in a second terminal:

```bash
npm run smoke        # 30 checks: drives a real purchase end to end
npm test             # 17 unit tests on the money path
npm run typecheck
```

`npm run smoke` is the one to trust — 35 checks that buy something, reject bad buyer
details, pay at the counter, pay twice, collect, and try to collect twice.

### Payment mode

There is **no gateway right now**. `DIRECT_PAY=1` makes checkout skip Razorpay entirely
(`razorpay_order_id` stays NULL) and `POST /api/pay` settle the order after taking the
buyer's name, phone and college email. The worker mints its own `TXN_…` id and writes
exactly the rows the Razorpay webhook would.

**Delete `DIRECT_PAY` the moment Razorpay goes live.** Leaving it on beside a real
gateway would let anyone mark any order paid by POSTing to `/api/pay`. The webhook route
stays wired and still rejects anything unsigned, so switching over is: set the Razorpay
secrets, drop `DIRECT_PAY`, and point the frontend at Checkout.js.

### Confirmation email

A paid order triggers an HTML confirmation through [Resend](https://resend.com), with the
invoice in the body and the collection QR attached as a PNG. Set `RESEND_API_KEY`
(`wrangler secret put RESEND_API_KEY`); leave it unset and no mail is sent — the order
still completes and the skip is logged.

**Sending is best-effort on purpose.** The mail goes out after the D1 batch commits, via
`ctx.waitUntil`, and `sendOrderEmail` swallows its own failures. A Resend outage must
never turn a payment that already succeeded into an error the student sees.

Two things that will bite you:

1. **Until a domain is verified**, Resend only delivers from `onboarding@resend.dev` and
   only to the address that owns the Resend account. Every other recipient gets a 403
   (logged, order unaffected). Verify a domain at resend.com/domains, then set
   `MAIL_FROM` (e.g. `Anvesha '26 <orders@anvesha26.in>`) — no code change needed.
   Note this bites *every* real order, because buyers must use `@iisertvm.ac.in`, which
   is never the Resend account address.
2. **Only `/api/pay` sends mail.** When you move to Razorpay, `razorpayWebhook` becomes
   the thing that marks orders paid and it does *not* send a confirmation — wire
   `sendOrderEmail` in there too or confirmations silently stop. The webhook has the
   payer's email on `entity.email`.

The QR PNG is generated in-worker (`src/qr.ts`) with no canvas and no image library —
Workers have neither. A QR is a 1-bit bitmap and PNG permits uncompressed deflate
blocks, so it is written byte by byte. `test/qr.test.ts` inflates the result with
`node:zlib` to prove the stream is real rather than merely present.

### Rate limiting

`POST /api/checkout` and `POST /api/pay` are each capped at 30 requests per 60 seconds
per client IP, via a native [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
(`MONEY_RL` in `wrangler.jsonc`) — no dashboard WAF rule, no external service. The two
routes get independent budgets (keyed `checkout:<ip>` / `pay:<ip>`), so a burst of
legitimate checkouts can't lock a student out of paying. A tripped limit returns a plain
`429 { error: "rate_limited" }`, the same `ApiError` shape as every other rejection.

This only covers the two routes that write money-relevant rows, plus the counter's
session routes. `GET /api/merch` is unlimited — it is cheap, read-only and edge-cached.

**Bindings are not inherited into named environments** — the same trap `DIRECT_PAY` has.
`MONEY_RL` is declared both at the top level and inside `env.production`; if you add
another binding later, remember to add it in both places or `--env production` deploys
silently without it.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/merch` | — | Catalogue: id, name, description, designer, price, `has_size`, image URL |
| `GET` | `/api/merch/:id/image` | — | Streams the primary image out of R2, cached 24h |
| `GET` | `/api/merch/:id/image/:n` | — | View `n` of the carousel — 0 is the primary, then each extra in order |
| `POST` | `/api/checkout` | — | Prices the cart, creates the order + Razorpay order |
| `POST` | `/api/webhooks/razorpay` | HMAC | Razorpay → us. The only writer of `payment_status` |
| `GET` | `/api/orders/:order_id` | capability | Receipt + QR payload for the student |
| `GET` | `/api/health` | — | Liveness |
| `POST` | `/api/pay` | — | **Interim.** Counter payment: takes name/phone/email, mints a `TXN_` id, settles the order. 404s unless `DIRECT_PAY=1` |
| `POST` | `/api/admin/login` | password | Name + roll number + college email + shared password → session token |
| `POST` | `/api/admin/logout` | Bearer | Stamps `logout_time`, clears the token |
| `GET` | `/api/admin/merch` | Bearer | Catalogue **including inactive rows** |
| `POST` | `/api/admin/merch` | Bearer | Create an item. `multipart/form-data`, optional `image` file |
| `PUT` | `/api/admin/merch/:id` | Bearer | Edit name, description, designer, category, price, `has_size`, `is_active` |
| `DELETE` | `/api/admin/merch/:id` | Bearer | Remove an item, its `merch_images` rows and its R2 objects |
| `POST` | `/api/admin/scan` | Bearer | Same lookup as the counter's session scan, under an admin session |
| `POST` | `/api/admin/collect` | Bearer | Same hand-over as the counter's session collect, under an admin session |
| `GET` | `/api/admin/orders` | Bearer | Every order, joined with the buyer's name/mail/phone |
| `DELETE` | `/api/admin/orders/:order_id` | Bearer | Remove an order and its payment row |
| `GET` | `/api/live` | — | WebSocket. Pushes `{type:"catalogue"}` whenever the catalogue changes |

---

## Admin panel

Pages live on the Astro side at `/admin` (sign-in), `/admin/merch`, `/admin/events`.

**Set the password before anything works:**

```bash
node scripts/set-admin-password.mjs --local     # for wrangler dev
node scripts/set-admin-password.mjs --remote    # for the deployed worker
```

It prompts twice with the input hidden, so the password never reaches your shell
history or `ps`. Re-run it any time to change the password — `login_validation` is
pinned to a single row (`CHECK (id = 1)`), so there can never be two valid passwords.

**One shared password, per-person audit trail.** Everyone signs in with the same
secret, but each sign-in writes name / roll number / college email / `login_time` into
`admin_login`, and every edit is logged with that identity. That is weaker than real
accounts — anyone who knows the password can type any name — but it makes an edit
traceable without building account management.

**The kill switch is immediate.** `login_validation.active = 0` blocks new logins *and*
is re-read on every authenticated request, so open sessions are cut off mid-use rather
than surviving until they expire:

```bash
npx wrangler d1 execute anvesha --remote --command "UPDATE login_validation SET active = 0 WHERE id = 1"
```

Other things worth knowing:

- The password is stored as **PBKDF2-SHA256, 100k iterations, with a salt** — never in
  the clear. D1 keeps 30 days of Time Travel snapshots, so a plaintext password would
  outlive any decision to change it. `set-admin-password.mjs --verify` proves
  `node:crypto` and the Worker's WebCrypto derive identical hashes.
- **Sessions last 12 hours**, enforced in the SQL `WHERE` clause, so there is no
  expiry sweep job to forget to run.
- `/api/admin/login` has its own rate-limit budget — guessing is the attack a shared
  password invites.
- The `@iisertvm.ac.in` rule is enforced twice: in the Worker, and as a `CHECK`
  constraint on `admin_login.collegemail`, so a raw SQL insert cannot bypass it.
- The panel is organised by a **task rail** — Edit merch, Add merch, Orders. Orders is
  present but disabled; nothing is behind it.
- **Adding** merch uploads a main image *and* any number of extra views through the
  panel (multipart → R2, **max 12 extras**, 5MB each). Extras land in `merch_images`
  and drive the storefront's view carousel. The cap is enforced server-side in
  `adminCreateMerch` and mirrored by `MAX_EXTRA` in the panel — change both together.
  **Editing** an existing item still cannot change its images; that goes through
  `wrangler r2 object put`.
- **Deleting** is permanent and takes the R2 objects with it. Past orders are
  unaffected — `orders.order_info` is a snapshot, so a receipt for a deleted item still
  shows the name and price paid. Rows are dropped before the objects: orphaned bytes in
  R2 are recoverable waste, whereas rows pointing at deleted images are not. The panel
  arms the button on first click and commits on the second, disarming after 5s.
- **Orders** is a sortable-width table of every order with the buyer's details. Those
  come from `payments.transaction_info`, which the *public* receipt route deliberately
  withholds — this is the authenticated view, so it joins them back in and flattens
  them rather than making the panel parse a JSON blob. The join is a LEFT JOIN: an
  unpaid order has no payment row but must still be listed.
- **Distribution** in the panel only starts and ends a counter *session* — the QR
  scanner itself lives on `/distribution#<session-id>`, a page with no admin login, so
  a volunteer's phone never needs the panel password. `/api/admin/scan` and
  `/api/admin/collect` still exist as thin auth wrappers around the same `scanOrder` /
  `collectItems` the counter page and the admin panel call, so what counts as
  "collectable" has exactly one definition. Decoding is done with `jsqr` rather than
  the native `BarcodeDetector`, which Safari and Firefox still lack — that is most of
  the phones a volunteer will be holding. Manual order-id entry is always available as
  a fallback.
- **Deleting an order** removes it and its payment row in one batch, so a half-deleted
  order cannot exist. It is confirmed through a modal, not an armed button — money
  changed hands for these, and the server log is the only trace left afterwards.
- `/admin/events` is an inert placeholder; there is no events table yet.
- New ids are `MER_` + 8 Crockford base32 characters (`newMerchId`, 40 bits), minted
  like `ORD_`/`PAY_` rather than counted. The old `MAX(id)+1` scheme had to read the
  table's own maximum and then race any other admin for it, so it needed a retry loop;
  a random id cannot collide. Deliberately shorter than an order id: an order id is a
  capability and must be unguessable, whereas a merch id is public catalogue data that
  only has to be unique.
- Image keys encode the carousel position: `merch/<id>_0.<ext>` is the primary and
  `merch/<id>_1`, `_2`… the extra views, so a key says where its picture belongs
  without consulting the database.
- `looksLikeMerchId` in `util.ts` is the single definition of a valid id, used by
  `parseCart` to vet client-supplied carts. Change the id shape and that regex must
  move with it — `test/cart.test.ts` pins both ends.
- The row is inserted *before* the image reaches R2. A row pointing at a missing image
  renders the category icon, which is indistinguishable from an item awaiting artwork;
  the reverse — an orphaned upload nothing references — costs storage forever.

## Live catalogue updates

Editing or adding merch pushes to every open storefront and admin tab immediately, over
a WebSocket at `/api/live`.

D1 has no change-data-capture, so this is not the database notifying anyone: the Worker
broadcasts *after* its own write commits. Which means **only writes that go through the
API are seen** — a `wrangler d1 execute "UPDATE merch ..."` changes nothing on screen
until a refresh.

Workers share no memory and each request may land in a different isolate, so the list of
connected browsers lives in a Durable Object (`CatalogueHub`, `src/hub.ts`), the one
thing Cloudflare guarantees is single-instance. One named instance — `'catalogue'` —
means every viewer worldwide lands on the same fan-out point.

Connections use the **hibernation** API (`ctx.acceptWebSocket`, not `server.accept()`).
The runtime evicts the object while nothing is happening and revives it on the next
broadcast, so a tab left open all day costs no compute duration. With a plain `accept()`
the object would stay resident and bill for the whole fest.

Other things worth knowing:

- The socket is **unauthenticated**, and the payload is only `{type, reason, at}` —
  never data. Clients re-fetch through whatever auth they already hold, so a listener
  learns nothing a plain `GET /api/merch` would not already tell them.
- The client reconnects with backoff (1s → 30s) and also re-fetches on tab focus, which
  closes the window where a socket died while the tab was hidden.
- Broadcasts are fire-and-forget via `ctx.waitUntil`. A hub that is unreachable logs and
  is ignored — the write already succeeded, and failing the admin's save over a failed
  notification would be worse than a stale tab.
- The DO binding, like `ratelimits`, is **not inherited** into named environments and is
  declared twice in `wrangler.jsonc`. The `migrations` entry uses `new_sqlite_classes`,
  which is the backend available on the Workers free plan.

### `POST /api/checkout`

```jsonc
// request — no prices, ever
{ "cart": [ { "merch_id": "MER-000001", "quantity": 2, "size": "M" },
            { "merch_id": "MER-000004", "quantity": 1 } ] }

// 201
{ "order_id": "ORD_4NVJDFJDP33Q290RDJ1HSSZHCC",
  "total_price_paise": 134700,
  "items": [ /* priced snapshot */ ],
  "razorpay": { "order_id": "order_...", "amount": 134700, "currency": "INR", "key_id": "rzp_..." } }
```

Rejections: `unknown_merch`, `size_required`, `size_not_allowed`, `bad_size`,
`bad_quantity`, `empty_cart`, `too_many_lines`.

### `POST /api/distribution/:session/scan`

```jsonc
{ "order": {
    "order_id", "total_price_paise", "payment_status", "collected_at", "created_at",
    // 'pending' | 'partial' | 'collected' — three states, not a boolean, because
    // collection happens one line at a time.
    "collection_status": "pending",
    // Each line snapshotted at checkout, plus the one field that changes after:
    // `collected`, 0 or 1, flipped by /collect below.
    "items": [{ "merch_id", "name", "quantity", "size", "unit_price_paise", "line_total_paise", "collected": 0 }],
  },
  "payment": { "razorpay_transaction_id", "transaction_info", "recorded_at" } }
```

No `verdict`/`collectable` summary field — with per-item collection there is no
single "can I hand this over" bit, so the caller reads `payment_status` and
`collection_status` directly.

### `POST /api/distribution/:session/lookup`

Body: `{ "roll_number": "IMS24101" }` — the counter's path when a student has no QR.
Case-insensitive: normalised to uppercase and matched `COLLATE NOCASE`.

```jsonc
{ "roll_number": "IMS24101",
  // A LIST, newest first: one student can order more than once, and picking for the
  // volunteer is how the wrong bag gets handed over. 404 when the roll has no orders.
  "orders": [{ "order_id", "items", "total_price_paise", "payment_status", "collection_status", "created_at" }] }
```

### `POST /api/distribution/:session/collect`

Body: `{ "order_id": "ORD_…", "lines"?: [0, 2] }` — indexes into `order.items`.
`lines` omitted collects everything still outstanding (what a "Mark all as collected"
button sends). A line already collected cannot be un-collected through this endpoint.

```jsonc
{ "ok": true, "order_id", "collection_status": "partial" | "collected", "items": [...] }
```

---

## Deploying for real

1. **Cloudflare**
   ```bash
   npx wrangler login
   npx wrangler d1 create anvesha          # paste database_id into wrangler.jsonc
   npx wrangler r2 bucket create anvesha-merch
   npm run db:remote                        # schema on the real D1
   ```
2. **Images** — upload one per row, key must match `merch.r2_path`:
   ```bash
   npx wrangler r2 object put anvesha-merch/merch/tee.jpg --file=./tee.jpg
   ```
3. **Secrets**
   ```bash
   npx wrangler secret put RAZORPAY_KEY_ID
   npx wrangler secret put RAZORPAY_KEY_SECRET
   npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
   ```
4. **Razorpay** — Dashboard → Webhooks → add
   `https://<worker>/api/webhooks/razorpay`, subscribe to `payment.captured` and
   `payment.failed`, and use the same secret as `RAZORPAY_WEBHOOK_SECRET`.
5. **Remove the stub.** Delete `RAZORPAY_STUB` from `wrangler.jsonc` vars, or deploy
   with `--env production` where it is already absent. The worker refuses to stub when
   `ENVIRONMENT=production`, but do not rely on that as the only guard.
6. `npx wrangler deploy --env production`

---

## Decisions worth knowing

**Money is integer paise, everywhere.** `499.00` in a float column cannot be
represented exactly and totals drift by a paisa at a time. Razorpay's API also takes
paise, so there is no conversion at the boundary. Divide by 100 only when rendering.

**The client never sends a price.** `POST /api/checkout` takes ids, quantities and
sizes; every rupee is read from the `merch` table. A cart posting
`{"price_paise": 1}` is charged the catalogue price — there is a test for exactly that.

**`orders.order_info` is a snapshot, not a reference.** Item name and unit price are
copied in at purchase time. Repricing an item later must not rewrite what someone
already paid.

**The order id is the collection capability.** `ORD_` + 128 bits of CSPRNG randomness,
Crockford base32 (no I/L/O/U, so it survives being read aloud). Holding the QR is the
proof of purchase, like a paper ticket — which is why the id must never be sequential.

**The QR carries the order id and nothing else** — not the transaction info you
sketched. Two reasons: `transaction_info` holds the payer's email and phone, which
should not sit in an image the student screenshots and shows to a volunteer; and the
counter endpoint reads every detail from the database anyway, so anything extra in
the QR is data the scanner would have to be told to distrust. Easy to change if you
want it — `qr_payload` in `getOrder`.

**Webhook signature verification is the whole trust boundary.** Without it anyone who
learns the URL could `POST` `payment.captured` and mark any order paid. The HMAC is
computed over the *raw* body — re-serialising parsed JSON changes key order and the
signature stops matching.

**Webhooks are idempotent.** Razorpay retries on any non-2xx and can deliver an event
twice. `payments.razorpay_transaction_id` is `UNIQUE` and the insert is
`INSERT OR IGNORE`; the order update is guarded on `payment_status = 'unpaid'`; both
run in one `batch()` so they commit together. An unknown order returns **200**, not
404 — a non-2xx would make Razorpay retry for days over something a retry cannot fix.

**Double collection is prevented in SQL, not in JavaScript.** The guard is
`WHERE collection_status = 0` inside the `UPDATE`. Two volunteers scanning the same QR
at the same moment would both pass a read-then-write check in application code and both
hand out a bag; here the second update matches zero rows.

**Images are URLs, not base64.** Inlining them in the catalogue JSON would inflate it
~33% and make the whole response uncacheable. Each image is fetched and cached
separately.

---

## Known gaps

- **No stock control.** Nothing stops overselling; add a `stock` column and decrement
  inside the checkout transaction when you need it.
- **A distribution session is shared, not per-volunteer.** Everyone at the counter
  works from one link, so a hand-over is attributable to the session — and to the admin
  who opened it, via `started_by_roll` — but not to the individual who scanned it.
- **No refund/cancel path.** `payment.failed` marks the order failed, but a refund
  webhook is not handled.
- **`GET /api/orders/:id` is a capability URL.** Anyone with the id sees the receipt.
  That is the intended model without student accounts, but it means the id belongs in
  a URL fragment or local storage, not in a query string that lands in server logs.
- **Images cannot be changed after creation.** Extra views can be added at creation
  time and land in `merch_images`, but there is no way to replace, reorder or delete an
  image from the panel afterwards — that still means `wrangler r2 object put` plus a
  manual row edit.
- **No images uploaded.** Nothing is in R2 yet, so `/api/merch/:id/image` 404s and the
  page falls back to a category icon. That is by design, not a bug — see `artHTML()`.
