// hermes-gateway — narrow HTTP API for the Hermes agent (Hostinger VPS) to
// interact with Shep Portal, without giving it browser access or raw
// Airtable/Supabase credentials.
//
// Auth: a single shared secret, NOT a Supabase JWT and NOT the Airtable PAT.
//   Authorization: Bearer <HERMES_API_KEY>
// Deploy with --no-verify-jwt (Hermes has no Supabase session), but every
// request is still gated by the HERMES_API_KEY check below.
//
// Every call is logged to public.access_logs attributed to the "Hermes
// Agent" profile (see supabase/migrations/20260720_create_hermes_agent_profile.sql)
// so its activity shows up in Admin > Access Logs alongside human activity.
//
// Body shape: { action: string, ...payload }
// Actions implemented so far: ping, list_tasks, create_task, update_task,
// search_documents, get_document. Add new actions by extending ACTIONS below
// — keep it an explicit allowlist, never a generic Airtable/Supabase passthrough.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HERMES_API_KEY   = Deno.env.get('HERMES_API_KEY') ?? ''
const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT') ?? ''
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const TASKS_BASE  = 'appYVLCn1NVLevdry'
const TASKS_TABLE = 'tbl3Di18kSLwEj1vN'
const DOCS_BASE    = 'app9ZYxynGul6hYZU'

// Task field IDs — must match src/lib/tasks.js FIELDS.
const TF = {
  TITLE:        'fldx2xmuxOVDls72i',
  STATUS:       'fldWNIkplM2WKr0kq',
  MODULE:       'fldR1DLAM4fEVDSws',
  DUE_DATE:     'fldLxGJRu1XeK4z7t',
  BODY:         'fldyFXF6qidj6sIaF',
  NOTES:        'fldJxZkDj1EI1WaKl',
  SOURCE_KEY:   'fldecwMW903tpCsfH',
  ACTION_URL:   'fldNzqMx8txSraQCY',
  USER_ID:      'fldTjTxZgy6RZHyaf',
  COMPLETED_AT: 'fldK1GKFJSdceoVtT',
}

const HERMES_EMAIL = 'hermes-agent@shep-portal.internal'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function airtable(method: string, base: string, table: string, path = '', body?: unknown) {
  const url = `https://api.airtable.com/v0/${base}/${table}${path}`
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Airtable ${method} ${table} failed: ${res.status}`)
  return data
}

let hermesProfileId: string | null = null
async function getHermesProfileId(): Promise<string> {
  if (hermesProfileId) return hermesProfileId
  const { data, error } = await sb.from('profiles').select('id').eq('email', HERMES_EMAIL).single()
  if (error || !data) throw new Error('Hermes profile not found — run the 20260720 migration first')
  hermesProfileId = data.id
  return hermesProfileId
}

// Documents.jsx tries the 'Documents' table name first and falls back to
// 'Scanned Documents' — mirror that instead of trusting a hardcoded table ID.
let docsTableName: string | null = null
async function getDocsTable(): Promise<string> {
  if (docsTableName) return docsTableName
  const probe = await fetch(`https://api.airtable.com/v0/${DOCS_BASE}/Documents?maxRecords=1`, {
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
  })
  docsTableName = probe.ok ? 'Documents' : 'Scanned Documents'
  return docsTableName
}

async function logCall(action: string, payload: unknown, result: { ok: boolean; error?: string }) {
  try {
    const hermesId = await getHermesProfileId()
    await sb.from('access_logs').insert({
      user_id: hermesId,
      user_email: HERMES_EMAIL,
      page_path: null,
      action: `hermes:${action}`,
      metadata: { payload, ...result },
    })
  } catch (e) {
    console.error('[hermes-gateway] failed to write access_logs:', e)
  }
}

// ── Actions ──────────────────────────────────────────────────────────────

async function actionPing() {
  return { ok: true, agent: 'hermes-gateway', time: new Date().toISOString() }
}

async function actionListTasks(payload: any) {
  const mineOnly = payload?.mineOnly !== false // default true
  const status   = payload?.status ? String(payload.status) : null
  const limit    = Math.min(Number(payload?.limit) || 50, 100)

  const clauses: string[] = []
  if (mineOnly) {
    const hermesId = await getHermesProfileId()
    clauses.push(`{${TF.USER_ID}}='${hermesId}'`)
  }
  if (status) clauses.push(`{${TF.STATUS}}='${status.replace(/'/g, "\\'")}'`)
  const formula = clauses.length ? `?filterByFormula=${encodeURIComponent(clauses.length > 1 ? `AND(${clauses.join(',')})` : clauses[0])}` : ''
  const sep = formula ? '&' : '?'
  const data = await airtable('GET', TASKS_BASE, TASKS_TABLE, `${formula}${sep}returnFieldsByFieldId=true&pageSize=${limit}`)

  const tasks = (data.records || []).map((r: any) => ({
    id:         r.id,
    title:      r.fields[TF.TITLE] || '',
    status:     r.fields[TF.STATUS] || '',
    module:     r.fields[TF.MODULE] || '',
    dueDate:    r.fields[TF.DUE_DATE] || null,
    body:       r.fields[TF.BODY] || '',
    notes:      r.fields[TF.NOTES] || '',
    sourceKey:  r.fields[TF.SOURCE_KEY] || null,
    actionUrl:  r.fields[TF.ACTION_URL] || null,
    assignedTo: r.fields[TF.USER_ID] || null,
  }))
  return { ok: true, tasks }
}

async function actionCreateTask(payload: any) {
  const title = String(payload?.title || '').trim()
  if (!title) throw new Error('title is required')

  const assignTo: string = payload?.assignTo === 'hermes' || !payload?.assignTo
    ? await getHermesProfileId()
    : String(payload.assignTo) // caller-supplied profile UUID

  const fields: Record<string, unknown> = {
    [TF.TITLE]:   title,
    [TF.STATUS]:  'To Do',
    [TF.USER_ID]: assignTo,
  }
  if (payload?.module)    fields[TF.MODULE]     = String(payload.module)
  if (payload?.dueDate)   fields[TF.DUE_DATE]   = String(payload.dueDate)
  if (payload?.body)      fields[TF.BODY]       = String(payload.body)
  if (payload?.notes)     fields[TF.NOTES]      = String(payload.notes)
  if (payload?.sourceKey) fields[TF.SOURCE_KEY] = String(payload.sourceKey)
  if (payload?.actionUrl) fields[TF.ACTION_URL] = String(payload.actionUrl)

  const data = await airtable('POST', TASKS_BASE, TASKS_TABLE, '?returnFieldsByFieldId=true', {
    records: [{ fields }], typecast: true,
  })
  const record = data.records[0]

  // If Hermes assigned the task to a human, give them an in-app notification
  // the same way a human assigning to another human would.
  const hermesId = await getHermesProfileId()
  if (assignTo !== hermesId) {
    await sb.from('notifications').insert({
      user_id: assignTo,
      title: `Hermes assigned: "${title}"`,
      module: 'system',
      severity: 'action_needed',
      action_url: `/#/tasks/${record.id}`,
      source_key: `task_assigned:${record.id}`,
    })
  }

  return { ok: true, task: { id: record.id, title } }
}

async function actionUpdateTask(payload: any) {
  const taskId = String(payload?.taskId || '')
  if (!taskId) throw new Error('taskId is required')

  // Guardrail: Hermes may only update tasks assigned to it. Prevents a
  // compromised/misbehaving agent from editing arbitrary human tasks.
  const hermesId = await getHermesProfileId()
  const existing = await airtable('GET', TASKS_BASE, TASKS_TABLE, `/${taskId}?returnFieldsByFieldId=true`)
  if (existing.fields[TF.USER_ID] !== hermesId) {
    throw new Error('task is not assigned to Hermes — refusing to update')
  }

  const fields: Record<string, unknown> = {}
  if (payload?.status)  fields[TF.STATUS]  = String(payload.status)
  if (payload?.notes != null) fields[TF.NOTES] = String(payload.notes)
  if (payload?.status === 'Done') fields[TF.COMPLETED_AT] = new Date().toISOString()
  if (Object.keys(fields).length === 0) throw new Error('nothing to update')

  await airtable('PATCH', TASKS_BASE, TASKS_TABLE, `/${taskId}`, { fields, typecast: true })
  return { ok: true, taskId }
}

// Real Documents table schema (verified against the live base via the meta
// API — there is no Summary/AI Summary/Category/Title field, despite what
// some frontend fallback chains guess at): Name, Attachments, Needs Cleanup,
// IsMail, Sender, Recipient, OCR, Description, Date, Document Type, Tags,
// Shared, Duplicate, Action Required, Action Done.

async function actionSearchDocuments(payload: any) {
  const q     = String(payload?.query || '').trim()
  const limit = Math.min(Number(payload?.limit) || 20, 50)

  let formula = ''
  if (q) {
    const esc = q.replace(/'/g, "\\'")
    formula = `OR(FIND(LOWER('${esc}'), LOWER({Name})), FIND(LOWER('${esc}'), LOWER({OCR})), FIND(LOWER('${esc}'), LOWER({Description})), FIND(LOWER('${esc}'), LOWER({Action Required})))`
  }
  if (payload?.tag) {
    const escTag = String(payload.tag).replace(/'/g, "\\'")
    const tagClause = `FIND('${escTag}', {Tags})`
    formula = formula ? `AND(${formula}, ${tagClause})` : tagClause
  }

  const qs = formula ? `?filterByFormula=${encodeURIComponent(formula)}&pageSize=${limit}` : `?pageSize=${limit}`
  const data = await airtable('GET', DOCS_BASE, await getDocsTable(), qs)

  const docs = (data.records || []).map((r: any) => ({
    id:            r.id,
    name:          r.fields['Name'] || 'Untitled',
    documentType:  r.fields['Document Type'] || '',
    date:          r.fields['Date'] || '',
    tags:          String(r.fields['Tags'] || '').split(',').map((t: string) => t.trim()).filter(Boolean),
    description:   r.fields['Description'] || '',
    actionRequired: r.fields['Action Required'] || '',
    actionDone:    r.fields['Action Done'] === true,
    isMail:        r.fields['IsMail'] === true,
  }))
  return { ok: true, documents: docs }
}

async function actionGetDocument(payload: any) {
  const id = String(payload?.id || '')
  if (!id) throw new Error('id is required')
  const r = await airtable('GET', DOCS_BASE, await getDocsTable(), `/${id}`)
  const f = r.fields || {}
  const attachments = f['Attachments'] || []
  return {
    ok: true,
    document: {
      id: r.id,
      name:           f['Name'] || 'Untitled',
      documentType:   f['Document Type'] || '',
      date:           f['Date'] || '',
      description:    f['Description'] || '',
      ocr:            f['OCR'] || '',
      actionRequired: f['Action Required'] || '',
      actionDone:     f['Action Done'] === true,
      isMail:         f['IsMail'] === true,
      sender:         f['Sender'] || '',
      recipient:      f['Recipient'] || '',
      tags:           String(f['Tags'] || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      shared:         f['Shared'] === true,
      duplicate:      f['Duplicate'] === true,
      // Airtable attachment URLs expire — fetch promptly if content is needed.
      attachments: attachments.map((a: any) => ({ filename: a.filename, url: a.url, type: a.type })),
    },
  }
}

const ACTIONS: Record<string, (payload: any) => Promise<unknown>> = {
  ping:             actionPing,
  list_tasks:       actionListTasks,
  create_task:      actionCreateTask,
  update_task:      actionUpdateTask,
  search_documents: actionSearchDocuments,
  get_document:     actionGetDocument,
}

// ── Entry point ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  if (!HERMES_API_KEY) return json({ ok: false, error: 'HERMES_API_KEY not configured on the server' }, 500)
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${HERMES_API_KEY}`) return json({ ok: false, error: 'Unauthorized' }, 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Body must be JSON' }, 400)
  }

  const action = String(body?.action || '')
  const handler = ACTIONS[action]
  if (!handler) return json({ ok: false, error: `Unknown action: ${action}. Valid: ${Object.keys(ACTIONS).join(', ')}` }, 400)

  try {
    const result = await handler(body)
    if (action !== 'ping') await logCall(action, body, { ok: true })
    return json(result)
  } catch (err: any) {
    const message = err?.message || String(err)
    console.error(`[hermes-gateway] ${action} failed:`, message)
    if (action !== 'ping') await logCall(action, body, { ok: false, error: message })
    return json({ ok: false, error: message }, 400)
  }
})
