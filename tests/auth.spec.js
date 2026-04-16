// Auth flow tests — run without saved session so we test the actual login UI.
// These use a fresh context (no storageState).

import { test, expect } from '@playwright/test'

// Override project storageState for this file
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login page', () => {
  test('renders correctly', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByText('Shep Portal')).toBeVisible()
    await expect(page.getByText('Sign in to your account')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/#/login')
    await page.locator('input[type="email"]').fill('wrong@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()
    // react-hot-toast renders error message
    await expect(page.locator('[data-hot-toast]').or(page.getByText(/invalid/i))).toBeVisible({ timeout: 8_000 })
    // Should stay on login
    await expect(page).toHaveURL(/login/)
  })

  test('redirects unauthenticated users from protected routes to dashboard (which redirects to login)', async ({ page }) => {
    await page.goto('/#/tasks')
    // Without auth, ProtectedRoute redirects — end up at login or dashboard
    await expect(page).toHaveURL(/login|dashboard/, { timeout: 5_000 })
  })
})

test.describe('Logout', () => {
  // Re-use saved session for logout test
  test.use({ storageState: 'tests/.auth/session.json' })

  test('logs out and redirects to login', async ({ page }) => {
    await page.goto('/#/dashboard')
    // Open sidebar (sidebar has Log Out button)
    const logoutBtn = page.getByRole('button', { name: /log out/i })
    if (!await logoutBtn.isVisible()) {
      // On mobile the sidebar is collapsed — open it
      await page.getByRole('button', { name: /menu/i }).click()
    }
    await logoutBtn.click()
    await expect(page).toHaveURL(/login/, { timeout: 8_000 })
  })
})
