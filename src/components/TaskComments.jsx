import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notifications'

const safeStr = v => (v == null ? '' : String(v))

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  if (h < 24)  return `${h}h ago`
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

export default function TaskComments({ taskId, taskAssigneeId, currentUserId, taskTitle, onToast }) {
  const [comments,  setComments]  = useState([])
  const [profiles,  setProfiles]  = useState({})
  const [body,      setBody]      = useState('')
  const [loading,   setLoading]   = useState(true)
  const [posting,   setPosting]   = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!taskId) return
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (!mounted) return
      const comments = data || []
      setComments(comments)
      setLoading(false)

      // Fetch author profiles
      const authorIds = [...new Set(comments.map(c => c.author_id))]
      if (authorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', authorIds)
        if (mounted) {
          setProfiles(Object.fromEntries((profs || []).map(p => [p.id, p.full_name || 'User'])))
        }
      }
    }

    load()

    // Real-time subscription
    const channel = supabase
      .channel(`task_comments:${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` },
        async (payload) => {
          if (!mounted) return
          setComments(prev => [...prev, payload.new])
          // Fetch new author profile if not cached
          const authorId = payload.new.author_id
          setProfiles(prev => {
            if (prev[authorId]) return prev
            supabase.from('profiles').select('id, full_name').eq('id', authorId).single()
              .then(({ data }) => {
                if (data) setProfiles(p => ({ ...p, [data.id]: data.full_name || 'User' }))
              })
            return prev
          })
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      )
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [taskId])

  async function handlePost(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text || posting || !currentUserId) return
    setPosting(true)
    setBody('')

    const { data: inserted, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: currentUserId, body: text })
      .select()
      .single()

    if (error) {
      onToast?.('Failed to post comment')
      setBody(text)
    } else {
      // Notify task assignee if different from commenter
      if (taskAssigneeId && taskAssigneeId !== currentUserId) {
        const authorName = profiles[currentUserId] || 'Someone'
        notify({
          userIds:   taskAssigneeId,
          title:     `${authorName} commented on "${taskTitle}"`,
          body:      text.slice(0, 100),
          module:    'system',
          category:  'tasks',
          severity:  'info',
          actionUrl: `/#/tasks/${taskId}`,
          sourceKey: `task_comment:${inserted?.id}`,
        }).catch(() => {})
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setPosting(false)
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Activity {comments.length > 0 && <span className="font-normal normal-case text-slate-400">({comments.length})</span>}
      </p>

      {loading ? (
        <div className="h-8 flex items-center">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-xs text-slate-400">No comments yet</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {(profiles[c.author_id] || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-slate-700">{profiles[c.author_id] || 'User'}</span>
                    <span className="text-[10px] text-slate-400">{relTime(c.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 break-words">{c.body}</p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <form onSubmit={handlePost} className="flex gap-2">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handlePost(e) }}
        />
        <button
          type="submit"
          disabled={!body.trim() || posting}
          className="text-xs font-medium px-3 py-1.5 bg-slate-900 text-white rounded-lg disabled:opacity-40"
        >
          Post
        </button>
      </form>
    </div>
  )
}
