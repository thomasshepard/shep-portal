#!/usr/bin/env node
/**
 * setup-tasks-table.js
 * Configures the Shep Portal Tasks Airtable table.
 * Run from shep-portal/: node scripts/setup-tasks-table.js
 */

const PAT      = process.env.VITE_AIRTABLE_PAT
const BASE_ID  = 'appYVLCn1NVLevdry'
const TABLE_ID = 'tbl3Di18kSLwEj1vN'

if (!PAT) {
  console.error('ERROR: VITE_AIRTABLE_PAT is not set. Run with: VITE_AIRTABLE_PAT=xxx node scripts/setup-tasks-table.js')
  process.exit(1)
}

const META_BASE = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`
const TABLE_URL = `${META_BASE}/tables/${TABLE_ID}`

const hdrs = {
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: hdrs,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json?.error || json)}`)
  }
  return json
}

async function main() {
  // ── Step 1: Rename table ────────────────────────────────────────────────────
  console.log('\n▶ Step 1: Renaming table to "Tasks"...')
  await api('PATCH', TABLE_URL, { name: 'Tasks' })
  console.log('  ✓ Table renamed')

  // ── Step 2: Rename primary field ────────────────────────────────────────────
  console.log('\n▶ Step 2: Renaming primary field to "Title"...')
  await api('PATCH', `${TABLE_URL}/fields/fldx2xmuxOVDls72i`, { name: 'Title' })
  console.log('  ✓ Primary field renamed to Title')

  // ── Step 3: Create fields ───────────────────────────────────────────────────
  const fieldsToCreate = [
    { name: 'Status', type: 'singleSelect', options: { choices: [
      { name: 'To Do' }, { name: 'In Progress' }, { name: 'Done' },
    ]}},
    { name: 'Module', type: 'singleSelect', options: { choices: [
      { name: 'Happy Cuts' }, { name: 'Properties' }, { name: 'LLC' }, { name: 'Manual' },
    ]}},
    { name: 'Due Date', type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Body', type: 'multilineText' },
    { name: 'Notes', type: 'multilineText' },
    { name: 'Source Key', type: 'singleLineText' },
    { name: 'Action URL', type: 'singleLineText' },
    { name: 'User ID', type: 'singleLineText' },
    { name: 'Completed At', type: 'date', options: { dateFormat: { name: 'us' } } },
  ]

  console.log('\n▶ Step 3: Creating fields...')
  const createdFields = {}
  for (const fieldDef of fieldsToCreate) {
    const result = await api('POST', `${TABLE_URL}/fields`, fieldDef)
    createdFields[fieldDef.name] = result.id
    console.log(`  ✓ ${fieldDef.name} → ${result.id}`)
  }

  // ── Step 4: Delete default fields ───────────────────────────────────────────
  const defaultFieldsToDelete = [
    { id: 'fldGi6DISZlMu0Bah', name: 'Notes (default)' },
    { id: 'fldv1QAs8laE4Xoym', name: 'Assignee' },
    { id: 'fldhTVby2nWd9x6kJ', name: 'Status (default)' },
    { id: 'fldybS4C9KfHQz3zr', name: 'Attachments' },
    { id: 'fldOrctlj4Srr1yqi', name: 'Attachment Summary' },
  ]

  console.log('\n▶ Step 4: Deleting default fields...')
  for (const { id, name } of defaultFieldsToDelete) {
    try {
      await api('DELETE', `${TABLE_URL}/fields/${id}`)
      console.log(`  ✓ Deleted ${name} (${id})`)
    } catch (e) {
      console.warn(`  ⚠ Could not delete ${name} (${id}): ${e.message} — may already be gone`)
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Setup complete. Field ID map:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  TITLE:        'fldx2xmuxOVDls72i',  // primary field (renamed)`)
  for (const [name, id] of Object.entries(createdFields)) {
    const key = name.toUpperCase().replace(/ /g, '_')
    console.log(`  ${key.padEnd(13)}: '${id}',`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(e => {
  console.error('\n❌ Setup failed:', e.message)
  process.exit(1)
})
