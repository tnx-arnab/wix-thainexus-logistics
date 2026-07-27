-- Thai Nexus Wix app - run in a NEW Supabase project (do not reuse BC/Shopify DB)

-- Wix OAuth tokens (tenant key = instance_id)
create table if not exists stores (
    instance_id text primary key,
    access_token text not null,
    refresh_token text,
    scope text not null default '',
    site_id text,
    meta_site_id text,
    updated_at timestamptz not null default now()
);

create table if not exists store_users (
    id text primary key,
    instance_id text not null,
    is_admin boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_store_users_instance_id on store_users (instance_id);

-- Merchant config: shipper, boxes, fees, encrypted API token
create table if not exists thai_nexus_config (
    instance_id text primary key,
    data jsonb not null default '{}',
    updated_at timestamptz not null default now()
);

-- Shipment refs after order webhook (order_id is text for Wix GUIDs)
create table if not exists order_shipments (
    id text primary key,
    instance_id text not null,
    order_id text not null,
    data jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_order_shipments_instance on order_shipments (instance_id);

-- Checkout rate debug traces
create table if not exists debug_logs (
    id text primary key,
    instance_id text not null,
    logged_at timestamptz not null,
    data jsonb not null
);

create index if not exists idx_debug_logs_instance_time on debug_logs (instance_id, logged_at desc);

-- OAuth / install tracing
create table if not exists install_logs (
    id text primary key,
    logged_at timestamptz not null default now(),
    instance_id text not null default '__install__',
    route text not null,
    ok boolean not null default false,
    message text,
    data jsonb not null default '{}'
);

create index if not exists idx_install_logs_time on install_logs (logged_at desc);

-- Per-product flags (document / boxed / shipping eligible)
create table if not exists product_flags (
    instance_id text not null,
    product_id text not null,
    is_document boolean not null default false,
    is_boxed boolean not null default false,
    shipping_eligible boolean not null default true,
    physical_override jsonb,
    updated_at timestamptz not null default now(),
    primary key (instance_id, product_id)
);

create index if not exists idx_product_flags_instance on product_flags (instance_id);

alter table stores enable row level security;
alter table store_users enable row level security;
alter table thai_nexus_config enable row level security;
alter table order_shipments enable row level security;
alter table debug_logs enable row level security;
alter table install_logs enable row level security;
alter table product_flags enable row level security;
