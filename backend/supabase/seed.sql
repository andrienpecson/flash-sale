-- Seeds one product and one flash sale.
-- Fixed UUIDs so ACTIVE_SALE_ID stays stable across re-seeds; the sale id below
-- is what you set as ACTIVE_SALE_ID in backend/.env.

insert into products (id, name, description)
values (
  '00000000-0000-0000-0000-000000000001',
  'Limited Edition Widget',
  'A one-of-a-kind collectible, available only during the flash sale.'
)
on conflict (id) do nothing;

insert into flash_sales (id, product_id, start_time, end_time, total_stock)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  now() - interval '1 minute', -- active immediately for local testing
  now() + interval '1 day',
  100
)
on conflict (id) do nothing;
