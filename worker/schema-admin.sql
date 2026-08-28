-- ============================================================
-- Anvesha '26 — admin panel tables
--   wrangler d1 execute anvesha --local  --file=./schema-admin.sql
--   wrangler d1 execute anvesha --remote --file=./schema-admin.sql
-- ============================================================

-- ---------- the gate ----------
-- One row, always id = 1. The CHECK makes a second row impossible, so there can
-- never be two passwords disagreeing about who gets in.
CREATE TABLE IF NOT EXISTS login_validation (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  -- NOT the password. PBKDF2-SHA256 of it, with the salt beside it.
  -- A plaintext password here would be readable by anyone with a D1 console, a
  -- backup, or a Time Travel snapshot — and D1 keeps 30 days of those.
  password_hash  TEXT    NOT NULL,
  password_salt  TEXT    NOT NULL,
  -- Soft kill switch. Checked on login AND on every authenticated request, so
  -- flipping it to 0 locks out sessions that are already open, not just new ones.
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- who came in, and when ----------
-- One row per login. This is the audit trail: the password is shared, so this
-- table is the only thing that says *which person* made a change.
CREATE TABLE IF NOT EXISTS admin_login (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  roll_number   TEXT NOT NULL,
  -- Belt and braces: the worker validates this too, but the constraint means a
  -- non-college address cannot land here even through a raw SQL insert.
  collegemail   TEXT NOT NULL CHECK (collegemail LIKE '%@iisertvm.ac.in'),
  -- The session itself. Random and unguessable; holding it IS being logged in,
  -- so it is never sent anywhere but back to the admin who just authenticated.
  session_token TEXT UNIQUE,
  login_time    TEXT NOT NULL DEFAULT (datetime('now')),
  -- NULL means still signed in. Set on explicit logout.
  logout_time   TEXT
);

-- The auth check runs on every admin request, so it must not be a table scan.
CREATE INDEX IF NOT EXISTS idx_admin_session ON admin_login (session_token);
CREATE INDEX IF NOT EXISTS idx_admin_login_time ON admin_login (login_time);

-- ---------- distribution sessions ----------
-- A time-boxed pass for the merch counter. An admin opens one, copies the link, and
-- whoever holds that link can scan and hand over until the admin ends it. The session
-- id in the URL IS the credential, so it carries the same 128 bits as an order id and
-- every scan re-reads this row — revoking a volunteer's access has to be one click,
-- not a request to close a tab.
CREATE TABLE IF NOT EXISTS distributions (
  session_id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL DEFAULT (datetime('now')),
  -- NULL means still running. Set when an admin clicks END DISTRIBUTION.
  end_time   TEXT,
  -- Who opened it. Copied from the admin's session rather than joined to admin_login:
  -- the password is shared, so a session row can be logged out and its token cleared,
  -- and this has to stay readable afterwards. NULL on sessions started before this
  -- existed — there is nothing to derive them from.
  started_by_roll TEXT,
  started_by_name TEXT
);

-- Partial: the only query that is not by primary key is "is anything open right now",
-- and a full index would be almost entirely closed sessions the query never reads.
CREATE INDEX IF NOT EXISTS idx_distributions_open
  ON distributions (start_time) WHERE end_time IS NULL;
