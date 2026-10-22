import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, Search, Eye, EyeOff, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { createRecord, updateRecord, deleteRecord } from '../lib/airtable'
import { CC_BASE_ID } from '../lib/statements'

const TABLE = 'Debit cards'
const ENTITY = 'Entity'
const OWNERS = ['Thomas', 'Gabrielle']
const TYPES = ['Checking', 'Savings']
const STATUSES = ['Active', 'Inactive', 'Frozen / Closed']
const FORMATS = ['Physical', 'Virtual']
const EMPTY = { [ENTITY]: 'Personal', Bank: '', 'Card Number': '', CVV: '', Owner: 'Thomas', 'Account Type': 'Checking', 'Card Format': 'Physical', Expiration: '', Status: 'Active' }

const safeStr = (v, f = '') => (v == null ? f : String(v))
const arr = (v) => (Array.isArray(v) ? v : [])
const last4 = (f) => safeStr(f['Card Number']).replace(/\D/g, '').slice(-4) || safeStr(f['Last 4'])
const expMMYY = (d) => {
  const m = safeStr(d).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[2]}/${m[1].slice(2)}` : ''
}
const fmtNumber = (n) => safeStr(n).replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()
const label = (f) => [f.Bank, last4(f) && `•••• ${last4(f)}`].filter(Boolean).join(' ') || 'Debit card'

const statusTone = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-yellow-100 text-yellow-700',
  'Frozen / Closed': 'bg-red-100 text-red-700',
}

export default function DebitCards({ cards, onChanged }) {
  const [editing, setEditing] = useState(null) // null | { id?, form }
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [entityFilter, setEntityFilter] = useState('All')
  const [revealed, setRevealed] = useState(() => new Set())

  const toggleReveal = (id) => setRevealed((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error('Copy failed')
    }
  }

  const entities = useMemo(
    () => [...new Set(arr(cards).map((c) => safeStr(c.fields?.[ENTITY])).filter(Boolean))].sort(),
    [cards],
  )

  const rows = arr(cards)
    .filter((c) => entityFilter === 'All' || safeStr(c.fields?.[ENTITY]) === entityFilter)
    .filter((c) => {
      const f = c.fields || {}
      return [f.Bank, last4(f), f[ENTITY]].join(' ').toLowerCase().includes(q.toLowerCase())
    })

  const byEntity = {}
  for (const c of rows) (byEntity[safeStr(c.fields?.[ENTITY], 'Unassigned')] ||= []).push(c)

  function openNew() { setEditing({ form: { ...EMPTY } }) }
  function openEdit(c) {
    const f = c.fields || {}
    setEditing({ id: c.id, form: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, safeStr(f[k])])) })
  }

  async function save() {
    const form = editing.form
    if (!safeStr(form[ENTITY]).trim()) return toast.error('Pick an LLC or Personal')
    const fields = {}
    for (const [k, v] of Object.entries(form)) if (v !== '') fields[k] = v
    const digits = safeStr(form['Card Number']).replace(/\D/g, '')
    if (digits) fields['Card Number'] = digits
    fields.Name = label(fields) // Airtable primary field; derived, not entered
    setSaving(true)
    const res = editing.id
      ? await updateRecord(TABLE, editing.id, fields, CC_BASE_ID)
      : await createRecord(TABLE, fields, CC_BASE_ID)
    setSaving(false)
    if (res.error) return toast.error('Save failed: ' + res.error)
    toast.success('Saved')
    setEditing(null)
    onChanged()
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${label(c.fields || {})}"?`)) return
    const res = await deleteRecord(TABLE, c.id, CC_BASE_ID)
    if (res.error) return toast.error('Delete failed: ' + res.error)
    toast.success('Deleted')
    onChanged()
  }

  const set = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bank, last 4, LLC…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2"
        >
          <option>All</option>
          {entities.map((e) => <option key={e}>{e}</option>)}
        </select>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-sm font-medium bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700"
        >
          <Plus size={14} /> Add debit card
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No debit cards found.</p>
      )}

      {Object.entries(byEntity).map(([entity, list]) => (
        <div key={entity}>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{entity}</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.map((c) => {
              const f = c.fields || {}
              const status = safeStr(f.Status)
              return (
                <div key={c.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{label(f)}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {[f['Account Type'], f['Card Format'], f.Owner, f.Expiration && `exp ${f.Expiration}`]
                        .filter(Boolean).map(safeStr).join(' · ')}
                    </p>
                  </div>
                  {status && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusTone[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
                  )}
                  <button
                    onClick={() => toggleReveal(c.id)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    {revealed.has(c.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    {revealed.has(c.id) ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-slate-700" aria-label="Edit"><Pencil size={15} /></button>
                  <button onClick={() => remove(c)} className="text-slate-400 hover:text-red-600" aria-label="Delete"><Trash2 size={15} /></button>
                </div>
                {revealed.has(c.id) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ['Card number', safeStr(f['Card Number']).replace(/\D/g, ''), fmtNumber(f['Card Number'])],
                      ['Expiry', expMMYY(f.Expiration), expMMYY(f.Expiration)],
                      ['CVV', safeStr(f.CVV), safeStr(f.CVV)],
                    ].map(([what, raw, shown]) => (
                      <button
                        key={what}
                        disabled={!raw}
                        onClick={() => copy(raw, what)}
                        title={`Click to copy ${what}`}
                        className="flex items-center gap-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
                      >
                        <span className="text-[10px] font-sans uppercase tracking-wide text-slate-400">{what}</span>
                        {shown || '—'}
                        <Copy size={12} className="text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{editing.id ? 'Edit' : 'Add'} debit card</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <Field label="LLC / Personal">
              <input className={inp} list="debit-entities" value={editing.form[ENTITY]} onChange={(e) => set(ENTITY, e.target.value)} />
              <datalist id="debit-entities">
                {[...new Set(['Personal', ...entities])].map((e) => <option key={e} value={e} />)}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank"><input className={inp} value={editing.form.Bank} onChange={(e) => set('Bank', e.target.value)} /></Field>
              <div className="col-span-2">
                <Field label="Card number"><input className={inp} inputMode="numeric" autoComplete="off" value={editing.form['Card Number']} onChange={(e) => set('Card Number', e.target.value)} /></Field>
              </div>
              <Field label="Owner"><Select value={editing.form.Owner} options={OWNERS} onChange={(v) => set('Owner', v)} /></Field>
              <Field label="Account type"><Select value={editing.form['Account Type']} options={TYPES} onChange={(v) => set('Account Type', v)} /></Field>
              <Field label="Physical / Virtual"><Select value={editing.form['Card Format']} options={FORMATS} onChange={(v) => set('Card Format', v)} /></Field>
              <Field label="CVV"><input className={inp} inputMode="numeric" autoComplete="off" maxLength={4} value={editing.form.CVV} onChange={(e) => set('CVV', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Expiration"><input type="date" className={inp} value={editing.form.Expiration} onChange={(e) => set('Expiration', e.target.value)} /></Field>
              <Field label="Status"><Select value={editing.form.Status} options={STATUSES} onChange={(v) => set('Status', v)} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="text-sm px-3 py-2 text-slate-600">Cancel</button>
              <button
                onClick={save} disabled={saving}
                className="text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Select({ value, options, onChange }) {
  return (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}
