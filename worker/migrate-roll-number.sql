-- ============================================================
-- One-time migration: orders.roll_number.
--
-- IMS + 5 digits, uppercase, NULL until the buyer's details are taken at payment. The
-- counter looks orders up by this when a student turns up with no QR to show.
--
-- Nullable with no backfill on purpose: orders placed before this existed never asked
-- for a roll number, and there is nothing to derive one from. Those orders stay
-- findable by QR and by order id; only roll lookup cannot see them.
--
-- Run once, by hand:
--   wrangler d1 execute anvesha --local  --file=./migrate-roll-number.sql
--   wrangler d1 execute anvesha --remote --file=./migrate-roll-number.sql
-- (or paste the body into --command if --file's import endpoint misbehaves, as it
-- has before on this account — see worker/README.md.)
-- ============================================================

ALTER TABLE orders ADD COLUMN roll_number TEXT;

-- COLLATE NOCASE so the counter's case-insensitive lookup can actually use the index.
-- Values are normalised to uppercase on the way in, so this is belt-and-braces — but
-- without the matching collation, `WHERE roll_number = ? COLLATE NOCASE` degrades to a
-- full table scan.
CREATE INDEX IF NOT EXISTS idx_orders_roll ON orders (roll_number COLLATE NOCASE);
