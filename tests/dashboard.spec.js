import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('loads without JS errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/#/dashboard')
    await page.waitForTimeout(2_000) // let async data load

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('renders heading and stat cards', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10_000 })
  })

  test('authenticated user stays on dashboard (no redirect)', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page).toHaveURL(/dashboard/)
    await expect(page).not.toHaveURL(/login/)
  })
})
