import { useEffect } from 'react'
import TaskDetailView from './TaskDetailView'

/**
 * Right-side slide-over on desktop, bottom sheet on mobile.
 * Closes on Escape key or backdrop click.
 *
 * Props:
 *   task        — Airtable task record
 *   onClose     — () => void
 *   onUpdate    — async (recordId, fields) => void
 *   onDelete    — async (task) => void
 *   onToast     — (msg) => void
 *   onOpenFull  — () => void  (navigates to /tasks/:id/full)
 *   currentUserId — string
 */
export default function TaskDrawer({ task, onClose, onUpdate, onDelete, onToast, onOpenFull, currentUserId }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed z-50 bg-white shadow-2xl flex flex-col
          inset-x-0 bottom-0 rounded-t-2xl max-h-[92vh]
          md:inset-y-0 md:right-0 md:left-auto md:w-[480px] md:rounded-none md:max-h-none"
        style={{ animation: 'drawerIn 0.2s ease-out forwards' }}
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
      >
        <style>{`
          @keyframes drawerIn {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @media (min-width: 768px) {
            @keyframes drawerIn {
              from { opacity: 0; transform: translateX(40px); }
              to   { opacity: 1; transform: translateX(0); }
            }
          }
        `}</style>

        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1 md:hidden flex-shrink-0" />

        <TaskDetailView
          task={task}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={onClose}
          onToast={onToast}
          onOpenFull={onOpenFull}
          variant="drawer"
          currentUserId={currentUserId}
        />
      </div>
    </>
  )
}
