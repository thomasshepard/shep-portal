import { useState, useEffect, useRef } from 'react'
import { Cpu, Send, RefreshCw, AlertTriangle, Trash2, Plus, Menu, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// Ollama runs on Thomas's desktop and is reachable only over Tailscale (his
// private device mesh — not the LAN, not the public internet), fronted by
// `tailscale serve` for a real HTTPS cert on the MagicDNS hostname (Ollama
// itself only binds to 127.0.0.1; Tailscale Serve is the sole gateway).
// HTTPS here is required, not cosmetic — this page loads over HTTPS on the
// deployed site, and browsers block HTTPS pages from fetching plain HTTP.
// Not a secret: only devices signed into that tailnet can resolve or reach it.
const OLLAMA_BASE_URL = 'https://desktop-9r5vkuj.tailf094b9.ts.net'

async function pingOllama() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

async function listModels() {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
  if (!res.ok) throw new Error('Failed to list models')
  const data = await res.json()
  return (data.models || []).map(m => m.name)
}

// ── Web access tools ─────────────────────────────────────────────────────
// Backed by /tools/search and /tools/fetch on the local proxy (same host as
// Ollama). The Brave Search API key lives only on the proxy — this page
// never sees it. Offered to the model on every request so it can pull in
// current information; the model decides whether a given question needs it.
const SYSTEM_PROMPT =
  'You can call web_search and fetch_page to look things up online when you ' +
  'need current information, facts you are unsure of, or anything after your ' +
  'training cutoff. Prefer answering directly when you already know the answer. ' +
  'When you do use search results, cite the source URLs in your reply.'

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the public web and return the top results (title, url, description).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_page',
      description: 'Fetch a web page by URL and return its readable text content.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full http(s) URL to fetch' } },
        required: ['url'],
      },
    },
  },
]

const MAX_TOOL_ITERATIONS = 4

async function callTool(name, args) {
  const path = name === 'web_search' ? '/tools/search' : name === 'fetch_page' ? '/tools/fetch' : null
  if (!path) throw new Error(`Unknown tool: ${name}`)
  const body = name === 'web_search' ? { query: args.query } : { url: args.url }
  const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Tool ${name} failed: HTTP ${res.status}`)
  return data
}

function parseToolArgs(raw) {
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  return raw || {}
}

async function sendChatRaw(model, messages) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools: TOOLS, stream: false }),
  })
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const data = await res.json()
  return data.message || { role: 'assistant', content: '' }
}

// Runs the tool-calling loop: sends the conversation, and whenever the model
// asks for a tool, executes it locally and feeds the result back, until it
// produces a final answer (or MAX_TOOL_ITERATIONS is hit). Returns the final
// reply text plus the list of URLs touched along the way (for a sources footer).
async function sendChat(model, priorMessages, onStatus) {
  const working = [{ role: 'system', content: SYSTEM_PROMPT }, ...priorMessages]
  const sources = []

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const message = await sendChatRaw(model, working)
    const toolCalls = message.tool_calls || []
    if (toolCalls.length === 0) return { content: message.content || '', sources }

    working.push(message)
    for (const call of toolCalls) {
      const fn = call.function || {}
      const args = parseToolArgs(fn.arguments)
      onStatus?.(fn.name === 'web_search' ? `Searching "${args.query}"…` : `Reading ${args.url}…`)
      let resultText
      try {
        const result = await callTool(fn.name, args)
        if (fn.name === 'web_search') {
          for (const r of result.results || []) sources.push(r.url)
        } else if (fn.name === 'fetch_page') {
          sources.push(result.url)
        }
        resultText = JSON.stringify(result)
      } catch (err) {
        resultText = JSON.stringify({ error: err.message })
      }
      working.push({ role: 'tool', tool_call_id: call.id, content: resultText })
    }
  }
  return { content: 'Gave up after too many tool calls — try rephrasing.', sources }
}

// ── Supabase thread/message helpers ─────────────────────────────────────────

async function fetchThreads(userId) {
  const { data, error } = await supabase
    .from('local_ai_threads')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function fetchMessages(threadId) {
  const { data, error } = await supabase
    .from('local_ai_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

async function createThread(userId, model) {
  const { data, error } = await supabase
    .from('local_ai_threads')
    .insert({ user_id: userId, model })
    .select()
    .single()
  if (error) throw error
  return data
}

async function insertMessage(threadId, role, content) {
  const { data, error } = await supabase
    .from('local_ai_messages')
    .insert({ thread_id: threadId, role, content })
    .select()
    .single()
  if (error) throw error
  return data
}

async function touchThread(threadId, titleUpdate) {
  const patch = { updated_at: new Date().toISOString(), ...(titleUpdate ? { title: titleUpdate } : {}) }
  await supabase.from('local_ai_threads').update(patch).eq('id', threadId)
}

async function deleteThread(threadId) {
  await supabase.from('local_ai_threads').delete().eq('id', threadId)
}

function titleFrom(text) {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ── UI pieces ────────────────────────────────────────────────────────────────

function UnavailableNotice({ onRetry, checking }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
      <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2 text-sm text-amber-900">
        <p className="font-semibold">Local AI isn't reachable right now.</p>
        <p>
          Ollama needs to be running on the desktop, connected via Tailscale. Your past
          conversations below are still there — you just can't send new messages until it's back.
        </p>
        <pre className="bg-amber-100 rounded-lg p-2.5 text-xs overflow-x-auto">
{`$env:OLLAMA_MODELS = "E:\\OllamaModels"
$env:OLLAMA_HOST = "127.0.0.1:11434"
Start-Process -FilePath "E:\\Ollama\\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
tailscale serve --bg http://127.0.0.1:11434`}
        </pre>
        <button
          onClick={onRetry}
          disabled={checking}
          className="flex items-center gap-1.5 text-amber-700 font-medium hover:text-amber-900 disabled:opacity-50"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking...' : 'Check again'}
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function ThreadList({ threads, activeId, onSelect, onDelete, onClose }) {
  if (threads.length === 0) {
    return <p className="text-sm text-gray-400 px-4 py-6 text-center">No conversations yet</p>
  }
  return (
    <div className="space-y-1 p-2">
      {threads.map(t => (
        <div
          key={t.id}
          onClick={() => { onSelect(t.id); onClose?.() }}
          className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${
            t.id === activeId ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{t.title || 'New conversation'}</div>
            <div className="text-xs text-gray-400">{relativeTime(t.updated_at)}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(t.id) }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1 flex-shrink-0 transition-opacity"
            title="Delete conversation"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function LocalAI() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [available, setAvailable] = useState(null) // null = checking, true/false once known
  const [checking, setChecking] = useState(false)
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')

  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [toolStatus, setToolStatus] = useState('')
  const bottomRef = useRef(null)

  async function checkAvailability() {
    setChecking(true)
    const ok = await pingOllama()
    setAvailable(ok)
    if (ok) {
      try {
        const list = await listModels()
        setModels(list)
        setModel(prev => prev || list.find(m => m.startsWith('qwen2.5:3b')) || list[0] || '')
      } catch {
        toast.error('Connected, but could not list models')
      }
    }
    setChecking(false)
  }

  async function loadThreads() {
    if (!userId) return
    setLoadingThreads(true)
    try {
      const list = await fetchThreads(userId)
      setThreads(list)
    } catch {
      toast.error('Could not load conversation history')
    } finally {
      setLoadingThreads(false)
    }
  }

  useEffect(() => { checkAvailability() }, [])
  useEffect(() => { loadThreads() }, [userId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function selectThread(threadId) {
    setActiveThreadId(threadId)
    try {
      const msgs = await fetchMessages(threadId)
      setMessages(msgs.map(m => ({ role: m.role, content: m.content })))
    } catch {
      toast.error('Could not load that conversation')
    }
  }

  function startNewChat() {
    setActiveThreadId(null)
    setMessages([])
    setDrawerOpen(false)
  }

  async function handleDeleteThread(threadId) {
    if (!confirm('Delete this conversation?')) return
    try {
      await deleteThread(threadId)
      setThreads(prev => prev.filter(t => t.id !== threadId))
      if (threadId === activeThreadId) startNewChat()
    } catch {
      toast.error('Could not delete conversation')
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !model || sending || !userId) return

    setSending(true)
    setInput('')
    const priorMessages = messages
    const nextMessages = [...priorMessages, { role: 'user', content: text }]
    setMessages(nextMessages)

    try {
      let threadId = activeThreadId
      const isFirstMessage = priorMessages.length === 0

      if (!threadId) {
        const thread = await createThread(userId, model)
        threadId = thread.id
        setActiveThreadId(threadId)
        setThreads(prev => [thread, ...prev])
      }

      await insertMessage(threadId, 'user', text)

      const { content: reply, sources } = await sendChat(model, nextMessages, setToolStatus)
      setToolStatus('')
      const uniqueSources = [...new Set(sources)]
      const withSources = uniqueSources.length
        ? `${reply}\n\nSources:\n${uniqueSources.map(u => `- ${u}`).join('\n')}`
        : reply
      setMessages(m => [...m, { role: 'assistant', content: withSources }])
      await insertMessage(threadId, 'assistant', withSources)

      const newTitle = isFirstMessage ? titleFrom(text) : undefined
      await touchThread(threadId, newTitle)
      setThreads(prev => {
        const updated = prev.map(t => t.id === threadId
          ? { ...t, updated_at: new Date().toISOString(), ...(newTitle ? { title: newTitle } : {}) }
          : t)
        return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      })
    } catch (err) {
      toast.error(err.message || 'Request failed')
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${err.message || 'Request failed'}` }])
    } finally {
      setSending(false)
      setToolStatus('')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-800"
            title="Conversation history"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Cpu size={24} className="text-blue-600" />
              Local AI
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Runs on the desktop via Ollama, with web search when it needs current info.
            </p>
          </div>
        </div>
        {available && models.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} /> New
            </button>
          </div>
        )}
      </div>

      {available === false && <div className="mb-5"><UnavailableNotice onRetry={checkAvailability} checking={checking} /></div>}

      {available === null && (
        <div className="text-sm text-gray-400 flex items-center gap-2 mb-5">
          <RefreshCw size={14} className="animate-spin" /> Checking for local AI...
        </div>
      )}

      <div className="flex gap-4 h-[70vh]">
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
          {loadingThreads ? (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">Loading...</p>
          ) : (
            <ThreadList threads={threads} activeId={activeThreadId} onSelect={selectThread} onDelete={handleDeleteThread} />
          )}
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">Conversations</span>
                <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700">
                  <X size={18} />
                </button>
              </div>
              {loadingThreads ? (
                <p className="text-sm text-gray-400 px-4 py-6 text-center">Loading...</p>
              ) : (
                <ThreadList threads={threads} activeId={activeThreadId} onSelect={selectThread} onDelete={handleDeleteThread} onClose={() => setDrawerOpen(false)} />
              )}
            </div>
          </div>
        )}

        {/* Chat panel */}
        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-8">
                {activeThreadId ? 'No messages yet.' : 'Start a new conversation — it stays local to your machine and syncs across your devices.'}
              </p>
            )}
            {messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400">
                  {toolStatus || 'Thinking...'}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-gray-200 p-3 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={available ? 'Type a message...' : 'Local AI is offline'}
              disabled={!available}
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !available}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
