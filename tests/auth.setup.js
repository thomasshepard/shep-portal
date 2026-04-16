// Runs once before all test suites.
// Logs in with TEST_EMAIL / TEST_PASSWORD and saves session state so
// subsequent tests skip the login screen.

import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, '.auth/session.json')

setup('authenticate', async ({ page }) => {
  const email    = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL and TEST_PASSWORD must be set in .env.test\n' +
      'Copy .env.test.example → .env.test and fill in credentials.'
    )
  }

  await page.goto('/#/login')
  await expect(page.getByText('Sign in to your account')).toBeVisible()

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('**/#/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

  // Save session (cookies + localStorage with Supabase token)
  await page.context().storageState({ path: SESSION_FILE })
  console.log('✓ Auth session saved')
})
