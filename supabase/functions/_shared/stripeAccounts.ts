// To add a new account: (1) add an entry to STRIPE_ACCOUNTS below with its env var key,
// (2) set that env var in Supabase dashboard → Edge Functions → Secrets.
import Stripe from 'https://esm.sh/stripe@17?target=deno'

export const STRIPE_ACCOUNTS = {
  happy_cuts:        { envVar: 'STRIPE_HAPPY_CUTS_KEY',        displayName: 'Happy Cuts' },
  east_meadow:       { envVar: 'STRIPE_EAST_MEADOW_KEY',       displayName: 'East Meadow Properties' },
  shepard_holdings:  { envVar: 'STRIPE_SHEPARD_HOLDINGS_KEY',  displayName: 'Shepard Holdings' },
  virginia_holdings: { envVar: 'STRIPE_VIRGINIA_HOLDINGS_KEY', displayName: 'Virginia Holdings' },
} as const

export type StripeAccountKey = keyof typeof STRIPE_ACCOUNTS

export function getStripeClientForAccount(account: StripeAccountKey): Stripe {
  const entry = STRIPE_ACCOUNTS[account]
  const key = Deno.env.get(entry.envVar) ?? ''
  if (!key) {
    const err = new Error(`Unknown or unconfigured Stripe account: ${account}`) as Error & { statusCode: number }
    err.statusCode = 400
    throw err
  }
  return new Stripe(key, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
}
