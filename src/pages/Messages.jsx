import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Send, Paperclip, X, Image as ImageIcon, File as FileIcon, MessageSquare, BellOff, Bell, CornerDownRight, ChevronLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useChannelList, useChannelMessages } from '../hooks/useMessages'
import {
  channelDisplayName, findOrCreateDM, createGroup, fetchTeammates, fetchChannelMembers,
  sendMessage, uploadAttachment, signAttachmentUrl, setChannelMuted, fetchMessages,
} from '../lib/messaging'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

// Splits body text into safe React nodes, turning bare URLs into links.
// No dangerouslySetInnerHTML anywhere — arbitrary HTML in a message body
// (from any member, VA or admin) must never execute.
function renderBody(text) {
  if (!text) return null
  const re = /(https?:\/\/[^\s]+)/g
  const out = []
  let lastIndex = 0, m, key = 0
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) out.push(<span key={key++}>{text.slice(lastIndex, m.index)}</span>)
    out.push(
      <a key={key++} href={m[0]} target="_blank" rel="noopener noreferrer" className="underline break-all">
        {m[0]}
      </a>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) out.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  return out
}

function AttachmentThumb({ att }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { signAttachmentUrl(att.path).then(setUrl) }, [att.path])

  if (att.kind === 'image') {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={att.name} className="max-w-[220px] max-h-[220px] rounded-lg border border-slate-200 mt-1" />
      </a>
    ) : (
      <div className="w-[120px] h-[80px] rounded-lg bg-slate-100 animate-pulse mt-1" />
    )
  }
  return (
    <a
      href={url || '#'}
      target="_blank" rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm text-slate-700"
    >
      <FileIcon size={16} /> {att.name}
    </a>
  )
}

// ── Channel list item ─────────────────────────────────────────────────────────
function ChannelRow({ channel, active, myId, onClick }) {
  const name = channelDisplayName(channel, myId)
  const preview = channel.lastMessage?.deleted_at
    ? 'Message deleted'
    : channel.lastMessage?.body || (channel.lastMessage?.attachments?.length ? '📎 Attachment' : 'No messages yet')

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
        active ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        active ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
      }`}>
        {channel.kind === 'group' ? <MessageSquare size={16} /> : initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          <span className={`text-xs shrink-0 ${active ? 'text-blue-100' : 'text-slate-400'}`}>
            {timeAgo(channel.lastMessage?.created_at || channel.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs truncate ${active ? 'text-blue-100' : 'text-slate-500'}`}>{preview}</span>
          {channel.unreadCount > 0 && (
            <span className="text-xs shrink-0 bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {channel.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── New conversation modal ────────────────────────────────────────────────────
function NewConversationModal({ myId, onClose, onCreated }) {
  const [teammates, setTeammates] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [groupName, setGroupName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTeammates(myId).then(setTeammates) }, [myId])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleStart() {
    if (!selected.size) return
    setSaving(true)
    try {
      const ids = [...selected]
      let channelId
      if (ids.length === 1 && !groupName.trim()) {
        channelId = await findOrCreateDM(myId, ids[0])
      } else {
        channelId = await createGroup(myId, groupName.trim(), ids)
      }
      onCreated(channelId)
    } catch (err) {
      toast.error(err.message || 'Failed to start conversation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">New conversation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          {selected.size > 1 && (
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {teammates.map(t => (
              <label key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="rounded" />
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                  {initials(t.full_name || t.email)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{t.full_name || t.email}</div>
                  <div className="text-xs text-slate-400 capitalize">{t.role}</div>
                </div>
              </label>
            ))}
            {!teammates.length && <p className="text-sm text-slate-400 px-2 py-4 text-center">No other users yet.</p>}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={handleStart}
            disabled={!selected.size || saving}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Starting…' : selected.size > 1 ? 'Start group' : 'Start chat'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread reply panel ────────────────────────────────────────────────────────
function ThreadPanel({ root, channelId, members, myId, onClose }) {
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const memberName = (id) => members.find(m => m.profile_id === id)?.profiles?.full_name || 'Someone'

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchMessages(channelId, { threadRootId: root.id })
    setReplies(data.filter(m => m.id !== root.id))
    setLoading(false)
  }, [channelId, root.id])

  useEffect(() => { load() }, [load])

  async function send() {
    if (!text.trim()) return
    const body = text
    setText('')
    try {
      await sendMessage({ channelId, senderId: myId, body, threadRootId: root.id, members })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to reply')
    }
  }

  return (
    <div className="fixed inset-0 z-40 md:static md:z-auto md:w-80 md:border-l border-slate-200 flex flex-col shrink-0 bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600 -ml-1"><ChevronLeft size={22} /></button>
        <h3 className="text-sm font-semibold text-slate-700 flex-1">Thread</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-sm">
          <div className="font-medium text-slate-700">{memberName(root.sender_id)}</div>
          <div className="text-slate-600 whitespace-pre-wrap break-words">{renderBody(root.body)}</div>
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-3">
          {loading ? <LoadingSpinner /> : replies.map(r => (
            <div key={r.id} className="text-sm">
              <div className="font-medium text-slate-700">{memberName(r.sender_id)} <span className="text-xs text-slate-400 font-normal">{timeAgo(r.created_at)}</span></div>
              <div className="text-slate-600 whitespace-pre-wrap break-words">{renderBody(r.body)}</div>
            </div>
          ))}
          {!loading && !replies.length && <p className="text-xs text-slate-400">No replies yet.</p>}
        </div>
      </div>
      <div className="p-3 border-t border-slate-200 flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Reply in thread…"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button onClick={send} className="px-3 py-2 rounded-lg bg-blue-600 text-white"><Send size={16} /></button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Messages() {
  const { profile } = useAuth()
  const myId = profile?.id
  const { channelId } = useParams()
  const navigate = useNavigate()

  const { channels, loading: channelsLoading, refresh: refreshChannels } = useChannelList(myId)
  const { messages, loading: messagesLoading } = useChannelMessages(channelId, myId)

  const [members, setMembers] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [thread, setThread] = useState(null)
  const [text, setText] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)

  const activeChannel = channels.find(c => c.id === channelId)

  useEffect(() => {
    if (!channelId) return
    fetchChannelMembers(channelId).then(setMembers)
    setThread(null)
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function memberName(id) {
    if (id === myId) return 'You'
    return members.find(m => m.profile_id === id)?.profiles?.full_name || 'Someone'
  }

  function handleCreated(id) {
    setShowNew(false)
    refreshChannels()
    navigate(`/messages/${id}`)
  }

  async function handleFilesChosen(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !channelId) return
    setSending(true)
    try {
      const uploaded = await Promise.all(files.map(f => uploadAttachment(f, channelId)))
      setPendingFiles(prev => [...prev, ...uploaded])
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setSending(false)
    }
  }

  async function handleSend() {
    if ((!text.trim() && !pendingFiles.length) || !channelId || sending) return
    setSending(true)
    const body = text
    const attachments = pendingFiles
    setText('')
    setPendingFiles([])
    try {
      await sendMessage({ channelId, senderId: myId, body, attachments, members })
    } catch (err) {
      toast.error(err.message || 'Failed to send')
      setText(body)
      setPendingFiles(attachments)
    } finally {
      setSending(false)
    }
  }

  const displayName = useMemo(() => channelDisplayName(activeChannel, myId), [activeChannel, myId])

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Channel list — full-screen on mobile when no conversation is open, a fixed side rail on desktop */}
      <div className={`${channelId ? 'hidden md:flex' : 'flex'} w-full md:w-72 border-r border-slate-200 flex-col shrink-0`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h1 className="text-base font-semibold text-slate-800">Messages</h1>
          <button onClick={() => setShowNew(true)} className="text-blue-600 hover:text-blue-700" title="New conversation">
            <Plus size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channelsLoading ? <LoadingSpinner /> : channels.map(c => (
            <ChannelRow key={c.id} channel={c} active={c.id === channelId} myId={myId} onClick={() => navigate(`/messages/${c.id}`)} />
          ))}
          {!channelsLoading && !channels.length && (
            <div className="text-center text-sm text-slate-400 mt-8 px-4">
              No conversations yet. Click <Plus size={14} className="inline" /> to message a teammate.
            </div>
          )}
        </div>
      </div>

      {/* Active channel — full-screen on mobile (hidden until a conversation is picked), side-by-side with the list on desktop */}
      <div className={`${channelId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
      {activeChannel ? (
        <div className="flex-1 flex min-w-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <button onClick={() => navigate('/messages')} className="md:hidden text-slate-400 hover:text-slate-600 -ml-1 shrink-0">
                <ChevronLeft size={22} />
              </button>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-slate-200 text-slate-600`}>
                {activeChannel.kind === 'group' ? <MessageSquare size={14} /> : initials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{displayName}</div>
                {activeChannel.kind === 'group' && (
                  <div className="text-xs text-slate-400 truncate">
                    {members.map(m => m.profiles?.full_name || m.profiles?.email).join(', ')}
                  </div>
                )}
              </div>
              <button
                onClick={() => setChannelMuted(channelId, myId, !activeChannel.muted).then(refreshChannels)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
                title={activeChannel.muted ? 'Unmute' : 'Mute'}
              >
                {activeChannel.muted ? <BellOff size={18} /> : <Bell size={18} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messagesLoading ? <LoadingSpinner /> : messages.map(m => {
                const mine = m.sender_id === myId
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!mine && activeChannel.kind === 'group' && (
                        <span className="text-xs text-slate-400 mb-0.5 px-1">{m.profiles?.full_name || memberName(m.sender_id)}</span>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {m.deleted_at ? (
                          <span className="italic opacity-70">Message deleted</span>
                        ) : (
                          <>
                            {m.body && <div className="whitespace-pre-wrap break-words">{renderBody(m.body)}</div>}
                            {(m.attachments || []).map((att, i) => <AttachmentThumb key={i} att={att} />)}
                            {m.is_edited && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 px-1">
                        <span className="text-[11px] text-slate-400">{timeAgo(m.created_at)}</span>
                        {!m.deleted_at && (
                          <button
                            onClick={() => setThread(m)}
                            className="text-[11px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5"
                          >
                            <CornerDownRight size={11} /> {m.reply_count > 0 ? `${m.reply_count} repl${m.reply_count === 1 ? 'y' : 'ies'}` : 'Reply'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-slate-200">
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-slate-100 rounded-full px-2 py-1">
                      {f.kind === 'image' ? <ImageIcon size={12} /> : <FileIcon size={12} />} {f.name}
                      <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesChosen} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-slate-600 shrink-0"
                  title="Attach image or file"
                >
                  <Paperclip size={18} />
                </button>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Message… (Enter to send, Shift+Enter for a new line)"
                  rows={1}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!text.trim() && !pendingFiles.length)}
                  className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-50 shrink-0"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          {thread && (
            <ThreadPanel root={thread} channelId={channelId} members={members} myId={myId} onClose={() => setThread(null)} />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          {channelsLoading ? <LoadingSpinner /> : 'Select a conversation, or start a new one.'}
        </div>
      )}
      </div>

      {showNew && <NewConversationModal myId={myId} onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}
