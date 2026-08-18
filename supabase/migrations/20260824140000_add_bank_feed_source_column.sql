-- Bookkeeping: CSV bank statement import. SimpleFin has a hard 90-day
-- lookback cap regardless of connection age, so real history before that
-- window needs backfilling from the bank's own CSV export. Informational
-- column only — lets a debug query or the UI tell which channel produced a
-- row; not load-bearing for correctness (dedup logic lives in the edge
-- function, not a constraint on this column).

alter table public.bk_raw_transactions
  add column if not exists source text not null default 'simplefin'
    check (source in ('simplefin', 'csv_import'));
