#!/usr/bin/env node
/**
 * setup-backlog-table.js
 * Adds the Backlog Inbox fields (Kind, Check-in Date, Groomed At, Resolved)
 * to the existing Feature Ideas Airtable table.
 * Run from shep-portal/: VITE_AIRTABLE_PAT=xxx node scripts/setup-backlog-table.js
 *
 * Note: Backlog.jsx reads/writes by field NAME, not field ID (unlike
 * tasks.js/recipes.js) -- the IDs printed below are for documentation only,
 * the app code doesn't need them.
 */

const PAT      = process.env.VITE_AIRTABLE_PAT
const BASE_ID  = 'appp0qWrN24f8wqho'
const TABLE_ID = 'tblHUG1CGxrirONPB'

if (!PAT) {
  console.error('ERROR: VITE_AIRTABLE_PAT is not set. Run with: VITE_AIRTABLE_PAT=xxx node scripts/setup-backlog-table.js')
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
  console.log('\n▶ Checking existing fields...')
  const { tables } = await api('GET', `${META_BASE}/tables`)
  const table = tables.find(t => t.id === TABLE_ID)
  if (!table) throw new Error(`Table ${TABLE_ID} not found in base ${BASE_ID}`)
  const existingNames = new Set(table.fields.map(f => f.name))

  const fieldsToCreate = [
    { name: 'Kind', type: 'singleSelect', options: { choices: [
      { name: 'Build' }, { name: 'Do' }, { name: 'Decide / Research' },
    ]}},
    { name: 'Check-in Date', type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Groomed At', type: 'date', options: { dateFormat: { name: 'us' } } },
    { name: 'Resolved', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
  ]

  console.log('\n▶ Creating fields...')
  const createdFields = {}
  for (const fieldDef of fieldsToCreate) {
    if (existingNames.has(fieldDef.name)) {
      console.log(`  – ${fieldDef.name} already exists, skipping`)
      continue
    }
    const result = await api('POST', `${TABLE_URL}/fields`, fieldDef)
    createdFields[fieldDef.name] = result.id
    console.log(`  ✓ ${fieldDef.name} → ${result.id}`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Setup complete. Field ID map (for reference only):')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const [name, id] of Object.entries(createdFields)) {
    console.log(`  ${name.padEnd(15)}: '${id}',`)
  }
  console.log('')
}

main().catch(e => {
  console.error('\n❌ Failed:', e.message)
  process.exit(1)
})
