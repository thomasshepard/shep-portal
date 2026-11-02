import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Send, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { newShareToken, shareUrl } from '../lib/workstreamShare'

function fmtWhen(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Admin-only: create / copy / revoke public links to one workstream's checklist.
 * Rows live in workstream_share_links (RLS: admins only).
 */
export default function WorkstreamShareLinks({ ws, userId }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const name = ws.fields?.Name || 'Checklist'

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from('workstream_share_links')
      .select('id, token, label, created_at, last_used_at')
      .eq('workstream_id', ws.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: true })
    if (e) setError(e.message)
    else { setError(''); setLinks(data || []) }
    setLoading(false)
  }, [ws.id])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  async function create() {
    if (busy) return
    setBusy(true)
    const { data, error: e } = await supabase
      .from('workstream_share_links')
      .insert({
        workstream_id: ws.id,
        workstream_name: name,
        token: newShareToken(),
        label: label.trim() || null,
        created_by: userId,
      })
      .select('id, token, label, created_at, last_used_at')
      .single()
    setBusy(false)
    if (e) { toast.error('Could not create the link: ' + e.message); return }
    setLinks(prev => [...prev, data])
    setLabel('')
    copy(data.token)
  }

  async function copy(token) {
    try {
      await navigator.clipboard.writeText(shareUrl(token))
      toast.success('Link copied')
    } catch {
      window.prompt('Copy this link:', shareUrl(token))
    }
  }

  async function send(link) {
    try {
      await navigator.share({ title: name, text: `${name} checklist`, url: shareUrl(link.token) })
    } catch { /* cancelled */ }
  }

  async function revoke(link) {
    const who = link.label ? `"${link.label}"` : 'this link'
    if (!window.confirm(`Turn off ${who}? Anyone using it loses access immediately.`)) return
    const { error: e } = await supabase
      .from('workstream_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', link.id)
    if (e) { toast.error('Could not revoke: ' + e.message); return }
    setLinks(prev => prev.filter(l => l.id !== link.id))
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      <p className="text-sm text-gray-600">
        Anyone with a link can see, check off, add, edit and delete the tasks in <b>{name}</b> — nothing else in the portal.
        Make one link per person so you can turn off just theirs.
      </p>

      {error && (
        <p className="text-sm text-red-600">
          Couldn’t load links: {error}. If this is the first time, run the 20261102_workstream_share_links.sql migration.
        </p>
      )}

      <form onSubmit={e => { e.preventDefault(); create() }} className="flex gap-2">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Who is it for? (e.g. Mom)"
          aria-label="Link label"
          className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-gray-300 px-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !!error}
          className="flex-shrink-0 inline-flex items-center gap-2 min-h-[48px] px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          <Link2 size={16} /> Create link
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-gray-500">No links yet.</p>
      ) : (
        <ul className="space-y-2">
          {links.map(l => (
            <li key={l.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 truncate">{l.label || 'Unnamed link'}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {l.last_used_at ? `last opened ${fmtWhen(l.last_used_at)}` : `made ${fmtWhen(l.created_at)}, not opened yet`}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => copy(l.token)}
                  className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
                >
                  <Copy size={16} /> Copy link
                </button>
                {typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={() => send(l)}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
                  >
                    <Send size={16} /> Send
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => revoke(l)}
                  aria-label={`Turn off ${l.label || 'link'}`}
                  className="min-h-[44px] w-11 flex items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
