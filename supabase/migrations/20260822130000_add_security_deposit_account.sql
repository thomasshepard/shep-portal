-- Security deposits collected via Stripe often arrive bundled with first
-- month's rent in one combined charge/payout (e.g. a move-in invoice with
-- two line items) — the bank feed only sees one lump transaction. A
-- deposit isn't income; it's held on the tenant's behalf until it's
-- returned or applied, so it needs its own liability account rather than
-- being lumped into Rental Income with the rent portion. First real case:
-- 195 Kingwood Dr, Shepard Holdings LLC, $1,650 of a $3,432.18 Stripe
-- deposit dated 2026-06-29.

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from bk_entities where name = 'Shepard Holdings LLC';

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_entity_id, '2000', 'Security Deposits Held', 'liability')
  on conflict do nothing;
end $$;
