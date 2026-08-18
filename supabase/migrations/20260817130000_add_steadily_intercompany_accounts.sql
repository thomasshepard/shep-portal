-- Steadily insurance intercompany pass-through — new accounts
--
-- The Steadily policy OB3-TN-26268933-01 ($191.50/mo) covers two dwellings
-- under two different owning entities (180-182 Virginia St → Virginia
-- Holdings LLC; 2000 E 5th St Chattanooga → Personal, per Airtable's
-- "Title In Name of" field), but is paid off the LeadsCompanion
-- (East Meadow Consulting LLC) Chase card — Virginia Holdings LLC is a new
-- entity this year and hasn't yet been given its own bank/card, so this is
-- the same "pay it, get repaid" intercompany pattern already used for the
-- Julie Jordan / Shepard Holdings LLC receivable (1200), just split two
-- ways instead of one. Split basis is 50/50 (Thomas's call, "best
-- judgement") — Steadily doesn't publish a per-dwelling premium breakdown,
-- and the two dwellings' insurable value isn't cleanly separable from
-- Airtable's parcel-level market-value fields. Trivially adjustable later
-- if a cleaner breakdown ever surfaces.

do $$
declare
  v_emc_id uuid;
  v_vhl_id uuid;
  v_personal_id uuid;
begin
  select id into v_emc_id from bk_entities where name = 'East Meadow Consulting LLC';
  select id into v_vhl_id from bk_entities where name = 'Virginia Holdings LLC';
  select id into v_personal_id from bk_entities where name = 'Personal';

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_emc_id, '1210', 'Due from Virginia Holdings LLC', 'asset')
  on conflict do nothing;

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_emc_id, '1220', 'Due from Personal', 'asset')
  on conflict do nothing;

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_vhl_id, '2100', 'Due to East Meadow Consulting LLC', 'liability')
  on conflict do nothing;

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_personal_id, '2100', 'Due to East Meadow Consulting LLC', 'liability')
  on conflict do nothing;
end $$;
