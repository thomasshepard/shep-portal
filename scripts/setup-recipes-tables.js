// Setup script for the Recipes Airtable base
// Run from shep-portal/: node scripts/setup-recipes-tables.js
//
// Reads VITE_AIRTABLE_PAT from .env automatically.

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env
const envPath = join(__dirname, '..', '.env')
const envVars = {}
try {
  const envText = readFileSync(envPath, 'utf8')
  for (const line of envText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
} catch {
  console.error('Could not read .env — make sure you run this from shep-portal/')
  process.exit(1)
}

const PAT = envVars.VITE_AIRTABLE_PAT
if (!PAT) {
  console.error('VITE_AIRTABLE_PAT not found in .env')
  process.exit(1)
}

const BASE_ID = 'appPKrIVr569rWySg'
const RECIPES_TABLE_ID = 'tblLhmJgQFRnUKi9n'
const META_BASE = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`

const hdrs = {
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
}

async function api(method, path, body, { soft = false } = {}) {
  const res = await fetch(`${META_BASE}${path}`, {
    method,
    headers: hdrs,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (soft) return null
    console.error(`${method} ${path} failed (${res.status}):`, JSON.stringify(json))
    process.exit(1)
  }
  return json
}

async function main() {
  console.log('=== Recipes Airtable Setup ===\n')

  // Step 1 — Rename default table to "Recipes"
  console.log('Step 1: Renaming default table to "Recipes"...')
  await api('PATCH', `/tables/${RECIPES_TABLE_ID}`, { name: 'Recipes' })
  console.log('  ✓ Renamed\n')

  // Step 2 — Delete unwanted default fields
  const fieldsToDelete = [
    'fldUFm3Izvw5scihV', // Notes
    'flddW8qCF7YUY6oMx', // Assignee
    'fldgewEMKTAi9t0D6', // Status
    'fldeD4zRHtTO2sgDL', // Attachments
    'flds5zf4U8MyfTpb3', // Attachment Summary
  ]
  console.log('Step 2: Deleting default fields...')
  for (const fid of fieldsToDelete) {
    const result = await api('DELETE', `/tables/${RECIPES_TABLE_ID}/fields/${fid}`, undefined, { soft: true })
    if (result) console.log(`  ✓ Deleted ${fid}`)
    else console.log(`  – Skipped ${fid} (not found)`)
  }
  console.log()

  // Step 3 — Create fields on Recipes table
  console.log('Step 3: Creating fields on Recipes table...')
  const recipeFieldDefs = [
    { name: 'Category', type: 'singleSelect', options: { choices: [
      { name: 'Dinner' }, { name: 'Breakfast' }, { name: 'Lunch' },
      { name: 'Snack' }, { name: 'Dessert' }, { name: 'Sides' },
    ]}},
    { name: 'Tags', type: 'multipleSelects', options: { choices: [
      { name: 'Quick' }, { name: 'Slow Cook' }, { name: "Gabrielle's" },
      { name: "Thomas's" }, { name: 'Kid Friendly' }, { name: 'Grill' }, { name: 'Favorite' },
    ]}},
    { name: 'Servings Base', type: 'number', options: { precision: 0 } },
    { name: 'Prep Time', type: 'number', options: { precision: 0 } },
    { name: 'Cook Time', type: 'number', options: { precision: 0 } },
    { name: 'Notes', type: 'multilineText' },
    { name: 'Added By', type: 'singleSelect', options: { choices: [
      { name: 'Thomas' }, { name: 'Gabrielle' },
    ]}},
    { name: 'Photo URLs', type: 'multilineText' },
  ]

  const recipeFieldIds = { NAME: 'fldK4smwr4v8CB6A3' }
  for (const def of recipeFieldDefs) {
    const result = await api('POST', `/tables/${RECIPES_TABLE_ID}/fields`, def)
    recipeFieldIds[def.name] = result.id
    console.log(`  ✓ Created "${def.name}": ${result.id}`)
  }
  console.log()

  // Step 4 — Create Ingredients table
  console.log('Step 4: Creating Ingredients table...')
  const ingTable = await api('POST', '/tables', {
    name: 'Ingredients',
    fields: [
      { name: 'Name', type: 'singleLineText' },
      { name: 'Recipe', type: 'multipleRecordLinks', options: { linkedTableId: RECIPES_TABLE_ID } },
      { name: 'Quantity', type: 'number', options: { precision: 2 } },
      { name: 'Unit', type: 'singleSelect', options: { choices: [
        { name: 'cup' }, { name: 'tbsp' }, { name: 'tsp' },
        { name: 'oz' }, { name: 'lb' }, { name: 'g' }, { name: 'kg' },
        { name: 'ml' }, { name: 'whole' }, { name: 'pinch' }, { name: 'to taste' }, { name: 'slice' },
      ]}},
      { name: 'Display Order', type: 'number', options: { precision: 0 } },
      { name: 'Notes', type: 'singleLineText' },
    ],
  })
  const ingTableId = ingTable.id
  const ingFieldIds = {}
  for (const f of ingTable.fields) ingFieldIds[f.name] = f.id
  console.log(`  ✓ Created Ingredients table: ${ingTableId}\n`)

  // Step 5 — Create Steps table
  console.log('Step 5: Creating Steps table...')
  const stepsTable = await api('POST', '/tables', {
    name: 'Steps',
    fields: [
      { name: 'Instruction', type: 'multilineText' },
      { name: 'Recipe', type: 'multipleRecordLinks', options: { linkedTableId: RECIPES_TABLE_ID } },
      { name: 'Step Number', type: 'number', options: { precision: 0 } },
      { name: 'Timer Minutes', type: 'number', options: { precision: 0 } },
      { name: 'Timer Label', type: 'singleLineText' },
      { name: 'Key Value', type: 'singleLineText' },
    ],
  })
  const stepsTableId = stepsTable.id
  const stepFieldIds = {}
  for (const f of stepsTable.fields) stepFieldIds[f.name] = f.id
  console.log(`  ✓ Created Steps table: ${stepsTableId}\n`)

  // Step 6 — Print field ID map
  console.log('=== FIELD IDs — paste into src/lib/recipes.js ===\n')
  console.log(`RECIPES TABLE: ${RECIPES_TABLE_ID}`)
  console.log(`  Name:          ${recipeFieldIds['NAME']}`)
  console.log(`  Category:      ${recipeFieldIds['Category']}`)
  console.log(`  Tags:          ${recipeFieldIds['Tags']}`)
  console.log(`  Servings Base: ${recipeFieldIds['Servings Base']}`)
  console.log(`  Prep Time:     ${recipeFieldIds['Prep Time']}`)
  console.log(`  Cook Time:     ${recipeFieldIds['Cook Time']}`)
  console.log(`  Notes:         ${recipeFieldIds['Notes']}`)
  console.log(`  Added By:      ${recipeFieldIds['Added By']}`)
  console.log(`  Photo URLs:    ${recipeFieldIds['Photo URLs']}`)
  console.log()
  console.log(`INGREDIENTS TABLE: ${ingTableId}`)
  console.log(`  Name:          ${ingFieldIds['Name']}`)
  console.log(`  Recipe:        ${ingFieldIds['Recipe']}`)
  console.log(`  Quantity:      ${ingFieldIds['Quantity']}`)
  console.log(`  Unit:          ${ingFieldIds['Unit']}`)
  console.log(`  Display Order: ${ingFieldIds['Display Order']}`)
  console.log(`  Notes:         ${ingFieldIds['Notes']}`)
  console.log()
  console.log(`STEPS TABLE: ${stepsTableId}`)
  console.log(`  Instruction:   ${stepFieldIds['Instruction']}`)
  console.log(`  Recipe:        ${stepFieldIds['Recipe']}`)
  console.log(`  Step Number:   ${stepFieldIds['Step Number']}`)
  console.log(`  Timer Minutes: ${stepFieldIds['Timer Minutes']}`)
  console.log(`  Timer Label:   ${stepFieldIds['Timer Label']}`)
  console.log(`  Key Value:     ${stepFieldIds['Key Value']}`)
  console.log()
  console.log('=== Done! ===')
}

main()
