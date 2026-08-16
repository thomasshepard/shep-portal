-- Bookkeeping: fix a real bug found live — recategorize_transaction voids
-- the old entry and reposts via the same postEntry() dedup path
-- (sourceModule/sourceRecordId), but the dedup unique index didn't exclude
-- voided entries. The old (now-void) row still occupied the
-- (source_module, source_record_id) slot, so the repost silently hit the
-- unique-violation "already posted" branch and did nothing — the entry
-- vanished off every report with no replacement. Confirmed directly
-- against a real transaction (Walmart purchase, voided with no repost).
--
-- Fix: the dedup index only needs to block a genuine duplicate of an
-- entry that's actually still posted — a void is explicitly "this posting
-- didn't happen," so it should free up the slot for a corrected repost.

drop index if exists public.bk_journal_entries_dual_write_dedup;
create unique index bk_journal_entries_dual_write_dedup
  on public.bk_journal_entries (source_module, source_record_id)
  where source_module is not null and status != 'void';
