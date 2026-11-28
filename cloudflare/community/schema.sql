CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  article TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1))
);

CREATE INDEX IF NOT EXISTS comments_article_approved
ON comments (article, approved, id DESC);

CREATE TABLE IF NOT EXISTS likes (
  article TEXT NOT NULL,
  browser_id TEXT NOT NULL,
  PRIMARY KEY (article, browser_id)
) WITHOUT ROWID;
