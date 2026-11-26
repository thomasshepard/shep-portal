# Rent Invoicing (Stripe) — Deploy Note

Short, plain English, for Thomas to follow by hand.

## 1. What ships

- `rent-invoices` — admin-only edge function (`preview`, `send`)
- `stripe-rent-webhook` — Stripe webhook endpoint
- Shared code in `supabase/functions/_shared/`:
  - `rentMath.js`
  - `rentPreview.js`
  - `rentSend.js`
  - `rentWebhook.js`
- The **Rent tab** on the Properties page (admin only)
- `src/lib/rentInvoices.js`

Nothing is deployed by the PR. Thomas deploys by hand.

## 2. Before deploying

- Airtable fields from spec section 3 exist (they do, see section 3d)
- Fill **Stripe Account** on each Property:
  - East Meadow Properties for all **except** 195 Kingwood Dr
  - 195 Kingwood Dr = Shepard Holdings
- Create Rent Schedule rows for each payer/payment plan
- Tick **Billing On** on each lease to bill
- Fix the data in spec section 4c

## 3. Secrets (Supabase dashboard → Edge Functions → Secrets)

| Secret | What | Where to get it |
|---|---|---|
| `STRIPE_EAST_MEADOW_KEY` | Restricted key, East Meadow account | Stripe → Developers → API keys → Create restricted key |
| `STRIPE_SHEPARD_HOLDINGS_KEY` | Restricted key, Shepard Holdings account | Same, in the Shepard Holdings account |
| `STRIPE_EAST_MEADOW_WEBHOOK_SECRET` (new) | Signing secret of the East Meadow webhook endpoint | Shown when the endpoint is created |
| `STRIPE_SHEPARD_HOLDINGS_WEBHOOK_SECRET` (new) | Signing secret of the Shepard Holdings webhook endpoint | Shown when the endpoint is created |

Restricted key permissions: **Write** Customers, Invoices, Invoice items; **Read** Charges (only used to link a dispute back to its invoice). `AIRTABLE_PAT` must already have read/write on the Property Management base (`appeuX9BHNgVXxdYZ`).

## 4. Deploy commands

```
supabase functions deploy rent-invoices
supabase functions deploy stripe-rent-webhook --no-verify-jwt
```

One line on why: Stripe calls the webhook with no Supabase login; its signature is checked against the per-account secret instead. `rent-invoices` keeps JWT verification on and also checks the caller is an admin.

## 5. Webhook endpoints (one per Stripe account)

- **East Meadow**: `https://<supabase-project>.supabase.co/functions/v1/stripe-rent-webhook?account=east_meadow`
- **Shepard Holdings**: `https://<supabase-project>.supabase.co/functions/v1/stripe-rent-webhook?account=shepard_holdings`

Events to subscribe:
- `invoice.sent`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.voided`
- `invoice.marked_uncollectible`
- `payment_intent.processing`
- `charge.refunded`
- `charge.dispute.created`

## 6. Test mode first

Set test-mode keys and test webhook secrets under the same names, run the done-tests in spec sections 10 and 11 (preview returns expected rows; send with no key returns "Stripe key not set" per row and no leaked drafts; webhook rejects bad signatures; paying a test invoice moves the row to `processing` then `paid`; invoices without the rent metadata are ignored), then swap in live keys.

## 7. What is not in phase 1

- The daily Past Due job (`pg_cron`)
- Late fees and push alerts

These are phase 2.

## 8. Rolling back

- Delete or disable the two Stripe webhook endpoints
- `supabase functions delete rent-invoices` / `stripe-rent-webhook` if needed
- Lease Invoice rows stay in Airtable