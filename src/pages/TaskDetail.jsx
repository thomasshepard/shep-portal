import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchTaskById, updateTask, deleteTask, FIELDS } from '../lib/tasks'
import TaskDetailView from '../components/TaskDetailView'

export default function TaskDetail() {
  const { taskId }  = useParams()
  const navigate    = useNavigate()
  const { session } = useAuth()
  const userId      = session?.user?.id

  const [task,    setTask]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState(null)

  useEffect(() => {
    if (!taskId) return
    fetchTaskById(taskId)
      .then(setTask)
      .catch(() => setTask(null))
      .finally(() => setLoading(false))
  }, [taskId])

  async function handleUpdate(recordId, fields) {
    setTask(prev => prev ? { ...prev, fields: { ...prev.fields, ...fields } } : prev)
    try { await updateTask(recordId, fields) }
    catch { setToast('Failed to save') }
  }

  async function handleDelete(t) {
    try {
      await deleteTask(t.id)
      navigate('/tasks')
    } catch {
      setToast('Failed to delete')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-slate-500 mb-4">Task not found.</p>
        <button onClick={() => navigate('/tasks')} className="text-sm text-amber-600 hover:text-amber-800">
          ← Back to all tasks
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ minHeight: '60vh' }}>
        <TaskDetailView
          task={task}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onClose={() => navigate('/tasks')}
          onToast={showToast}
          variant="page"
          currentUserId={userId}
        />
      </div>
    </div>
  )
}
