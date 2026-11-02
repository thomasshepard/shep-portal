import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { shareCall } from '../lib/workstreamShare'
import { byOrder } from '../lib/workstreams'

/**
 * The checklist behind a public share link. Same shape as useWorkstreamTasks
 * (optimistic, rolls back with a toast) but every call goes through the
 * workstream-share edge function, authorised by the link token alone.
 * `name` is whatever the visitor typed; it's stamped on tasks they add or finish.
 */
export default function useSharedTasks(token, name) {
  const [workstream, setWorkstream] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null) // { message, code }
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  const nameRef = useRef(name)
  useEffect(() => { nameRef.current = name }, [name])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await shareCall(token, 'get')
      setWorkstream(data.workstream)
      setTasks(data.tasks)
      setError(null)
    } catch (e) {
      // A background refresh failing shouldn't blank a page that's already showing tasks.
      if (!quiet) setError({ message: e.message, code: e.code })
    }
    if (!quiet) setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  // Pick up other people's changes when the tab comes back into view.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load({ quiet: true }) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const grouped = useMemo(() => {
    const open = tasks.filter(t => !t.done).sort(byOrder)
    const done = tasks.filter(t => t.done).sort(byOrder)
    return { open, done, total: tasks.length }
  }, [tasks])

  const patch = (id, fields) => setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...fields } : t)))
  const replace = task => setTasks(prev => prev.map(t => (t.id === task.id ? task : t)))

  const toggle = useCallback(async (id, done) => {
    const task = tasksRef.current.find(t => t.id === id)
    if (!task) return
    const makeDone = done ?? !task.done
    const who = nameRef.current || ''
    patch(id, { done: makeDone, completedBy: makeDone ? who : '' })
    try {
      const data = await shareCall(token, 'toggle', { taskId: id, done: makeDone, name: who })
      replace(data.task)
    } catch (e) {
      patch(id, { done: task.done, completedBy: task.completedBy })
      toast.error(e.message || 'Could not update the task')
    }
  }, [token])

  const update = useCallback(async (id, { title, due, notes }) => {
    const task = tasksRef.current.find(t => t.id === id)
    if (!task) return false
    const next = {}
    if (title !== undefined) next.title = title.trim() || task.title
    if (due !== undefined) next.due = due || ''
    if (notes !== undefined) next.notes = notes.trim()
    const prev = Object.fromEntries(Object.keys(next).map(k => [k, task[k]]))
    patch(id, next)
    try {
      const data = await shareCall(token, 'update', { taskId: id, ...next })
      replace(data.task)
      return true
    } catch (e) {
      patch(id, prev)
      toast.error(e.message || 'Could not save the task')
      return false
    }
  }, [token])

  const remove = useCallback(async id => {
    const task = tasksRef.current.find(t => t.id === id)
    if (!task) return
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await shareCall(token, 'delete', { taskId: id })
    } catch (e) {
      setTasks(prev => [...prev, task])
      toast.error(e.message || 'Could not delete the task')
    }
  }, [token])

  // Matches the (ws, titles) signature WorkstreamTasks expects; ws is unused here.
  const add = useCallback(async (_ws, titles) => {
    try {
      const data = await shareCall(token, 'add', { titles, name: nameRef.current || '' })
      setTasks(prev => [...prev, ...data.tasks])
      return data.tasks.length
    } catch (e) {
      toast.error(e.message || 'Could not add the task')
      return 0
    }
  }, [token])

  // Turnover templates are an admin convenience; not offered on shared links.
  const applyTurnover = useCallback(async () => 0, [])

  const actions = useMemo(
    () => ({ toggle, update, remove, add, applyTurnover }),
    [toggle, update, remove, add, applyTurnover],
  )

  return { workstream, tasks: grouped, loading, error, reload: load, actions }
}
