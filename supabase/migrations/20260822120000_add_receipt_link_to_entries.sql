-- Bookkeeping: attach a scanned receipt (Documents module, Airtable) to an
-- already-categorized journal entry.
--
-- Soft link, TEXT — Airtable record ids aren't UUIDs, same precedent as
-- property_id already on this table (Phase 0). Matching/attaching happens
-- client-side in Bookkeeping.jsx (Documents' base id + Airtable PAT are
-- already browser-available VITE_* vars, same as src/lib/documentLinks.js's
-- existing pattern) — this column is just where the resulting link lives,
-- written via the bookkeeping edge function's attach_receipt/detach_receipt
-- actions since bk_journal_entries has zero RLS policies like every other
-- Bookkeeping table.

alter table public.bk_journal_entries
  add column if not exists receipt_document_id text;
