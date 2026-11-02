// workstream-share — public, logged-out endpoint behind the /#/share/<token> page.
// Deployed WITHOUT jwt verification (--no-verify-jwt): family members opening a
// shared checklist are never signed in.
//
// Auth is the share token alone (public.workstream_share_links, 256-bit random,
// admin-created, revocable). A token is bound to exactly ONE workstream, so every
// action below is scoped to tasks whose Workstream field equals that record ID:
// the caller never supplies a base, table, field or formula, only a task ID, and a
// task ID is only honoured after we re-read the record and confirm it belongs to
// the token's workstream. Keep it an explicit allowlist — never a generic
// Airtable passthrough.
//
// Body: { token, action, ...payload }
//   get                                   → { workstream: { name }, tasks[] }
//   toggle { taskId, done, name? }
//   update { taskId, title?, due?, notes? }
//   delete { taskId }
//   add    { titles: string[], name? }    → { tasks[] } (the created tasks)
// Expected failures (bad/revoked link, unknown task) come back as HTTP 200
// { error, code } so the page can show a friendly message.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT') ?? ''
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const TASKS_BASE  = 'appYVLCn1NVLevdry'
const TASKS_TABLE = 'tbl3Di18kSLwEj1vN'
const PM_BASE     = 'appeuX9BHNgVXxdYZ'
const WS_TABLE    = 'tbltuSfVX14riFCXH'

// Task field IDs — must match src/lib/tasks.js FIELDS.
const TF = {
  TITLE:        'fldx2xmuxOVDls72i',
  STATUS:       'fldWNIkplM2WKr0kq',
  MODULE:       'fldR1DLAM4fEVDSws',
  DUE_DATE:     'fldLxGJRu1XeK4z7t',
  NOTES:        'fldJxZkDj1EI1WaKl',
  ACTION_URL:   'fldNzqMx8txSraQCY',
  USER_ID:      'fldTjTxZgy6RZHyaf',
  COMPLETED_AT: 'fldK1GKFJSdceoVtT',
  WORKSTREAM:   'fldCon6trmhdKj3nr',
  WS_ORDER:     'fldOVL4rRmjGvj8qw',
  ADDED_BY:     'fldL44oi9SmnGgYKG',
  COMPLETED_BY: 'fldCoLBTf1jlGp75w',
}

const TOKEN_RE   = /^[A-Za-z0-9_-]{43}$/
const REC_RE     = /^rec[A-Za-z0-9]{14}$/
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/
const PROPERTY_TYPES = ['Vacancy', 'Flip', 'Acquisition']
const MAX_TASKS_PER_WORKSTREAM = 300
const MAX_ADD_AT_ONCE = 25

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

class ShareError extends Error {
  code: string
  constructor(message: string, code = 'bad_request') { super(message); this.code = code }
}

async function airtable(method: string, base: string, table: string, path = '', body?: unknown) {
  const res = await fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    method,
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.error('[workstream-share] airtable', method, table, res.status, JSON.stringify(data)?.slice(0, 300))
    throw new Error(`Airtable ${method} failed (${res.status})`)
  }
  return data
}

function view(r: any) {
  const f = r.fields ?? {}
  return {
    id: r.id,
    title: f[TF.TITLE] || 'Untitled task',
    done: f[TF.STATUS] === 'Done',
    due: f[TF.DUE_DATE] || '',
    notes: f[TF.NOTES] || '',
    order: typeof f[TF.WS_ORDER] === 'number' ? f[TF.WS_ORDER] : Number.MAX_SAFE_INTEGER,
    addedBy: f[TF.ADDED_BY] || '',
    completedBy: f[TF.COMPLETED_BY] || '',
    created: r.createdTime || '',
  }
}

async function listTasks(wsId: string) {
  const formula = encodeURIComponent(`{Workstream}='${wsId}'`)
  const out: any[] = []
  let offset: string | undefined
  do {
    const path = `?returnFieldsByFieldId=true&filterByFormula=${formula}${offset ? `&offset=${offset}` : ''}`
    const data = await airtable('GET', TASKS_BASE, TASKS_TABLE, path)
    out.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)
  return out
}

async function getWorkstream(wsId: string) {
  try {
    const rec = await airtable('GET', PM_BASE, WS_TABLE, `/${wsId}`)
    return { name: String(rec.fields?.Name ?? 'Checklist'), type: String(rec.fields?.Type ?? '') }
  } catch {
    throw new ShareError('This checklist is no longer available.', 'gone')
  }
}

// Only touch a task after confirming it belongs to this link's workstream.
async function ownedTask(wsId: string, taskId: unknown) {
  const id = String(taskId ?? '')
  if (!REC_RE.test(id)) throw new ShareError('Unknown task.', 'not_found')
  let rec: any
  try {
    rec = await airtable('GET', TASKS_BASE, TASKS_TABLE, `/${id}?returnFieldsByFieldId=true`)
  } catch {
    throw new ShareError('Unknown task.', 'not_found')
  }
  if (rec.fields?.[TF.WORKSTREAM] !== wsId) throw new ShareError('Unknown task.', 'not_found')
  return rec
}

const cleanName  = (v: unknown) => String(v ?? '').trim().slice(0, 60)
const cleanTitle = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)

function centralToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

// ── Actions ──────────────────────────────────────────────────────────────

async function actionGet(link: any) {
  const [ws, records] = await Promise.all([getWorkstream(link.workstream_id), listTasks(link.workstream_id)])
  return { workstream: { name: ws.name }, tasks: records.map(view) }
}

async function actionToggle(link: any, p: any) {
  const rec = await ownedTask(link.workstream_id, p.taskId)
  const done = p.done === true
  const fields: Record<string, unknown> = {
    [TF.STATUS]: done ? 'Done' : 'To Do',
    [TF.COMPLETED_AT]: done ? centralToday() : null,
    [TF.COMPLETED_BY]: done ? (cleanName(p.name) || null) : null,
  }
  const data = await airtable('PATCH', TASKS_BASE, TASKS_TABLE, `/${rec.id}?returnFieldsByFieldId=true`, { fields, typecast: true })
  return { task: view(data) }
}

async function actionUpdate(link: any, p: any) {
  const rec = await ownedTask(link.workstream_id, p.taskId)
  const fields: Record<string, unknown> = {}
  if (p.title !== undefined) {
    const title = cleanTitle(p.title)
    if (!title) throw new ShareError('A task needs a name.')
    fields[TF.TITLE] = title
  }
  if (p.due !== undefined) {
    if (p.due && !DATE_RE.test(String(p.due))) throw new ShareError('Invalid date.')
    fields[TF.DUE_DATE] = p.due || null
  }
  if (p.notes !== undefined) {
    fields[TF.NOTES] = String(p.notes ?? '').trim().slice(0, 2000) || null
  }
  if (!Object.keys(fields).length) return { task: view(rec) }
  const data = await airtable('PATCH', TASKS_BASE, TASKS_TABLE, `/${rec.id}?returnFieldsByFieldId=true`, { fields, typecast: true })
  return { task: view(data) }
}

async function actionDelete(link: any, p: any) {
  const rec = await ownedTask(link.workstream_id, p.taskId)
  await airtable('DELETE', TASKS_BASE, TASKS_TABLE, `/${rec.id}`)
  return { ok: true }
}

async function actionAdd(link: any, p: any) {
  const titles = (Array.isArray(p.titles) ? p.titles : []).map(cleanTitle).filter(Boolean).slice(0, MAX_ADD_AT_ONCE)
  if (!titles.length) throw new ShareError('Type a task to add.')
  const [ws, existing] = await Promise.all([getWorkstream(link.workstream_id), listTasks(link.workstream_id)])
  if (existing.length + titles.length > MAX_TASKS_PER_WORKSTREAM) {
    throw new ShareError('This checklist is full. Ask Thomas to clear out some tasks.', 'limit')
  }
  let order = existing.reduce((m, r) => {
    const o = r.fields?.[TF.WS_ORDER]
    return typeof o === 'number' ? Math.max(m, o) : m
  }, 0)
  const name = cleanName(p.name)
  const module = PROPERTY_TYPES.includes(ws.type) ? 'Properties' : 'Manual'
  const records = titles.map((title: string) => {
    order += 1
    const fields: Record<string, unknown> = {
      [TF.TITLE]: title,
      [TF.STATUS]: 'To Do',
      [TF.USER_ID]: link.created_by,
      [TF.MODULE]: module,
      [TF.WORKSTREAM]: link.workstream_id,
      [TF.WS_ORDER]: order,
      [TF.ACTION_URL]: `/#/workstreams?ws=${link.workstream_id}`,
    }
    if (name) fields[TF.ADDED_BY] = name
    return { fields }
  })
  const created: any[] = []
  for (let i = 0; i < records.length; i += 10) {
    const data = await airtable('POST', TASKS_BASE, TASKS_TABLE, '', {
      records: records.slice(i, i + 10), typecast: true, returnFieldsByFieldId: true,
    })
    created.push(...(data.records ?? []))
  }
  return { tasks: created.map(view) }
}

const ACTIONS: Record<string, (link: any, p: any) => Promise<unknown>> = {
  get: actionGet,
  toggle: actionToggle,
  update: actionUpdate,
  delete: actionDelete,
  add: actionAdd,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => null)
    const token = String(body?.token ?? '')
    const action = String(body?.action ?? '')
    if (!TOKEN_RE.test(token) || !ACTIONS[action]) return json({ error: 'Bad request', code: 'bad_request' }, 400)

    const { data: link, error } = await sb
      .from('workstream_share_links')
      .select('id, workstream_id, created_by, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (error) throw error
    if (!link || link.revoked_at) return json({ error: 'This link is no longer active.', code: 'revoked' })

    const result = await ACTIONS[action](link, body)

    if (action === 'get') {
      sb.from('workstream_share_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id)
        .then(({ error: e }) => { if (e) console.error('[workstream-share] last_used_at:', e.message) })
    }
    return json(result)
  } catch (e) {
    if (e instanceof ShareError) return json({ error: e.message, code: e.code })
    console.error('[workstream-share]', e)
    return json({ error: 'Something went wrong. Try again.', code: 'server' }, 500)
  }
})
