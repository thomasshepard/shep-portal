-- Bookkeeping: Maple Hill Coffee (sole proprietorship owned by Thomas
-- personally, reported on his Schedule C). Chart of accounts plus a nullable
-- bk_accounts.schedule_c_line column (set only on this entity's P&L accounts
-- for now; other entities stay null). The entity is created here with
-- entity_type 'single_member'; 20261126120000_maple_hill_sole_proprietorship.sql
-- changes it to 'sole_proprietorship'.
--
-- Insert-only and idempotent: entity is check-then-insert by name (same as
-- 20260816120000), and the account insert runs outside that check with
-- ON CONFLICT DO NOTHING so a partial earlier run is completed, never
-- overwritten. Codes 1000 (Cash) and 3100 (Owner's Draws) match what the
-- bookkeeping edge function's owner-draw flow looks up.

alter table public.bk_accounts add column if not exists schedule_c_line text;
comment on column public.bk_accounts.schedule_c_line is 'IRS Schedule C line this account rolls up to, e.g. line_1, line_27a; null = not on Schedule C (balance sheet accounts)';

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'Maple Hill Coffee';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Maple Hill Coffee', 'single_member')
      returning id into v_entity_id;
  end if;

  insert into public.bk_accounts (entity_id, code, name, account_type, subtype, schedule_c_line) values
    (v_entity_id, '1000', 'Cash',                    'asset', 'bank',      null),
    (v_entity_id, '1050', 'Cash on Hand',            'asset', 'cash',      null),
    (v_entity_id, '1200', 'Square Clearing',         'asset', 'clearing',  null),
    (v_entity_id, '2100', 'Sales Tax Payable',       'liability', null,     null),
    (v_entity_id, '3000', 'Owner''s Equity',         'equity', null,        null),
    (v_entity_id, '3100', 'Owner''s Draws',          'equity', null,        null),
    (v_entity_id, '4000', 'Drink Sales',             'income', null,        'line_1'),
    (v_entity_id, '4010', 'Tips',                    'income', null,        'line_1'),
    (v_entity_id, '4090', 'Refunds',                 'income', 'contra',    'line_2'),
    (v_entity_id, '5000', 'Coffee Beans',            'expense', 'cogs',     'line_4'),
    (v_entity_id, '5010', 'Milk and Dairy',          'expense', 'cogs',     'line_4'),
    (v_entity_id, '5020', 'Syrups and Ingredients',  'expense', 'cogs',     'line_4'),
    (v_entity_id, '5030', 'Cups, Lids and Packaging', 'expense', 'cogs',    'line_4'),
    (v_entity_id, '6000', 'Square Processing Fees',  'expense', null,       'line_10'),
    (v_entity_id, '6010', 'Small Equipment',         'expense', null,       'line_27a'),
    (v_entity_id, '6020', 'Software and Subscriptions', 'expense', null,    'line_27a'),
    (v_entity_id, '6030', 'Marketing and Advertising', 'expense', null,     'line_8'),
    (v_entity_id, '6040', 'Licenses and Permits',    'expense', null,       'line_23'),
    (v_entity_id, '6050', 'Supplies',                'expense', null,       'line_22'),
    (v_entity_id, '6090', 'Other Expense',           'expense', null,       'line_27a')
  on conflict (entity_id, code) do nothing;
end $$;