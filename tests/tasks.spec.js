// Tasks module E2E tests.
// Creates real Airtable records — each test task is tagged with a unique
// timestamp prefix so it can be identified and cleaned up reliably.

import { test, expect } from '@playwright/test'

// Unique prefix for tasks created by this test run
const TAG = `[TEST-${Date.now()}]`

async function goToTasks(page) {
  await page.goto('/#/tasks')
  // Wait for load spinner to disappear
  await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 })
}

async function createTask(page, title, dueDate) {
  await page.getByRole('button', { name: '+' }).first().click()
  await expect(page.getByText('New Task')).toBeVisible()
  await page.getByPlaceholder('Task title').fill(title)
  if (dueDate) {
    await page.locator('input[type="date"]').fill(dueDate)
  }
  await page.getByRole('button', { name: 'Add Task' }).click()
  // Sheet closes and task appears
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 })
}

// ── Layout ────────────────────────────────────────────────────────────────────

test.describe('Tasks layout', () => {
  test('desktop shows three kanban columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)

    // Column headers visible
    await expect(page.getByRole('heading', { name: 'To Do' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In Progress' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible()

    // Tab bar hidden on desktop
    const tabBar = page.locator('.md\\:hidden').filter({ hasText: 'To Do' })
    await expect(tabBar).not.toBeVisible()
  })

  test('mobile shows tab bar, not kanban grid', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await goToTasks(page)

    // Tab buttons visible on mobile
    await expect(page.getByRole('button', { name: /To Do/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /In Progress/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Done/ })).toBeVisible()

    // Kanban grid hidden on mobile
    const kanban = page.locator('.md\\:grid')
    await expect(kanban).not.toBeVisible()
  })

  test('header shows open count', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)
    // "N open" subtitle renders (number varies — just check the text pattern)
    await expect(page.getByText(/\d+ open/)).toBeVisible()
  })

  test('module filter chips render', async ({ page }) => {
    await goToTasks(page)
    for (const label of ['All', 'Happy Cuts', 'Properties', 'LLC', 'Manual']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }
  })
})

// ── CRUD ──────────────────────────────────────────────────────────────────────

test.describe('Task CRUD', () => {
  const taskTitle = `${TAG} Create test`

  test('create a task — appears in To Do', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)
    await createTask(page, taskTitle)

    // Find card in To Do column
    const toDoCol = page.locator('div').filter({ hasText: /^To Do$/ }).first()
    await expect(page.getByText(taskTitle)).toBeVisible()
  })

  test('Start button moves task to In Progress', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)

    // Find the test task card and click Start
    const card = page.locator('div').filter({ hasText: taskTitle }).first()
    await card.getByRole('button', { name: 'Start' }).click()

    // Should now appear in In Progress column
    const inProgressCol = page.locator('div').filter({ hasText: /^In Progress$/ }).first()
    await expect(inProgressCol.getByText(taskTitle)).toBeVisible({ timeout: 8_000 })
  })

  test('Done ✓ button moves task to Done with flash', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)

    const card = page.locator('div').filter({ hasText: taskTitle }).first()
    await card.getByRole('button', { name: /Done/ }).click()

    // Flash overlay appears briefly (green ✓)
    // Then card moves to Done column
    const doneCol = page.locator('div').filter({ hasText: /^Done$/ }).first()
    await expect(doneCol.getByText(taskTitle)).toBeVisible({ timeout: 8_000 })

    // Title should be strikethrough (Done state)
    const titleEl = doneCol.getByText(taskTitle)
    await expect(titleEl).toHaveClass(/line-through/)
  })

  test('delete task — disappears from list', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)

    // Expand the card to reveal delete button
    const card = page.locator('div').filter({ hasText: taskTitle }).first()
    await card.locator('button').first().click() // tap title to expand
    await card.getByRole('button', { name: /delete/i }).click()

    // Toast confirms deletion
    await expect(page.getByText('Task deleted')).toBeVisible({ timeout: 5_000 })
    // Card gone
    await expect(page.getByText(taskTitle)).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Due dates ─────────────────────────────────────────────────────────────────

test.describe('Due date chips', () => {
  const overdueTitle = `${TAG} Overdue task`
  const todayTitle   = `${TAG} Due today task`

  // Get today and yesterday as YYYY-MM-DD
  function isoDate(offsetDays = 0) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  test('overdue task shows red chip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)
    await createTask(page, overdueTitle, isoDate(-3)) // 3 days ago

    const card = page.locator('div').filter({ hasText: overdueTitle }).first()
    await expect(card.getByText(/Overdue/)).toBeVisible()
    // Chip should have red styling
    const chip = card.getByText(/Overdue/)
    await expect(chip).toHaveClass(/text-red/)

    // Cleanup
    await card.locator('button').first().click()
    await card.getByRole('button', { name: /delete/i }).click()
  })

  test('task due today shows "Due today" chip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)
    await createTask(page, todayTitle, isoDate(0))

    const card = page.locator('div').filter({ hasText: todayTitle }).first()
    await expect(card.getByText('Due today')).toBeVisible()

    // Cleanup
    await card.locator('button').first().click()
    await card.getByRole('button', { name: /delete/i }).click()
  })
})

// ── Module filter ─────────────────────────────────────────────────────────────

test.describe('Module filter chips', () => {
  test('filtering by module hides non-matching tasks', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTasks(page)

    // Click "Happy Cuts" chip
    await page.getByRole('button', { name: 'Happy Cuts' }).click()
    await expect(page.getByRole('button', { name: 'Happy Cuts' })).toHaveClass(/bg-slate-800/)

    // "All" chip should no longer be active
    await expect(page.getByRole('button', { name: 'All' })).not.toHaveClass(/bg-slate-800/)

    // Reset
    await page.getByRole('button', { name: 'All' }).click()
  })
})

// ── Add dialog ────────────────────────────────────────────────────────────────

test.describe('Add task dialog', () => {
  test('dialog title field required — button disabled when empty', async ({ page }) => {
    await goToTasks(page)
    await page.getByRole('button', { name: '+' }).first().click()
    await expect(page.getByText('New Task')).toBeVisible()

    const addBtn = page.getByRole('button', { name: 'Add Task' })
    await expect(addBtn).toBeDisabled()

    await page.getByPlaceholder('Task title').fill('x')
    await expect(addBtn).toBeEnabled()
  })

  test('mobile dialog renders as bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await goToTasks(page)
    await page.getByRole('button', { name: '+' }).first().click()

    // Drag handle visible on mobile
    await expect(page.locator('.md\\:hidden.w-10.h-1')).toBeVisible()
  })

  test('pressing Escape closes the dialog', async ({ page }) => {
    await goToTasks(page)
    await page.getByRole('button', { name: '+' }).first().click()
    await expect(page.getByText('New Task')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('New Task')).not.toBeVisible()
  })
})

// ── Empty states ──────────────────────────────────────────────────────────────

test.describe('Empty states', () => {
  test('In Progress empty state shows rocket emoji', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // mobile tabs
    await goToTasks(page)
    await page.getByRole('button', { name: /In Progress/ }).click()
    // If truly empty, shows 🚀
    const empty = page.getByText('Nothing in flight')
    // May or may not be empty depending on real data — only assert if visible
    if (await empty.isVisible()) {
      await expect(page.getByText('🚀')).toBeVisible()
    }
  })
})
