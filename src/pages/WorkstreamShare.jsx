import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Link2Off } from 'lucide-react'
import WorkstreamTasks from '../components/WorkstreamTasks'
import useSharedTasks from '../hooks/useSharedTasks'

const NAME_KEY = 'shep-share-name'
const PLACEHOLDER_WS = { id: 'shared', fields: {} }

function readName() {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* private mode: fine, ask again next visit */ }
}

function NameGate({ onSave }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (value.trim()) onSave(value.trim()) }}
      className="m-4 mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900">What’s your name?</h2>
        <p className="text-sm text-gray-500 mt-1">So everyone can see who added or finished what. You’ll only be asked once.</p>
      </div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        maxLength={60}
        autoFocus
        autoComplete="given-name"
        aria-label="Your name"
        placeholder="Your name"
        className="w-full min-h-[48px] rounded-xl border border-gray-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-full min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40"
      >
        Continue
      </button>
    </form>
  )
}

function Unavailable({ message }) {
  return (
    <div className="m-4 mt-16 text-center space-y-3">
      <Link2Off size={36} className="mx-auto text-gray-300" />
      <p className="text-base font-semibold text-gray-900">{message}</p>
      <p className="text-sm text-gray-500">Ask whoever sent you the link for a new one.</p>
    </div>
  )
}

/**
 * Public, logged-out checklist for ONE workstream (/#/share/<token>).
 * The token is the only credential; see supabase/functions/workstream-share.
 */
export default function WorkstreamShare() {
  const { token } = useParams()
  const [name, setName] = useState(readName)
  const { workstream, tasks, loading, error, reload, actions } = useSharedTasks(token, name)

  useEffect(() => {
    // Keep shared links out of search results, and give the tab a useful title.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  useEffect(() => {
    document.title = workstream?.name ? `${workstream.name} · Checklist` : 'Checklist'
  }, [workstream?.name])

  function changeName() {
    saveName('')
    setName('')
  }

  const fatal = error && ['revoked', 'gone', 'bad_request'].includes(error.code)

  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      <Toaster position="top-center" />
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900 leading-snug">{workstream?.name || 'Checklist'}</h1>
        {name && (
          <p className="text-xs text-gray-500 mt-0.5">
            Hi, {name} ·{' '}
            <button type="button" onClick={changeName} className="underline min-h-[32px]">not you?</button>
          </p>
        )}
      </header>

      <main className="flex-1 min-h-0 bg-white">
        {fatal ? (
          <Unavailable message={error.code === 'bad_request' ? 'This link doesn’t look right.' : error.message} />
        ) : !name ? (
          <NameGate onSave={n => { saveName(n); setName(n) }} />
        ) : (
          <WorkstreamTasks
            ws={PLACEHOLDER_WS}
            tasks={tasks}
            actions={actions}
            loading={loading}
            error={error?.message}
            onRetry={reload}
          />
        )}
      </main>
    </div>
  )
}
