-- Flash sale schema.
-- products + flash_sales are the source of truth for the sale/product definition.
-- orders is the durable purchase record AND the one-item-per-user backstop.
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists flash_sales (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id),
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  total_stock integer not null check (total_stock >= 0),
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references flash_sales (id),
  user_email  text not null,
  created_at  timestamptz not null default now(),
  unique (sale_id, user_email) -- durable one-item-per-user guarantee
);

create index if not exists orders_sale_id_idx on orders (sale_id);