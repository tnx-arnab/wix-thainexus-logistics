-- Thai Nexus Wix app - Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS stores (
    instance_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL DEFAULT '',
    site_id TEXT,
    meta_site_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_users (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_store_users_instance_id ON store_users (instance_id);

CREATE TABLE IF NOT EXISTS thai_nexus_config (
    instance_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_shipments (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_shipments_instance ON order_shipments (instance_id);

CREATE TABLE IF NOT EXISTS debug_logs (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    logged_at TEXT NOT NULL,
    data TEXT NOT NULL,
    kind TEXT GENERATED ALWAYS AS (json_extract(data, '$.kind')) STORED
);
CREATE INDEX IF NOT EXISTS idx_debug_logs_instance_time ON debug_logs (instance_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_kind_time ON debug_logs (kind, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_instance_kind ON debug_logs (instance_id, kind, logged_at DESC);

CREATE TABLE IF NOT EXISTS install_logs (
    id TEXT PRIMARY KEY,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    instance_id TEXT NOT NULL DEFAULT '__install__',
    route TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_install_logs_time ON install_logs (logged_at DESC);

CREATE TABLE IF NOT EXISTS product_flags (
    instance_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    is_document INTEGER NOT NULL DEFAULT 0,
    is_boxed INTEGER NOT NULL DEFAULT 0,
    shipping_eligible INTEGER NOT NULL DEFAULT 1,
    physical_override TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (instance_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_flags_instance ON product_flags (instance_id);
