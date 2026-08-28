-- ============================================================
-- One-time migration: orders.collection_status from a 0/1 boolean to a three-state
-- 'pending' | 'partial' | 'collected' TEXT column, and a per-item `collected` flag
-- backfilled into every line already sitting in order_info.
--
-- A column swap, not a table rebuild (CREATE new + DROP old + RENAME): `orders` is
-- the parent of an FK from `payments`, and SQLite refuses to drop a table another
-- table still references — confirmed by testing the rebuild against a live FK row
-- before writing this file. ADD/DROP/RENAME COLUMN never drops the table itself, so
-- the FK is never in question.
--
-- Run once, by hand:
--   wrangler d1 execute anvesha --local  --file=./migrate-collection-status.sql
--   wrangler d1 execute anvesha --remote --file=./migrate-collection-status.sql
-- (or paste the body into --command if --file's import endpoint misbehaves, as it
-- has before on this account — see worker/README.md.)
-- ============================================================

-- Blocks DROP COLUMN below otherwise: an index over a column being dropped has to go
-- first, then comes back in the column's new name at the end.
DROP INDEX IF EXISTS idx_orders_status;

ALTER TABLE orders ADD COLUMN collection_status_new TEXT NOT NULL DEFAULT 'pending'
  CHECK (collection_status_new IN ('pending', 'partial', 'collected'));

-- 1 -> 'collected', everything else -> 'pending'. There is no way to have been
-- 'partial' before this feature existed, so those are the only two states to map.
UPDATE orders SET collection_status_new = CASE collection_status WHEN 1 THEN 'collected' ELSE 'pending' END;

-- Every line gets the flag it never had. A fully collected order gets every line
-- marked collected; everything else starts at 0 — there is no way to know, from the
-- old whole-order flag alone, which specific lines of a never-collected order would
-- eventually have been struck off, so a still-pending order simply starts the
-- checklist from scratch under the new feature.
UPDATE orders SET order_info = (
  SELECT json_group_array(json_set(value, '$.collected', CASE WHEN collection_status = 1 THEN 1 ELSE 0 END))
    FROM json_each(order_info)
);

ALTER TABLE orders DROP COLUMN collection_status;
ALTER TABLE orders RENAME COLUMN collection_status_new TO collection_status;

CREATE INDEX idx_orders_status ON orders (payment_status, collection_status);
