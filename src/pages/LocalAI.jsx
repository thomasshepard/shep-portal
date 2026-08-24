import { useState, useEffect, useRef } from 'react'
import { Cpu, Send, RefreshCw, AlertTriangle, Trash2, Plus, Menu, X, Copy, Check, ExternalLink, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// Compact markdown rendering for chat bubbles (white/light background —
// same context as PropertyPlaybook.jsx's MD components, tightened up for
// a narrower bubble rather than a full page).
const MD = {
  h1: p => <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0" {...p} />,
  h2: p => <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0" {...p} />,
  h3: p => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...p} />,
  p: p => <p className="mb-2 leading-relaxed last:mb-0" {...p} />,
  ul: p => <ul className="list-disc pl-5 mb-2 space-y-0.5 last:mb-0" {...p} />,
  ol: p => <ol className="list-decimal pl-5 mb-2 space-y-0.5 last:mb-0" {...p} />,
  li: p => <li className="leading-relaxed" {...p} />,
  a: p => <a className="underline decoration-1 underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer" {...p} />,
  strong: p => <strong className="font-semibold" {...p} />,
  blockquote: p => <blockquote className="border-l-2 border-current/20 pl-3 italic opacity-80 my-2" {...p} />,
  code: p => <code className="bg-black/5 px-1 py-0.5 rounded text-[0.85em]" {...p} />,
  hr: () => <hr className="my-2 border-current/10" />,
  // Hotlinked from whatever site image_search found — occasionally 404s or
  // gets hotlink-blocked after the fact, so fail quietly (hide the broken
  // image + its alt caption) instead of showing the browser's broken-image icon.
  img: p => (
    <a href={p.src} target="_blank" rel="noreferrer" className="block my-2">
      <img
        {...p}
        loading="lazy"
        className="max-w-full rounded-lg border border-current/10"
        onError={e => { e.currentTarget.closest('a').style.display = 'none' }}
      />
    </a>
  ),
}

// The client appends "\n\nSources:\n- url\n- url..." to messages that used
// a tool (see handleSend). Split that back out so it can render as
// clickable pills instead of raw bullet text mixed into the markdown body.
function splitSourcesFooter(content) {
  const marker = '\n\nSources:\n'
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return { main: content, sourceUrls: [] }
  const urls = content.slice(idx + marker.length).split('\n')
    .map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
  if (urls.length === 0 || !urls.every(u => /^https?:\/\//.test(u))) return { main: content, sourceUrls: [] }
  return { main: content.slice(0, idx), sourceUrls: urls }
}

function sourceLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

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
    // Ollama can take a while to answer /api/version while it's mid-pull on
    // a multi-GB model (decompression + disk I/O) — a short timeout here
    // reads as "unreachable" when it's really just busy. 8s gives it room
    // without leaving a genuinely-down desktop spinning too long.
    const timeout = setTimeout(() => controller.abort(), 8000)
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
  'web_search results include a "content" field with real page text for the ' +
  'top results (not just a description) — use that as your source. If a ' +
  'result has no content (content is null) or you need a page beyond the ' +
  'top results, call fetch_page on its url. For "what is X\'s latest video" ' +
  'questions, use youtube_latest_videos instead of web_search — it returns ' +
  'real current video titles, which web_search cannot see. To summarize or ' +
  'answer questions about what was said in a specific YouTube video, use ' +
  'youtube_transcript. When the user wants to actually see a picture of ' +
  'something (not just read about it), use image_search and embed the ' +
  'results as markdown images — never invent an image URL yourself, only ' +
  'use ones a tool actually returned. Cite the source URLs in your reply. ' +
  'For arithmetic, date math, or any calculation you might get wrong doing ' +
  'in your head, call code_exec instead of computing it yourself.'

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
  {
    type: 'function',
    function: {
      name: 'youtube_latest_videos',
      description:
        'Get a YouTube channel\'s actual recent video titles and links (real, current data — ' +
        'web_search/fetch_page cannot see this since channel pages are JavaScript-rendered). ' +
        'Use this for any "what is X\'s latest video" question instead of web_search.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel handle (e.g. "@meetkevin"), name, or URL' },
          count: { type: 'number', description: 'How many recent videos to return (default 10, max 15)' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'image_search',
      description:
        'Search for real images and return their URLs, for when the user wants to actually see ' +
        'pictures of something rather than read about it. Embed results in your reply as markdown ' +
        'images using the "thumbnail" URL: ![description](thumbnail url).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to find images of' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'youtube_transcript',
      description:
        'Get the actual spoken transcript of a YouTube video (English auto-captions), for summarizing ' +
        'or answering questions about what was said in it. Long videos are truncated.',
      parameters: {
        type: 'object',
        properties: { video: { type: 'string', description: 'Video URL or 11-character video ID' } },
        required: ['video'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_exec',
      description:
        'Execute JavaScript for calculations, date math, or string/array/logic processing you might ' +
        'get wrong doing by hand. Sandboxed, 2-second timeout, no network or file access. Use ' +
        'console.log() for intermediate output; the value of the last expression is also returned.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'JavaScript code to run' } },
        required: ['code'],
      },
    },
  },
]

const MAX_TOOL_ITERATIONS = 6 // search + a few fetch_page rounds + final answer

const TOOL_ENDPOINTS = {
  web_search: '/tools/search',
  fetch_page: '/tools/fetch',
  image_search: '/tools/image-search',
  youtube_latest_videos: '/tools/youtube-latest',
  youtube_transcript: '/tools/youtube-transcript',
  code_exec: '/tools/exec',
}

function toolRequestBody(name, args) {
  if (name === 'web_search') return { query: args.query }
  if (name === 'fetch_page') return { url: args.url }
  if (name === 'image_search') return { query: args.query }
  if (name === 'youtube_latest_videos') return { channel: args.channel, count: args.count }
  if (name === 'youtube_transcript') return { video: args.video }
  if (name === 'code_exec') return { code: args.code }
  return {}
}

async function callTool(name, args) {
  const path = TOOL_ENDPOINTS[name]
  if (!path) throw new Error(`Unknown tool: ${name}`)
  const body = toolRequestBody(name, args)
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

    // Some models emit narration alongside a tool call (e.g. "I will now
    // fetch the transcript..."). Feeding that back confuses later rounds —
    // tested directly against Ollama: with the narration included, the
    // model would insist "no actual transcript was fetched" even with the
    // real transcript sitting right there in the next tool message; with
    // only tool_calls (no content) it used the data correctly every time.
    working.push({ role: message.role, tool_calls: message.tool_calls })
    for (const call of toolCalls) {
      const fn = call.function || {}
      const args = parseToolArgs(fn.arguments)
      onStatus?.(
        fn.name === 'web_search' ? `Searching "${args.query}"…` :
        fn.name === 'image_search' ? `Finding images of "${args.query}"…` :
        fn.name === 'youtube_latest_videos' ? `Checking ${args.channel}'s latest videos…` :
        fn.name === 'youtube_transcript' ? `Reading video transcript…` :
        fn.name === 'code_exec' ? `Running calculation…` :
        `Reading ${args.url}…`
      )
      let resultText
      try {
        const result = await callTool(fn.name, args)
        if (fn.name === 'web_search') {
          for (const r of result.results || []) sources.push(r.url)
        } else if (fn.name === 'fetch_page') {
          sources.push(result.url)
        } else if (fn.name === 'youtube_latest_videos') {
          for (const v of result.videos || []) sources.push(v.url)
        } else if (fn.name === 'youtube_transcript' && result.videoId) {
          sources.push(`https://www.youtube.com/watch?v=${result.videoId}`)
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

// Distinct thread IDs containing a message whose content matches — RLS
// (via local_ai_messages' policy, scoped through the parent thread's
// user_id) is what actually restricts this to the caller's own messages,
// same as fetchMessages above; no explicit user filter needed here either.
async function searchMessageContent(query) {
  const { data, error } = await supabase
    .from('local_ai_messages')
    .select('thread_id')
    .ilike('content', `%${query}%`)
    .limit(200)
  if (error) throw error
  return new Set((data || []).map(m => m.thread_id))
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

// The browser's own fetch errors ("Load failed" on Safari, "Failed to
// fetch" on Chrome, "NetworkError...") are accurate but meaningless to a
// reader — they just mean the request never completed, usually a dropped
// mobile connection. Give those a plain-English explanation; anything else
// (a real error from Ollama, Supabase, or a tool) is already clear enough
// to show as-is.
function friendlyError(err) {
  const msg = err?.message || ''
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(msg)) {
    return "Connection dropped before getting a response — check your signal and try again."
  }
  return msg || 'Something went wrong — try again.'
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

// Ollama library names (qwen2.5:7b, hermes3:8b) are already short. Models
// pulled from Hugging Face come through as the full hf.co/author/repo:quant
// string, which is unreadable in a dropdown — shorten to just the repo name
// (minus a redundant trailing "-GGUF") plus the quant level.
function modelLabel(name) {
  if (!name.startsWith('hf.co/')) return name
  const [repoPart, quant] = name.slice('hf.co/'.length).split(':')
  const repoName = repoPart.split('/').pop().replace(/-GGUF$/i, '')
  return quant ? `${repoName} (${quant})` : repoName
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)
  const { main, sourceUrls } = isUser ? { main: content, sourceUrls: [] } : splitSourcesFooter(content)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — clipboard access blocked')
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
          isUser ? 'bg-blue-600 text-white whitespace-pre-wrap' : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {isUser ? main : <ReactMarkdown components={MD}>{main}</ReactMarkdown>}

        {sourceUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {sourceUrls.map((u, i) => (
              <a
                key={i}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded-full border border-gray-200 transition-colors"
              >
                <ExternalLink size={10} />
                {sourceLabel(u)}
              </a>
            ))}
          </div>
        )}

        {!isUser && content && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-600 mt-1.5 transition-colors"
            title="Copy message"
          >
            {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

function ThreadList({ threads, activeId, onSelect, onDelete, onClose, query, hasAnyThreads, searching }) {
  if (threads.length === 0) {
    return (
      <p className="text-sm text-gray-400 px-4 py-6 text-center">
        {query && searching ? 'Searching...' :
         query && hasAnyThreads ? <>No conversations match &ldquo;{query}&rdquo;</> :
         'No conversations yet'}
      </p>
    )
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
  const [threadQuery, setThreadQuery] = useState('')
  const [contentMatchIds, setContentMatchIds] = useState(null) // null = not searched yet, Set = results
  const [searchingContent, setSearchingContent] = useState(false)

  // Title matching is instant (client-side); message-content matching hits
  // Supabase, so it's debounced and merged in once it resolves — searching
  // "what a video was actually about" needs the body text, not just titles.
  useEffect(() => {
    const q = threadQuery.trim()
    if (!q) { setContentMatchIds(null); setSearchingContent(false); return }
    setSearchingContent(true)
    const timer = setTimeout(async () => {
      try {
        setContentMatchIds(await searchMessageContent(q))
      } catch {
        setContentMatchIds(new Set())
      } finally {
        setSearchingContent(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [threadQuery])

  const filteredThreads = threadQuery.trim()
    ? threads.filter(t =>
        (t.title || 'New conversation').toLowerCase().includes(threadQuery.trim().toLowerCase()) ||
        contentMatchIds?.has(t.id)
      )
    : threads

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
        setModel(prev => prev
          || list.find(m => m.startsWith('qwen2.5:7b'))
          || list.find(m => m.startsWith('qwen2.5:3b'))
          || list[0] || '')
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
      // Models sometimes write their own citations already — don't double up.
      const withSources = uniqueSources.length && !/sources:/i.test(reply)
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
      const friendly = friendlyError(err)
      toast.error(friendly)
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${friendly}` }])
      setInput(text) // refill so retrying is one tap, not retyping the whole thing
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
              {models.map(m => <option key={m} value={m} title={m}>{modelLabel(m)}</option>)}
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
        <div className="hidden lg:flex lg:flex-col w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {threads.length > 0 && (
            <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={threadQuery}
                  onChange={e => setThreadQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchingContent && (
                  <RefreshCw size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 animate-spin" />
                )}
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {loadingThreads ? (
              <p className="text-sm text-gray-400 px-4 py-6 text-center">Loading...</p>
            ) : (
              <ThreadList threads={filteredThreads} activeId={activeThreadId} onSelect={selectThread} onDelete={handleDeleteThread} query={threadQuery.trim()} hasAnyThreads={threads.length > 0} searching={searchingContent} />
            )}
          </div>
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col">
              <div className="sticky top-0 bg-white z-10 border-b border-gray-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="font-semibold text-gray-800 text-sm">Conversations</span>
                  <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700">
                    <X size={18} />
                  </button>
                </div>
                {threads.length > 0 && (
                  <div className="px-2 pb-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={threadQuery}
                        onChange={e => setThreadQuery(e.target.value)}
                        placeholder="Search conversations..."
                        className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {loadingThreads ? (
                  <p className="text-sm text-gray-400 px-4 py-6 text-center">Loading...</p>
                ) : (
                  <ThreadList threads={filteredThreads} activeId={activeThreadId} onSelect={selectThread} onDelete={handleDeleteThread} onClose={() => setDrawerOpen(false)} query={threadQuery.trim()} hasAnyThreads={threads.length > 0} searching={searchingContent} />
                )}
              </div>
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
