PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS interpreters (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  languages   TEXT NOT NULL,
  domains     TEXT NOT NULL,
  certified   INTEGER NOT NULL DEFAULT 0,
  area        TEXT NOT NULL,
  reliability REAL NOT NULL DEFAULT 0.9,
  available   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS requests (
  id             TEXT PRIMARY KEY,
  token          TEXT NOT NULL UNIQUE,
  created_at     REAL NOT NULL,
  status         TEXT NOT NULL,
  raw_text       TEXT NOT NULL,
  requester_name TEXT NOT NULL DEFAULT '',
  appointment    TEXT NOT NULL,
  wave           INTEGER NOT NULL DEFAULT 0,
  assigned_id    TEXT REFERENCES interpreters(id),
  briefing       TEXT,
  confirmation   TEXT,
  summary        TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  interpreter_id TEXT NOT NULL REFERENCES interpreters(id),
  role           TEXT NOT NULL CHECK (role IN ('primary', 'standby')),
  status         TEXT NOT NULL CHECK (status IN
                   ('pending', 'accepted', 'declined', 'expired', 'withdrawn', 'cancelled', 'standby')),
  wave           INTEGER NOT NULL,
  sent_at        REAL NOT NULL,
  expires_at     REAL NOT NULL,
  responded_at   REAL,
  travel_min     INTEGER NOT NULL,
  reasons        TEXT NOT NULL,
  UNIQUE (request_id, interpreter_id)
);
CREATE INDEX IF NOT EXISTS offers_open ON offers (status, expires_at);
CREATE INDEX IF NOT EXISTS offers_interpreter ON offers (interpreter_id, status);

-- append-only audit log; the UI timeline and SSE stream read from here
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  ts         REAL NOT NULL,
  kind       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  payload    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_request ON events (request_id, id);

CREATE TABLE IF NOT EXISTS arrivals (
  request_id     TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  interpreter_id TEXT NOT NULL REFERENCES interpreters(id),
  eta            REAL NOT NULL,
  updated_at     REAL NOT NULL,
  arrived        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS escalations (
  request_id      TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  created_at      REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'acknowledged')),
  acknowledged_at REAL,
  note            TEXT NOT NULL DEFAULT ''
);

-- Recover coordinator work created before the queue existed, preserving acknowledgments.
INSERT OR IGNORE INTO escalations(request_id, created_at)
SELECT r.id, COALESCE((SELECT MAX(e.ts) FROM events e WHERE e.request_id=r.id AND e.kind='no_match'), r.created_at)
FROM requests r WHERE r.status='escalated';

-- Telegram front door (optional). Requesters are linked per request, interpreters per chat.
CREATE TABLE IF NOT EXISTS tg_chats (
  chat_id        INTEGER PRIMARY KEY,
  interpreter_id TEXT UNIQUE REFERENCES interpreters(id),
  awaiting       TEXT
);
CREATE TABLE IF NOT EXISTS tg_requests (
  request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  chat_id    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tg_cursor (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  last_event INTEGER NOT NULL
);
