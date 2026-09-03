-- Adds a "Cash on Hand" asset account to Happy Cuts LLC (distinct from 1000
-- Cash, which is actually the bank-fed checking account) and backfills the
-- 8 in-person cash payments collected Mar-Aug 2026 that Happy Cuts' own
-- Schedule table shows as "Paid" but never made it into the ledger.
--
-- Each entry is tagged source_module='happy_cuts_cash_backfill' with
-- source_record_id = the Schedule record's Airtable id, so it's traceable
-- back to the source mow and can't be double-posted on re-run.

do $$
declare
  v_entity_id uuid;
  v_cash_id uuid;
  v_rev_id uuid;
  v_entry_id uuid;
  r record;
begin
  select id into v_entity_id from bk_entities where name = 'Happy Cuts LLC';
  if v_entity_id is null then
    raise exception 'Happy Cuts LLC entity not found';
  end if;

  insert into bk_accounts (entity_id, code, name, account_type)
  values (v_entity_id, '1050', 'Cash on Hand', 'asset')
  on conflict do nothing;

  select id into v_cash_id from bk_accounts where entity_id = v_entity_id and code = '1050';
  select id into v_rev_id from bk_accounts where entity_id = v_entity_id and code = '4000';

  for r in
    select * from (values
      ('2026-03-27'::date, 'Kaitlyn Conner',          20.00, 'receax9bTclCdm4Qh'),
      ('2026-04-02'::date, 'Chynna Legg',              20.00, 'recRQsGq3q9hSp1P7'),
      ('2026-04-17'::date, 'Dave and Sandi Shepard',   50.00, 'recC7RBAFN2buUYGD'),
      ('2026-04-24'::date, 'Sydney Bounds',            20.00, 'rec6ZpefB5kNqJGio'),
      ('2026-04-24'::date, 'John Phillis',             50.00, 'recIjLz1ax5UIMiCl'),
      ('2026-04-27'::date, 'Kyle Nash',                20.00, 'recHHteSORzZD7d1l'),
      ('2026-05-01'::date, 'Joseph Nolen',             40.00, 'reczx3xzOCn2aXToJ'),
      ('2026-08-14'::date, 'Sage',                     55.00, 'rectt8DmxlljwBOlj')
    ) as t(job_date, client_name, amount, mow_record_id)
  loop
    v_entry_id := null;

    if exists (
      select 1 from bk_journal_entries
      where source_module = 'happy_cuts_cash_backfill' and source_record_id = r.mow_record_id and status <> 'void'
    ) then
      continue;
    end if;

    insert into bk_journal_entries (entity_id, entry_date, memo, source, source_module, source_record_id)
    values (v_entity_id, r.job_date, 'Cash payment - ' || r.client_name, 'manual', 'happy_cuts_cash_backfill', r.mow_record_id)
    returning id into v_entry_id;

    if v_entry_id is not null then
      insert into bk_journal_lines (journal_entry_id, account_id, debit, credit) values
        (v_entry_id, v_cash_id, r.amount, 0),
        (v_entry_id, v_rev_id, 0, r.amount);
      perform bk_post_journal_entry(v_entry_id);
    end if;
  end loop;
end $$;
