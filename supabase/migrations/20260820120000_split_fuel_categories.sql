-- Bookkeeping: split Happy Cuts' generic "Fuel & Vehicle" into two —
-- flagged directly by Thomas: most fuel purchases are non-ethanol gas for
-- mower/trimmer equipment, not vehicle gas, and lumping them together loses
-- real information (equipment fuel is a different tax/expense category than
-- vehicle fuel). Same "seed from real usage, don't wait for the gap to
-- surface live" lesson as the original expense-COA expansion — this is
-- that lesson applying a second time, one level more specific.
--
-- Leaves the original 5200 Fuel & Vehicle account in place rather than
-- deleting it (nothing to gain from the risk, and it's a harmless fallback
-- if a transaction genuinely can't be split either way) — just adding the
-- two more specific leaves alongside it.

insert into public.bk_accounts (entity_id, code, name, account_type)
select id, '5210', 'Fuel - Equipment (non-ethanol)', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5220', 'Fuel - Vehicle', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
on conflict (entity_id, code) do nothing;
