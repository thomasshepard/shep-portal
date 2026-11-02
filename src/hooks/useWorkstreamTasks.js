import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FIELDS as TF, fetchWorkstreamTasks, createTasksBatch, updateTask, deleteTask } from '../lib/tasks'
import { groupTasks, taskView, TURNOVER_TEMPLATE, turnoverSourceKey } from '../lib/workstreams'

function localToday() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const PROPERTY_TYPES = ['Vacancy', 'Flip', 'Acquisition']

/**
 * Checklist tasks for workstreams. Every mutation is optimistic and rolls back
 * (with a toast) if Airtable rejects it, so ticking things off from a phone feels instant.
 */
export default function useWorkstreamTasks(userId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Callbacks read the latest records through a ref so a deferred action (e.g. toast "Undo") never sees stale state.
  const recordsRef = useRef(records)
  useEffect(() => { recordsRef.current = records }, [records])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRecords(await fetchWorkstreamTasks())
    } catch (e) {
      setError(e.message || 'Could not load tasks')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  const grouped = useMemo(() => groupTasks(records), [records])

  const patch = (id, fields) =>
    setRecords(prev => prev.map(r => (r.id === id ? { ...r, fields: { ...r.fields, ...fields } } : r)))

  // done: true/false forces a state (used by Undo); omitted = flip the current one.
  const toggle = useCallback(async (id, done) => {
    const rec = recordsRef.current.find(r => r.id === id)
    if (!rec) return
    const makeDone = done ?? rec.fields[TF.STATUS] !== 'Done'
    const prev = { [TF.STATUS]: rec.fields[TF.STATUS], [TF.COMPLETED_AT]: rec.fields[TF.COMPLETED_AT] ?? null }
    const next = { [TF.STATUS]: makeDone ? 'Done' : 'To Do', [TF.COMPLETED_AT]: makeDone ? localToday() : null }
    patch(id, next)
    try {
      await updateTask(id, next)
    } catch {
      patch(id, prev)
      toast.error('Could not update the task')
    }
  }, [])

  const update = useCallback(async (id, { title, due, notes }) => {
    const rec = recordsRef.current.find(r => r.id === id)
    if (!rec) return false
    const next = {}
    if (title !== undefined) next[TF.TITLE] = title.trim() || rec.fields[TF.TITLE]
    if (due !== undefined) next[TF.DUE_DATE] = due || null
    if (notes !== undefined) next[TF.NOTES] = notes.trim() || null
    const prev = Object.fromEntries(Object.keys(next).map(k => [k, rec.fields[k] ?? null]))
    patch(id, next)
    try {
      await updateTask(id, next)
      return true
    } catch {
      patch(id, prev)
      toast.error('Could not save the task')
      return false
    }
  }, [])

  const remove = useCallback(async id => {
    const rec = recordsRef.current.find(r => r.id === id)
    if (!rec) return
    setRecords(prev => prev.filter(r => r.id !== id))
    try {
      await deleteTask(id)
    } catch {
      setRecords(prev => [...prev, rec])
      toast.error('Could not delete the task')
    }
  }, [])

  // items: [{ title, sourceKey? }]
  const addMany = useCallback(async (ws, items) => {
    if (!items.length) return 0
    const own = recordsRef.current.map(taskView).filter(t => t.workstream === ws.id)
    let order = own.reduce((m, t) => (t.order === Number.MAX_SAFE_INTEGER ? m : Math.max(m, t.order)), 0)
    const module = PROPERTY_TYPES.includes(ws.fields?.Type) ? 'Properties' : 'Manual'
    const payload = items.map(it => {
      order += 1
      const f = {
        [TF.TITLE]: it.title,
        [TF.STATUS]: 'To Do',
        [TF.USER_ID]: userId,
        [TF.MODULE]: module,
        [TF.WORKSTREAM]: ws.id,
        [TF.WS_ORDER]: order,
        [TF.ACTION_URL]: `/#/workstreams?ws=${ws.id}`,
      }
      if (it.sourceKey) f[TF.SOURCE_KEY] = it.sourceKey
      return f
    })
    try {
      const created = await createTasksBatch(payload)
      setRecords(prev => [...prev, ...created])
      return created.length
    } catch (e) {
      toast.error('Could not add tasks: ' + (e.message || 'unknown error'))
      return 0
    }
  }, [userId])

  const add = useCallback((ws, titles) => addMany(ws, titles.map(title => ({ title }))), [addMany])

  const applyTurnover = useCallback(async ws => {
    const have = new Set(recordsRef.current.map(taskView).filter(t => t.workstream === ws.id).map(t => t.sourceKey))
    const items = TURNOVER_TEMPLATE
      .map((title, i) => ({ title, sourceKey: turnoverSourceKey(ws.id, i) }))
      .filter(it => !have.has(it.sourceKey))
    return addMany(ws, items)
  }, [addMany])

  return { grouped, loading, error, reload: load, toggle, update, remove, add, applyTurnover }
}
