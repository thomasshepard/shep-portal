// Recipes module — Airtable helpers
// Field IDs: run scripts/setup-recipes-tables.js (needs schema.bases:write PAT scope)
// then replace all 'fld...' / 'tbl...' placeholders below.

const BASE_ID = 'appPKrIVr569rWySg'
const PAT = () => import.meta.env.VITE_AIRTABLE_PAT

// Fill in after running setup-recipes-tables.js
export const TABLES = {
  RECIPES:     'tblLhmJgQFRnUKi9n',
  INGREDIENTS: 'tbllXJJkeWWcdzRWk',
  STEPS:       'tblaiMI7wQHa2gbdJ',
}

export const RECIPE_FIELDS = {
  NAME:          'fldK4smwr4v8CB6A3',
  CATEGORY:      'fldxgSdjiBQsFD28i',
  TAGS:          'fldhqrXWH0r3IGEWZ',
  SERVINGS_BASE: 'fld2TswdlRXDM3bS0',
  PREP_TIME:     'fldcp2o347nljS8Gq',
  COOK_TIME:     'fldEGAbQimzx6dFJs',
  NOTES:         'fldUFm3Izvw5scihV',
  ADDED_BY:      'fldtlH1lCV7FT2u8Y',
  PHOTO_URLS:    'fldFeHK6heiQO6E2t',
}

export const ING_FIELDS = {
  NAME:          'fldqkzUJWopVHcbjS',
  RECIPE:        'fldBtW5HKb0puFEQu',
  QUANTITY:      'fldofOAwNsJ2UNK5w',
  UNIT:          'fldwL4exu5xSNWOwm',
  DISPLAY_ORDER: 'fldCuUDFtm6TDzWcy',
  NOTES:         'fld4fxNV4TKHGZH42',
}

export const STEP_FIELDS = {
  INSTRUCTION:   'fldPQqzkSkaRu2G4M',
  RECIPE:        'fldzULb8oe3l1vw5N',
  STEP_NUMBER:   'fldr8rICIcsUMhmyl',
  TIMER_MINUTES: 'fldIZaqNlWPt7U9rX',
  TIMER_LABEL:   'fldZ8c3tEipPepVD9',
  KEY_VALUE:     'fldSQvVWsSfjbaGGU',
}

function headers() {
  return {
    Authorization: `Bearer ${PAT()}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchRecipes() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.RECIPES}?sort[0][field]=${RECIPE_FIELDS.NAME}&sort[0][direction]=asc`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`fetchRecipes failed: ${res.status}`)
  const data = await res.json()
  return data.records || []
}

export async function fetchIngredients(recipeId) {
  const formula = encodeURIComponent(`FIND("${recipeId}", ARRAYJOIN({Recipe}))`)
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.INGREDIENTS}?filterByFormula=${formula}&sort[0][field]=${ING_FIELDS.DISPLAY_ORDER}&sort[0][direction]=asc`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`fetchIngredients failed: ${res.status}`)
  const data = await res.json()
  return data.records || []
}

export async function fetchSteps(recipeId) {
  const formula = encodeURIComponent(`FIND("${recipeId}", ARRAYJOIN({Recipe}))`)
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.STEPS}?filterByFormula=${formula}&sort[0][field]=${STEP_FIELDS.STEP_NUMBER}&sort[0][direction]=asc`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`fetchSteps failed: ${res.status}`)
  const data = await res.json()
  return data.records || []
}

export async function createRecipe(recipeData, ingredients, steps) {
  const recipeRes = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${TABLES.RECIPES}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        records: [{
          fields: {
            [RECIPE_FIELDS.NAME]:          recipeData.name,
            [RECIPE_FIELDS.CATEGORY]:      recipeData.category || null,
            [RECIPE_FIELDS.TAGS]:          recipeData.tags || [],
            [RECIPE_FIELDS.SERVINGS_BASE]: recipeData.servingsBase || 4,
            [RECIPE_FIELDS.PREP_TIME]:     recipeData.prepTime || null,
            [RECIPE_FIELDS.COOK_TIME]:     recipeData.cookTime || null,
            [RECIPE_FIELDS.NOTES]:         recipeData.notes || '',
            [RECIPE_FIELDS.ADDED_BY]:      recipeData.addedBy || null,
            [RECIPE_FIELDS.PHOTO_URLS]:    JSON.stringify([]),
          }
        }],
        typecast: true,
      })
    }
  )
  if (!recipeRes.ok) throw new Error(`createRecipe failed: ${recipeRes.status}`)
  const recipeJson = await recipeRes.json()
  const recipeId = recipeJson.records[0].id

  if (ingredients && ingredients.length > 0) {
    for (let i = 0; i < ingredients.length; i += 10) {
      const chunk = ingredients.slice(i, i + 10)
      await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLES.INGREDIENTS}`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            records: chunk.map(ing => ({
              fields: {
                [ING_FIELDS.NAME]:          ing.name,
                [ING_FIELDS.RECIPE]:        [recipeId],
                [ING_FIELDS.QUANTITY]:      ing.quantity || null,
                [ING_FIELDS.UNIT]:          ing.unit || null,
                [ING_FIELDS.DISPLAY_ORDER]: ing.displayOrder || 0,
                [ING_FIELDS.NOTES]:         ing.notes || '',
              }
            })),
            typecast: true,
          })
        }
      )
    }
  }

  if (steps && steps.length > 0) {
    for (let i = 0; i < steps.length; i += 10) {
      const chunk = steps.slice(i, i + 10)
      await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLES.STEPS}`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            records: chunk.map(step => ({
              fields: {
                [STEP_FIELDS.INSTRUCTION]:   step.instruction,
                [STEP_FIELDS.RECIPE]:        [recipeId],
                [STEP_FIELDS.STEP_NUMBER]:   step.stepNumber,
                [STEP_FIELDS.TIMER_MINUTES]: step.timerMinutes || null,
                [STEP_FIELDS.TIMER_LABEL]:   step.timerLabel || '',
                [STEP_FIELDS.KEY_VALUE]:     step.keyValue || '',
              }
            })),
            typecast: true,
          })
        }
      )
    }
  }

  return recipeId
}

export async function updateRecipe(recordId, fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${TABLES.RECIPES}/${recordId}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields, typecast: true }),
    }
  )
  if (!res.ok) throw new Error(`updateRecipe failed: ${res.status}`)
  return res.json()
}

export async function deleteRecipe(recipeId, ingredientIds, stepIds) {
  for (let i = 0; i < ingredientIds.length; i += 10) {
    const chunk = ingredientIds.slice(i, i + 10)
    const params = chunk.map(id => `records[]=${id}`).join('&')
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLES.INGREDIENTS}?${params}`,
      { method: 'DELETE', headers: headers() }
    )
  }
  for (let i = 0; i < stepIds.length; i += 10) {
    const chunk = stepIds.slice(i, i + 10)
    const params = chunk.map(id => `records[]=${id}`).join('&')
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLES.STEPS}?${params}`,
      { method: 'DELETE', headers: headers() }
    )
  }
  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${TABLES.RECIPES}/${recipeId}`,
    { method: 'DELETE', headers: headers() }
  )
}
