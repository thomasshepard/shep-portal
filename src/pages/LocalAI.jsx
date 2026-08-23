import { useState, useEffect, useRef } from 'react'
import { Cpu, Send, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

// Always localhost — this page only ever talks to Ollama running on the
// machine viewing the page. Never make this configurable to a remote host;
// that would defeat the point (Ollama itself is never exposed off-machine).
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

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

async function sendChat(model, messages) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  })
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const data = await res.json()
  return data.message?.content || ''
}

function UnavailableNotice({ onRetry, checking }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
      <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2 text-sm text-amber-900">
        <p className="font-semibold">Local AI isn't reachable right now.</p>
        <p>
          This only works when Ollama is running on the machine you're viewing this page from
          (it never leaves your computer). Start it with:
        </p>
        <pre className="bg-amber-100 rounded-lg p-2.5 text-xs overflow-x-auto">
{`$env:OLLAMA_MODELS = "E:\\OllamaModels"
Start-Process -FilePath "E:\\Ollama\\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden`}
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
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

export default function LocalAI() {
  const [available, setAvailable] = useState(null) // null = checking, true/false once known
  const [checking, setChecking] = useState(false)
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
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

  useEffect(() => { checkAvailability() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || !model || sending) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const reply = await sendChat(model, next)
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      toast.error(err.message || 'Request failed')
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${err.message || 'Request failed'}` }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu size={24} className="text-blue-600" />
            Local AI
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Chats run entirely on this machine via Ollama — nothing sent to the cloud.
          </p>
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
              onClick={() => setMessages([])}
              disabled={messages.length === 0}
              title="Clear conversation"
              className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {available === false && <UnavailableNotice onRetry={checkAvailability} checking={checking} />}

      {available === null && (
        <div className="text-sm text-gray-400 flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Checking for local AI...
        </div>
      )}

      {available && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col h-[60vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-8">
                Ask anything — this stays local to your machine.
              </p>
            )}
            {messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400">
                  Thinking...
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
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
