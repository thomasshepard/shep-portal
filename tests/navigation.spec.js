import { test, expect } from '@playwright/test'

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/dashboard')
    // On desktop the sidebar is always visible; on mobile open it
    if (await page.getByRole('button', { name: /menu/i }).isVisible()) {
      await page.getByRole('button', { name: /menu/i }).click()
    }
  })

  const routes = [
    { label: 'Dashboard', url: /dashboard/ },
    { label: 'Tasks',     url: /tasks/     },
  ]

  for (const { label, url } of routes) {
    test(`"${label}" link navigates correctly`, async ({ page }) => {
      await page.getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(url, { timeout: 8_000 })
    })
  }
})

test.describe('Notification bell', () => {
  test('bell icon is visible in header', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.locator('[aria-label="Notifications"]')).toBeVisible()
  })

  test('clicking bell on desktop opens dropdown', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/#/dashboard')
    await page.locator('[aria-label="Notifications"]').click()
    await expect(page.getByText('Notifications').first()).toBeVisible()
    await expect(page.getByText(/View all/)).toBeVisible()
  })

  test('clicking bell on mobile navigates to /notifications', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/dashboard')
    await page.locator('[aria-label="Notifications"]').click()
    await expect(page).toHaveURL(/notifications/, { timeout: 5_000 })
  })
})

test.describe('Public routes', () => {
  test('maintenance-request page loads without auth', async ({ browser }) => {
    // Fresh context — no session
    const ctx  = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await page.goto('/maintenance-request')
    // Should render the tenant form, not redirect to login
    await expect(page).not.toHaveURL(/login/, { timeout: 5_000 })
    await ctx.close()
  })
})

test.describe('404 / unknown routes', () => {
  test('unknown hash route redirects to dashboard', async ({ page }) => {
    await page.goto('/#/this-does-not-exist')
    await expect(page).toHaveURL(/dashboard/, { timeout: 5_000 })
  })
})
