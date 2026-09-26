-- Per-box raw Thai Nexus quotes captured at checkout, before shop pricing rules.

CREATE TABLE IF NOT EXISTS checkout_box_quotes (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checkout_box_quotes_instance
    ON checkout_box_quotes (instance_id, created_at DESC);
