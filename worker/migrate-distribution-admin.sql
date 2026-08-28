-- ============================================================
-- One-time migration: distributions.started_by_roll / started_by_name.
--
-- Who opened a counter session. The session id in the link is the credential and
-- carries no identity of its own, so without this a distribution cannot be traced back
-- to the admin who handed the link out.
--
-- Copied from the admin's session at start time rather than joined to admin_login:
-- logging out clears session_token, and the record has to survive that.
--
-- Nullable with no backfill on purpose: sessions opened before this existed never
-- recorded who started them, and admin_login cannot be joined after the fact.
--
-- Run once, by hand:
--   wrangler d1 execute anvesha --local  --file=./migrate-distribution-admin.sql
--   wrangler d1 execute anvesha --remote --file=./migrate-distribution-admin.sql
-- (or paste the body into --command if --file's import endpoint misbehaves, as it
-- has before on this account — see worker/README.md.)
-- ============================================================

ALTER TABLE distributions ADD COLUMN started_by_roll TEXT;
ALTER TABLE distributions ADD COLUMN started_by_name TEXT;
