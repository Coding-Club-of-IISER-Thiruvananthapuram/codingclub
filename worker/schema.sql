-- ============================================================
-- Anvesha '26 merch backend — D1 schema
--   wrangler d1 execute anvesha --local --file=./schema.sql
-- ============================================================

-- ---------- catalogue ----------
CREATE TABLE IF NOT EXISTS merch (
  id            TEXT PRIMARY KEY,               -- MER_ + 8 random base32 chars, see newMerchId()
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL,
  designer      TEXT    NOT NULL,
  -- The storefront groups items into a tree, so the grouping has to live in the data.
  -- Free text rather than a lookup table: three categories do not need a join.
  category      TEXT    NOT NULL DEFAULT 'General',
  r2_path       TEXT    NOT NULL,               -- key inside the R2 bucket
  -- Money is stored in PAISE as an integer, never rupees as a float.
  -- 499.00 in a REAL column cannot be represented exactly and totals drift.
  -- Razorpay's API also takes paise, so this avoids a conversion at the boundary.
  price_paise   INTEGER NOT NULL CHECK (price_paise > 0),
  has_size      INTEGER NOT NULL DEFAULT 0 CHECK (has_size IN (0, 1)),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- extra product views ----------
-- merch.r2_path holds the primary image; anything beyond it lives here, which is what
-- lets the storefront's view carousel show Front/Back/Detail instead of one picture.
-- Kept as rows rather than a JSON column so an image can be added or reordered without
-- rewriting the merch row.
CREATE TABLE IF NOT EXISTS merch_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  merch_id   TEXT    NOT NULL REFERENCES merch (id),
  r2_path    TEXT    NOT NULL,
  label      TEXT    NOT NULL DEFAULT 'View',
  -- Display order. The primary image is always index 0; these follow.
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_merch_images ON merch_images (merch_id, sort);

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS orders (
  -- ORD_ + 128 bits of randomness. The id IS the collection capability: whoever
  -- holds the QR can collect, exactly like a paper ticket. That only holds if the
  -- id is unguessable, so it must never be sequential.
  order_id           TEXT PRIMARY KEY,
  -- Snapshot of the cart at purchase time: name and unit price are copied in, not
  -- referenced. A later price change must not rewrite what someone already paid.
  -- JSON: [{merch_id,name,quantity,size,unit_price_paise,line_total_paise,collected}].
  -- `collected` (0|1) lives per line, not just on the row below — collection happens
  -- one item at a time at the counter, so the row's own status alone cannot say which
  -- items are still outstanding.
  order_info         TEXT    NOT NULL,
  total_price_paise  INTEGER NOT NULL CHECK (total_price_paise > 0),
  payment_status     TEXT    NOT NULL DEFAULT 'unpaid'
                       CHECK (payment_status IN ('unpaid', 'paid', 'failed')),
  -- 'partial' is what makes this three states and not a boolean: an order with five
  -- items and two collected is neither "pending" nor "collected", and the counter UI
  -- needs to tell that apart from both to know which items are still owed.
  collection_status  TEXT    NOT NULL DEFAULT 'pending'
                       CHECK (collection_status IN ('pending', 'partial', 'collected')),
  razorpay_order_id  TEXT,                      -- order_xxx, from Razorpay
  -- IMS + 5 digits, uppercase. NULL until the buyer's details are taken at payment:
  -- the row is created at checkout, before anyone has been asked who they are. This is
  -- what the counter looks an order up by when a student has no QR to show.
  roll_number        TEXT,
  collected_at       TEXT,                      -- set only once collection_status reaches 'collected'
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

-- the webhook arrives knowing only Razorpay's order id, so this lookup must be indexed
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (payment_status, collection_status);

-- ---------- payments ----------
CREATE TABLE IF NOT EXISTS payments (
  payment_id              TEXT PRIMARY KEY,     -- PAY_ + 128 bits
  order_id                TEXT NOT NULL REFERENCES orders (order_id),
  -- UNIQUE is the idempotency guard. Razorpay retries webhooks on any non-2xx and
  -- can deliver the same event twice; this makes a duplicate insert fail loudly
  -- instead of silently double-recording a payment.
  -- NULL for failed payments — SQLite permits many NULLs in a UNIQUE column.
  razorpay_transaction_id TEXT UNIQUE,
  transaction_info        TEXT NOT NULL,        -- JSON: the Razorpay payment entity
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- UNIQUE, not a plain index. An order can have at most one successful payment: the
-- webhook only inserts on capture, and directPay only inserts when the order was not
-- already paid. Both guard the *order* row with a conditional UPDATE, which stops the
-- money being counted twice — but two concurrent requests would still have landed two
-- payment rows, and the LEFT JOIN in adminListOrders would then show that order twice.
-- With UNIQUE the loser's INSERT OR IGNORE becomes the no-op it was always meant to be.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);

-- adminListOrders is ORDER BY created_at DESC over the whole table. Unindexed that is
-- a full sort on every panel load, which is free at 60 rows and not at fest scale.
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

-- COLLATE NOCASE so the index is actually usable by the counter's lookup, which
-- compares case-insensitively. Values are normalised to uppercase on the way in, so
-- this is belt-and-braces against anything inserted by hand — but without the matching
-- collation here, `WHERE roll_number = ? COLLATE NOCASE` would fall back to a scan.
CREATE INDEX IF NOT EXISTS idx_orders_roll ON orders (roll_number COLLATE NOCASE);

-- ---------- webhook audit ----------
-- Every verified webhook lands here before anything is mutated. When a payment is
-- disputed months later, this is the only record of what Razorpay actually sent.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
