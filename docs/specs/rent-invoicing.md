# Rent Invoicing (Stripe): build spec for Gemini

Nov 22, 2026 · Thomas

Build spec for automatic monthly rent invoices in Shep Portal, sent through Stripe. Gemini (Antigravity CLI) writes the code. Claude Code writes prompts, reviews, runs build and lint, and commits. Thomas merges the pull request.

Original backlog item: Backlog base, record `rectl8goiDl4Ow5UQ`, "Lease Invoicing Automation (Stripe)". This spec also folds in the backlog idea "Stripe payment notifications" as phase 2.

## 0. Decisions so far

Thomas answered the three scope questions on a call on Nov 22.

| Question | Answer | What the spec does |
|---|---|---|
| How tenants pay | They get an emailed Stripe invoice and pay from it. No autopay. | Phase 1 sends emailed Stripe invoices. Autopay is parked in "Later". |
| When invoices go out | About 10 days before the due date, every month. | Default lead time is 10 days, changeable per billing row. |
| Late fees | Yes, after a grace period. Terms come from each lease and can differ by property. | New late fee fields on each Rental Unit, filled from the signed lease (table in section 4). Phase 2 drafts the late fee; Thomas taps to send it. |
| Which Stripe account | East Meadow Properties takes rent for every property except 195 Kingwood Dr. 195 Kingwood is owned by Shepard Holdings and is paid into the Shepard Holdings Stripe account. | Each property names its Stripe account. The code picks the right account per invoice. |
| Stripe keys and webhooks | Build first. Thomas gets keys and webhooks from Stripe later. | The code reads keys and webhook secrets by name (section 8). Nothing Stripe-side is needed until testing. |

Still open (none of these block the build):

1. **Approval needed: two new Supabase secrets** for webhook signing (section 8). The API key names already exist in the code; the webhook secret names are new.
2. Should late fees ever go out on their own, or always wait for your tap? Spec default: always wait for the tap.
3. Card payments: today almost every rent invoice is bank only (ACH). Spec default: ACH only, card off unless you turn it on for a billing row.
4. Lease data to fix before the first live run (section 4c).

## 1. Goal

Stop making rent invoices by hand in the Stripe dashboard every month. The portal works out who owes what and when, shows Thomas a short list of invoices that are due to go out, and sends them through the right Stripe account with one tap. Payment status flows back into the portal on its own, and Thomas gets a heads-up when a payment fails, is refunded or disputed, or a tenant is past the grace period.

Three ways rent can be split, all handled the same way (section 3):

1. **Full amount once a month.** One person pays the whole rent on one day. Most leases today.
2. **Each person pays a share.** A couple each pays half, or roommates pay set amounts, each with their own invoice.
3. **Two payments a month.** One person pays half on one day and half on another (a payment plan). 589 Dyer had this with John Phillips in June 2026.

Done means: for one real month, every active lease gets the right invoice, from the right Stripe account, about 10 days before it is due, with no Stripe dashboard work, and the portal shows each invoice as sent, processing, paid or failed without anyone touching Airtable by hand.

## 2. How rent is billed today (checked Nov 22)

- Rent invoices are one-off Stripe invoices made by hand: "send invoice" by email, mostly bank only (ACH), created 7 to 14 days before the due date. Examples in the East Meadow account: 182 Virginia Nov rent ($1,100, due Nov 27), 243 W Main Nov rent ($1,225), 180 Virginia move-in ($2,100). No Stripe subscriptions are in use (one old subscription from 2024 is cancelled).
- Airtable (Property Management base `appeuX9BHNgVXxdYZ`) already has most of the pieces:
  - **Lease Agreements**: Rent Amount, Pet Rent, Other Fees to Tenant, Terms (a select like "Every 24th of the Month"), First Invoice Date, Months on Lease, and a formula for Next Rent Due Date.
  - **Lease Invoice Line Item**: one row per monthly charge per lease (for example "Rent 182 Virginia St Cookeville", $1,100).
  - **Lease Invoice**: built for Stripe (Stripe Invoice ID, Status, Amount Due, Amount Paid, Stripe Account, Due Date, Paid Date, Failure Reason, Hosted URL, PDF URL, Last Webhook Event). Only 5 old test rows from Feb 2025. Unused today, so it is safe to start writing to it.
  - **Tenants**: Stripe Customer ID, Stripe Account, Stripe Sync Status.
  - **Property**: Stripe Account (a select: East Meadow Properties, Shepard Holdings, Virginia Holdings, Happy Cuts). Empty on every property today.
- Portal code (repo `thomasshepard/shep-portal`):
  - `supabase/functions/_shared/stripeAccounts.ts` already maps four accounts to secrets: `STRIPE_EAST_MEADOW_KEY`, `STRIPE_SHEPARD_HOLDINGS_KEY`, `STRIPE_VIRGINIA_HOLDINGS_KEY`, `STRIPE_HAPPY_CUTS_KEY`. Only the Happy Cuts key is set today.
  - `create-stripe-invoice` and `stripe-webhook` are Happy Cuts only and hard-coded to that account. Leave them alone; rent gets its own functions.
  - `PropertyDetail.jsx` already shows a "Lease Invoices (Stripe)" table read from the Lease Invoice table, so new rows show up there for free.
  - Bookkeeping (Supabase `bk_*` ledger) gets money from the bank feed, so rent already reaches the books when Stripe pays out. Posting rent by invoice is left for later.

## 3. Data model (proposals; Thomas makes Airtable changes himself)

All in the Property Management base. Nothing here is created by code or by an agent.

### a) New table: Rent Schedule

One row per payer per payment per month. This is the one place that says who pays what and when. A lease with one payer and one due day has one row. A couple splitting rent has two rows. A payment plan has two rows with different due days.

| Field name (exact) | Type | Notes |
|---|---|---|
| Name | Single line text (primary) | Like "182 Virginia · Tristan · 24th" |
| Lease | Link to Lease Agreements | Required |
| Payer | Link to Tenants | Required. The person who gets this invoice. Each payer needs their own Tenants record with an email |
| Share Type | Single select | Full, Percent, Fixed |
| Share Value | Number (2 decimals) | Percent (like 50) or dollars (like 550). Ignored when Full |
| Due Day | Number (integer) | 1 to 31. Past the month's last day means the last day |
| Send Days Before | Number (integer) | Default 10 |
| Payment Methods | Multiple select | ACH, Card. Default ACH |
| Active | Checkbox | Only active rows are billed |
| Notes | Long text | Optional |

Examples:

| Case | Rows |
|---|---|
| Full monthly (182 Virginia) | 1 row: Payer Tristan, Full, Due Day 24 |
| Couple splits | 2 rows: Payer A, Percent 50, Due Day 1; Payer B, Percent 50, Due Day 1 |
| Payment plan | 2 rows: same Payer, Fixed $475, Due Day 1; Fixed $475, Due Day 15 |

How much each invoice is for: the lease's monthly total is the sum of its Lease Invoice Line Item rows (rent, pet rent, shed rent and so on). Full bills every line as its own invoice line. Percent and Fixed bill one line: "Your share of {Month} rent, {address} ({share} of ${total})". Rounding goes to the last row of that lease and month, so the shares always add up to the total. If a lease's shares don't add up to its total, the preview shows a warning and the rows can't be sent.

Fee note: splitting one rent into two ACH invoices can cost more. ACH is 0.8% capped at $5, so $1,100 in one invoice costs $5.00, but two $550 invoices cost $4.40 each, $8.80 in all.

### b) Late fee fields on Rental Units (Thomas's ask)

Every lease read so far uses the same shape: a 5-day grace period that counts the due date as day 1, then a flat fee capped at 10% of the rent past due. The fields match that shape.

| Field name (exact) | Type | Notes |
|---|---|---|
| Grace Period Days | Number (integer) | 5 in every current lease. Day 1 is the due date itself |
| Late Fee Amount | Currency | Flat fee per late payment. $55 in every current lease |
| Late Fee Cap Percent | Percent | Fee can't be more than this share of the rent past due. 10% in every current lease |
| Returned Payment Fee | Currency | Fee for a bounced or failed payment. $25 to $55 depending on the lease |
| Late Fee Source | Single line text | Which lease the numbers came from, like "Lease Nov 2026, section 3" |

Rent Schedule also gets one field for payment plans, because the John Phillips addendum had its own fee per installment:

| Field name (exact) | Type | Notes |
|---|---|---|
| Late Fee Override | Currency | Optional. Used instead of the unit's Late Fee Amount for this billing row ($45 in the Phillips addendum). Each installment has its own grace period and its own fee |

Late fee math: fee = the smaller of Late Fee Amount (or the row's override) and Late Fee Cap Percent times the amount still unpaid. A payment counts as late after day 5 (rent due on the 23rd is late after the 27th). The lease moves the last grace day to the next business day when it lands on a Sunday or a holiday; the code handles Sundays, and Thomas skips the draft on a holiday since he taps to send anyway.

These come from the signed lease. When a unit gets a new lease with different terms, update the unit. Section 4 has the values found in the current leases for Thomas to confirm.

### c) New fields on existing tables

| Table | Field | Type | Why |
|---|---|---|---|
| Lease Invoice | Rent Schedule | Link to Rent Schedule | Which billing row made it |
| Lease Invoice | Run Key | Single line text | `{scheduleRowId}:{dueDate}`. Stops the same invoice being made twice |
| Lease Invoice | Kind | Single select | Rent, Late fee, Move-in, Other |
| Lease Invoice | Property | Link to Property | For filters and the Stripe account |
| Lease Invoice | Status (existing) | Add choices | `processing`, `failed`, `refunded`, `disputed` next to the existing ones |
| Lease Agreements | Billing On | Checkbox | Safety switch. Leases with this off are never billed |
| Property | Stripe Account (existing) | Fill it in | East Meadow Properties for everything except 195 Kingwood Dr = Shepard Holdings |

Field IDs: once these fields exist, Claude reads the new table and field IDs from Airtable and adds them to this spec before Gemini starts (same as the Tenant Log). Writes use field IDs with `typecast: true`; reads come back keyed by field name.

### d) Airtable IDs (added Nov 25, 2026)

Created in the Property Management base `appeuX9BHNgVXxdYZ` on Nov 25 with Thomas's OK. Writes use these field IDs with `typecast: true`; reads come back keyed by field name.

**Rent Schedule** `tbl2HYyA5a9eiRWoc`

| Field | ID |
|---|---|
| Name (primary) | `fldCchUBD46JIoiJf` |
| Lease (link to Lease Agreements) | `fld9ZrvE46g5vp2jZ` |
| Payer (link to Tenants) | `fldefGQILK0Die4yY` |
| Share Type (Full, Percent, Fixed) | `fldEhshKsmD1Wimdw` |
| Share Value | `fldaO2tJZIpzV10en` |
| Due Day | `fldjVuk292Yj53uh9` |
| Send Days Before (blank means 10) | `fldngFdrV3GusRtyL` |
| Payment Methods (ACH, Card; blank means ACH) | `fldacMIhIkFZedDoC` |
| Active | `flde6r1vycjzbwEH8` |
| Late Fee Override | `fldaHNwAmAi2QOehv` |
| Notes | `fldFuFByPcGSbvBBm` |

Inverse links Airtable made: Lease Agreements `fldEkRqqHTqgaFyNe`, Tenants `fldDcvQQPLCOmpavR`, Lease Invoice side of Rent Schedule `fldgdMP9wzGV7hOtV`.

**Rental Units** `tbl2tk7EjtR2k65WR`

| Field | ID |
|---|---|
| Grace Period Days | `fld9s3P0tot3hooPw` |
| Late Fee Amount | `fld65NT5MtvvnOHDz` |
| Late Fee Cap Percent | `fldWfbCqx4w0CmyD2` |
| Returned Payment Fee | `fldxDWhIcFAJT2nOG` |
| Late Fee Source | `fldhM8024V4CrScyh` |

**Lease Invoice** `tblvBW1tHvXrjL6Go`

| Field | ID |
|---|---|
| Rent Schedule (link) | `fldx6Lq5ARw3OS5Z0` |
| Run Key | `fldnzOt8jrwPcd4gc` |
| Kind (Rent, Late fee, Move-in, Other) | `fldZXTTcXtJwSmpLz` |
| Property (link) | `fldzZKeRI8XIjbpkh` (inverse on Property: `fldy2AVbchePVpBTa`) |
| Status (existing) | `fldW5SacGt9x4mUrR` |
| Stripe Invoice ID (existing, primary) | `fldBRwpxQ905vEbdg` |
| Amount Due / Amount Paid | `fldcVz4DyUfUujnrg` / `fldx3D490VFEBBpNJ` |
| Stripe Account | `fldGkXWpXyCRQOlrj` |
| Due Date / Issued Date / Paid Date | `fldMA9ch1JzEuqLqP` / `fldOCvMlVFOTO8DxI` / `fldnV7jVqdzXicmiJ` |
| Lease Agreements / Tenant (links) | `fldEBid6WLOvoMOSB` / `fldN9rLoWUWUhGCqb` |
| Failure Reason | `fldcOi0SV4N9jQM0G` |
| Stripe Hosted URL / Stripe PDF URL | `fldn0VcBZoLhd20Y6` / `fldB01ODjcCmzntck` |
| Last Webhook Event / Last Webhook At | `fld9A683yWSwm940n` / `fldaDMQ85UfDgPPOR` |
| Notes | `fld3nraQUxMbbGY71` |

Status today has: open, paid, draft, uncollectible, void, Past Due. The Airtable tool can't add select choices, so `processing`, `failed`, `refunded` and `disputed` are not there yet. Writing them with `typecast: true` creates them on first use, or Thomas can add them by hand.

**Lease Agreements** `tblr00YD7yxgirqtN`: Billing On `fld66ZIecDjVWlfyQ` (new). Existing: Rent Amount `fld9xGOLV3FsXrcPe`, Pet Rent `fldIAtbpmAs9NHJyP`, Other Fees to Tenant `fld6I4cd9IeDz0wlu`, Status `fldv2W0TzdzTQzk8l`, Start Date `fldsRSlggXcKfDaNQ`, End Date `fldUsAyB9gHaJs2OV`, Property (links to Rental Units) `fldve9AoTrd4KjNP7`, Tenant Management (links to Tenants) `fldZJd4JrQljxTPPK`, Lease Invoice Line Item `fld7hlv4ShUrsuBlq`.

**Lease Invoice Line Item** `tblRW3CsmQC6zI2RU`: Name `fldhYcHbiwimVhtAq`, Lease Agreements `fldpP6E1g1s4d0izd`, Quantity `fldw3ZfPogHvIjO8l`, Price per Item `fldmQSNjKhaiUrPdK`, Line Item Total `fldF1PiFJC9my23dt`.

**Tenants** `tblcUBwyCHhyYzUEC`: Name `fldSMhllF2wLys9ld`, Email `fldSnATjlaFba2wYb`, Stripe Customer ID `fldhczpBALyYrcrdl`.

**Rental Units** link to Property: `fldnGYY4EMFwXnXrs`. **Property** `tblsFZ6bhUwsnPLaj`: Address `fld3i5tSFyp1aOYqj`, Stripe Account `fldQuEuBJjjCnzQIC`.

Data note (Nov 24): the 180 Virginia and 589 Dyer leases now exist in Airtable but have no line items yet, so their monthly total reads $0 until line items are added.

## 4. Lease terms found (for Thomas to confirm)

Read from the signed leases in Drive on Nov 22. Every lease has a 5-day grace period, a $55 late fee and a 10% cap, which matches what Thomas remembered. Please confirm before these go into the units.

| Unit | Tenants | Rent in lease | Due day | Grace | Late fee | Returned payment fee | Note |
|---|---|---|---|---|---|---|---|
| 180 Virginia St | Elia Miguel | $1,050 | 23rd | 5 days | $55, 10% cap | $50 | No lease record in Airtable yet |
| 182 Virginia St | Tristan Smith, Katelyn Holder | $1,100 | 24th | 5 days | $55, 10% cap | $50 | Matches Airtable |
| 243 W Main St | Patel family | $1,150 (2025 lease) | Unclear: section 3A says the 1st, 3D says "first (26st)" | 5 days | $55, 10% cap | $55 | Lease ended Jun 30, 2026, now month to month. Stripe bills $1,225 on the 6th |
| 195 Kingwood Dr | Dillan Bouldin, Shelby Beattie | $1,650 plus $35 dog | 19th | 5 days | $55, 10% cap | $25 | Shepard Holdings account |
| 589 Dyer Cemetery Rd | Harley Brooks, Trenton Langford | Not found | Not found | Not found | Not found | Not found | Signed lease not in Drive. Maybe in DocuSeal or email |

Earlier payment plan at 589 Dyer (John Phillips addendum, June 2026): $950 rent in two $475 payments, due the 19th and the 1st, each with its own 5-day grace period and a $45 late fee per installment. The copy in Drive has blank signature lines.

### c) Data to fix before the first run

These don't block building, only the first live run.

1. **180 Virginia** (Elia, moved in Nov 23) and **589 Dyer** (Harley and Trenton, moved in Nov 13) have no current lease record in Airtable. Add them, with line items.
2. **243 W Main**: Airtable says $1,225 rent but its line item says $1,150, and Stripe bills $1,225 due the 6th. Pick the right amount and due day.
3. **195 Kingwood** has no line items, so its monthly total reads $0. Add rent $1,650 and pet rent $35.
4. **Stripe customer IDs**: in Airtable, the Patel and Tristan tenant records both hold the same ID, and neither matches the customer Stripe actually bills. Put in the real IDs (or clear them and let the code look them up).
5. **Old lease**: Emily Schulke's 2000 E 5th lease ended Apr 30 but isn't Closed.
6. **Unit status**: 180 Virginia, 195 Kingwood and 589 Dyer show Vacant but are rented.
7. **180 Virginia's lease names Virginia Holdings LLC as landlord**, but its rent goes to the East Meadow Stripe account. Fine if that's intended; just flagging it.
8. **Lease template**: the v2 template still has the "first (26st) day" typo in section 3D.

## 5. How invoices are made and sent

### a) The preview (no writes)

A new edge function `rent-invoices`, admin only (`requireAdmin`), with action `preview`:

1. Read active Rent Schedule rows whose lease has Billing On checked and has not ended.
2. For each row, work out the next due date from Due Day in America/Chicago time. If today is on or after (due date minus Send Days Before) and no Lease Invoice exists with that Run Key (and status other than void), it goes on the list.
3. Work out the amount from the line items and the share. Look up the payer's email and Stripe customer, and the Stripe account from the lease's unit's property.
4. Return the list with any problems on each row: no email, no Stripe account on the property, shares don't add up, payer has no Tenants record.

### b) Sending (one tap)

Action `send`, given a list of Run Keys from the preview. For each, in this order:

1. Re-check the row (amount, account, no existing invoice with that Run Key). Skip and report if anything changed.
2. Create the Lease Invoice row in Airtable first: Status `draft`, Run Key, Kind Rent, Amount Due, Due Date, links. If Airtable fails, stop before touching Stripe (same rule as the Happy Cuts function).
3. Get the Stripe client for that property's account (`getStripeClientForAccount`). Find the payer's Stripe customer in that account, or create one and save its ID on the Tenants record. A customer ID is only good in the account that made it.
4. Create the invoice: `collection_method: 'send_invoice'`, `due_date` = due date at noon Central, `auto_advance: true`, `pending_invoice_items_behavior: 'exclude'`, `payment_settings.payment_method_types` from the row (`us_bank_account`, plus `card` only if allowed), metadata `{ source: 'shep_portal_rent', lease_invoice_id, schedule_id, lease_id, property, run_key }`. Send an `Idempotency-Key` of `rent-{runKey}` on create calls.
5. Add invoice items with `invoice: <id>` (so stray pending items never get swept in).
6. Finalize, then `sendInvoice` so Stripe emails the tenant the pay link.
7. Write back Stripe Invoice ID, Hosted URL, PDF URL, Issued Date, Status `open`.

Each invoice is its own try. One failure doesn't stop the rest; the result lists what went out and what didn't, with the reason.

### c) Status back into the portal

New edge function `stripe-rent-webhook`, deployed with `--no-verify-jwt`. One function for both accounts: the endpoint URL carries `?account=east_meadow` or `?account=shepard_holdings`, and each account has its own signing secret. Only invoices with `metadata.source = 'shep_portal_rent'` are touched; everything else is ignored (so hand-made invoices and Happy Cuts are untouched).

| Stripe event | Lease Invoice update |
|---|---|
| `invoice.sent` | Status `open` |
| `payment_intent.processing` (ACH started) | Status `processing` |
| `invoice.paid` | Status `paid`, Amount Paid, Paid Date |
| `invoice.payment_failed` | Status `failed`, Failure Reason |
| `invoice.voided` | Status `void` |
| `invoice.marked_uncollectible` | Status `uncollectible` |
| `charge.refunded` | Status `refunded` |
| `charge.dispute.created` | Status `disputed` |

Every event also sets Last Webhook Event and Last Webhook At. Always return 200 after a good signature, as the Happy Cuts webhook does. ACH takes up to 4 business days to clear (Stripe docs), so `processing` is normal for a few days.

### d) Portal screen

A new "Rent" tab on the Properties page, admin only:

- **Due to go out**: the preview list. Each row shows property, payer, amount, due date, Stripe account and any problem. Checkboxes and a "Send selected" button. A confirm step names how many invoices, the total, and which accounts.
- **Open invoices**: every Lease Invoice not paid or void, newest due date first, with a status chip (open, processing, failed, past due) and links to the Stripe invoice page.
- The existing "Lease Invoices (Stripe)" table on each property keeps working and shows the new rows.

No tenant-facing screen. Tenants use Stripe's emailed invoice and hosted pay page, as they do now.

## 6. Late and failed payments

- A daily job (`pg_cron` calling `rent-invoices` with action `daily`) marks an open or failed invoice `Past Due` once today is past the due date plus that unit's Grace Period Days.
- Phase 2: when an invoice goes Past Due, the portal makes a **draft** late fee (Kind Late fee) using the unit's late fee fields, shown in the Rent tab for Thomas to send or skip. Nothing is sent to a tenant without his tap.
- Stripe's own reminder emails for unpaid invoices can be turned on in Stripe's invoice settings. Thomas decides; the code doesn't need it.
- A failed ACH payment costs $4 in Stripe fees (Stripe pricing page), so failures get a push alert.

## 7. Stripe fees (read Nov 22)

| Way to pay | Fee on $1,100 rent | Source |
|---|---|---|
| ACH bank debit | 0.8%, capped at $5.00, so $5.00 | stripe.com/en-us/pricing/local-payment-methods |
| Card | 2.9% + 30¢, so $32.20 | stripe.com/en-us/pricing |
| Failed ACH payment | $4.00 | stripe.com/en-us/pricing/local-payment-methods |
| Dispute | $15.00 | stripe.com/en-us/pricing |
| Stripe Invoicing | about 0.4% per paid invoice ($4.40), already being paid on today's hand-made invoices | stripe.com/en-us/pricing (not checked on the Invoicing page itself) |

ACH clears in up to 4 business days (docs.stripe.com/payments/ach-direct-debit). That's why ACH stays the default.

## 8. Hard limits for Gemini

- Work only on the branch Claude Code sets up (`feature/rent-invoicing`). Don't run git; Claude Code commits and opens the pull request. Never push to `main`.
- Only run `npm run build` and `npm run lint` in the shell.
- No new npm packages.
- Don't create or change Airtable tables or fields. Thomas does that (section 3).
- Don't touch `create-stripe-invoice`, `stripe-webhook`, `mark-invoice-paid`, `backfill-stripe-customer-ids`, Happy Cuts, Bitcoin, Bank Dashboard or Bookkeeping code. `_shared/stripeAccounts.ts` may only be imported, not changed.
- Never write to Property or Lease Agreements records. Writes go only to Lease Invoice, and to Tenants' Stripe Customer ID.
- No real Stripe calls while building. The code reads keys by name and must work without them: preview runs on Airtable alone, and send returns a clear "Stripe key not set for this account" error per row instead of crashing.
- Edge functions, secrets, webhooks and `pg_cron` are deployed by Thomas by hand. Gemini writes the files and a short deploy note.

### Secrets the code reads (Thomas fills these in later)

| Secret name | New? | What it is | Where Thomas gets it |
|---|---|---|---|
| `STRIPE_EAST_MEADOW_KEY` | Name already in `_shared/stripeAccounts.ts`, not set yet | Restricted API key, East Meadow Properties account | Stripe dashboard, Developers, API keys, Create restricted key. Write access: Customers, Invoices, Invoice items. Read: Events |
| `STRIPE_SHEPARD_HOLDINGS_KEY` | Name already in the code, not set yet | Same, Shepard Holdings account | Same, in the Shepard Holdings account |
| `STRIPE_EAST_MEADOW_WEBHOOK_SECRET` | **New. Needs Thomas's OK** | Signing secret for the East Meadow webhook | Created when he adds the webhook endpoint below |
| `STRIPE_SHEPARD_HOLDINGS_WEBHOOK_SECRET` | **New. Needs Thomas's OK** | Signing secret for the Shepard Holdings webhook | Same, in the Shepard Holdings account |

Webhook endpoints to add in Stripe (one per account), each listening for `invoice.sent`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `payment_intent.processing`, `charge.refunded`, `charge.dispute.created`:

- East Meadow: `https://<supabase-project>.supabase.co/functions/v1/stripe-rent-webhook?account=east_meadow`
- Shepard Holdings: `https://<supabase-project>.supabase.co/functions/v1/stripe-rent-webhook?account=shepard_holdings`

Test mode first: Thomas can set test-mode keys under the same names to run the done-tests, then swap in live keys.

## 9. Phases

**Phase 0a. Airtable, before the build.** Add the table and fields in section 3 (Thomas, or Claude on his OK). Claude then adds the field IDs to this spec. This is the only thing the build waits on.

**Phase 0b. Before testing and go-live.** Stripe keys, webhook endpoints and secrets (section 8). Fill Stripe Account on each property and late fee fields on each unit (section 4). Fix the data in 4c.

**Phase 1. Preview, send, status.** `rent-invoices` (preview and send), `stripe-rent-webhook`, the Rent tab, `src/lib/rentInvoices.js`. Thomas sends each month's invoices with one tap.

**Phase 2. Alerts and late fees.** Daily job, Past Due, push alerts for failed, refunded, disputed and past due (through the existing `send-push-notification`), draft late fees, a "rent this month" line in the daily digest.

**Phase 3. Hands-off (only if Thomas wants it).** Turn on auto-send per lease once a few months have gone out clean: the daily job sends instead of waiting for the tap.

**Later, not planned.** Autopay; tenant portal; prorated first and last months (stay hand-made for now); posting each paid invoice into the bookkeeping ledger.

## 10. Build steps for phase 1 (each with a done-test)

**Step 1. Data helper.** `src/lib/rentInvoices.js`: table IDs, field ID maps for writes, field name maps for reads, `fetchRentSchedule()`, `fetchOpenLeaseInvoices()`, and the pure functions `nextDueDate(dueDay, today)` and `splitAmounts(lines, rows)`. Done when: build and lint pass, and a small test file shows: Due Day 31 in February gives Feb 28; two 50% rows on $1,225 give $612.50 and $612.50; three equal rows on $1,000 give $333.33, $333.33, $333.34.

**Step 2. Edge function `rent-invoices`, preview only.** Done when: called with Thomas's login it returns the expected rows for the current leases and makes no writes anywhere; called with a non-admin login it returns 403.

**Step 3. Send.** Add the `send` action as in 5b. Done when (code only, before keys): build and lint pass, and with no key set each row comes back with "Stripe key not set" and no Lease Invoice row is left behind as anything but `draft`. Done when (after phase 0b): in Stripe test mode, sending one test row makes one Lease Invoice row, one Stripe invoice in the right test account, and an email to Thomas's test address; sending the same Run Key again makes nothing new.

**Step 4. Webhook.** `stripe-rent-webhook` as in 5c. Done when (code only): build and lint pass and a request with no or a bad signature gets 400. Done when (after phase 0b): paying the test invoice with Stripe's test bank account moves the row to `processing` then `paid`; a bad signature gets 400; an invoice without the rent metadata is ignored.

**Step 5. Rent tab.** As in 5d. Done when: the tab lists due rows with problems shown, Send selected asks to confirm and then sends, open invoices show live status, and a member login doesn't see the tab.

**Step 6. Docs and hand-off.** Deploy note in `docs/specs/rent-invoicing-deploy.md` (functions, flags, secrets, webhook URLs and events to subscribe). Short "Rent invoicing" section in `CLAUDE.md`. Build and lint one last time, then write a summary for Claude: files changed, each done-test result, anything not done.

## 11. Done-tests for the whole feature (before go-live)

1. 195 Kingwood's invoice is made in the Shepard Holdings account; every other property's in East Meadow.
2. A split lease makes one invoice per payer, and the amounts add up to the line item total.
3. A payment plan makes two invoices in the month on the right days.
4. Nothing goes out for a lease with Billing On unchecked, or for a property with no Stripe Account.
5. Pressing Send twice never makes two invoices for the same Run Key.
6. Paid, failed, refunded and disputed all show in the portal within a minute of Stripe's event.
7. The old Happy Cuts invoicing still works (send one Happy Cuts invoice in test mode).
8. Hand-made invoices in Stripe are not touched by the webhook.

## 12. Review before merge (Claude)

Claude checks the branch against this spec: limits in section 8 held, Airtable-before-Stripe order, idempotency keys, account routing, webhook signature check per account, admin gating, field IDs on writes and names on reads, no edits outside the listed files, build and lint pass. Thomas merges after that.

## 13. Kickoff prompt for Antigravity (phase 1)

Claude Code first saves this spec as `docs/specs/rent-invoicing.md` on the branch `feature/rent-invoicing`, with the field IDs filled in. Then paste from the shep-portal folder:

> Read GEMINI.md and CLAUDE.md, then docs/specs/rent-invoicing.md. Build phase 1 exactly as section 10 says, one step at a time: steps 1 to 6. Follow the limits in section 8 with no exceptions: no git commands, no new packages, no Airtable schema changes, no changes to the Happy Cuts Stripe functions or _shared/stripeAccounts.ts, no live Stripe calls, and never push to main. There are no Stripe keys yet, so build everything to work without them as section 8 says. Run npm run build and npm run lint after each step and tell me when a step is ready so it can be committed. Run each step's done-test before moving on. If something in the spec is unclear, or a done-test fails twice, stop and tell me what you need. When you finish, write a short summary of files changed and each done-test result.
