import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Building2, Landmark, Clipboard,
  Users, ScrollText, X, LogOut, Egg, FileText, Tag, Leaf, ListTodo, ChefHat, Activity, Bitcoin, Wallet, PiggyBank, Bot, Shield, UserCog, Wrench, Calculator,
  ChevronDown, Star, MessageSquare,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchAllRecords, DOCS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import { useAccessLog } from '../hooks/useAccessLog'
import { useChannelList } from '../hooks/useMessages'
import toast from 'react-hot-toast'

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/logs', icon: ScrollText, label: 'Access Logs' },
  { to: '/admin/agents', icon: Bot, label: 'Agent Fleet' },
  { to: '/admin/crew-access', icon: UserCog, label: 'Crew Access' },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
  }`

function useDocsActionCount(enabled) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled || !DOCS_BASE_ID) return
    fetchAllRecords(
      'tbltkTOMpJHPIUBXN',
      { filterByFormula: `AND({fldmjyqB4dHpjITgX} != '', NOT({fld4XJN71y37c4OiW}))` },
      DOCS_BASE_ID
    ).then(({ data }) => setCount(data?.length || 0))
  }, [enabled])
  return count
}

// ── Pin persistence ─────────────────────────────────────────────────────────
function loadPinned(storageKey) {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))
  } catch {
    return new Set()
  }
}

function usePinnedNav(userId) {
  const storageKey = `shep_pinned_nav_v1_${userId || 'anon'}`
  const [loadedKey, setLoadedKey] = useState(storageKey)
  const [pinned, setPinned] = useState(() => loadPinned(storageKey))

  // profile.id resolves asynchronously after mount — re-sync from storage
  // once the real key is known, rather than in an effect (React-recommended
  // "adjust state during render" pattern instead of a setState-in-effect).
  if (storageKey !== loadedKey) {
    setLoadedKey(storageKey)
    setPinned(loadPinned(storageKey))
  }

  function togglePin(to) {
    setPinned(prev => {
      const next = new Set(prev)
      next.has(to) ? next.delete(to) : next.add(to)
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }

  return [pinned, togglePin]
}

// ── Group collapse persistence ──────────────────────────────────────────────
function useCollapsedGroups() {
  const storageKey = 'shep_nav_collapsed_v1'
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}')
    } catch {
      return {}
    }
  })

  function toggleGroup(key) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  return [collapsed, toggleGroup]
}

function NavRow({ to, icon: NavIcon, label, badge, onClose, pinned, onTogglePin, pinnable = true }) {
  return (
    <div className="flex items-center">
      <NavLink to={to} className={linkClass} onClick={onClose}>
        <NavIcon size={18} />
        <span className="flex-1 truncate">{label}</span>
        {badge ? (
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
            {badge}
          </span>
        ) : null}
        {pinnable && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(to) }}
            className={`ml-1 flex-shrink-0 p-0.5 rounded transition-opacity ${
              pinned ? 'opacity-100 text-amber-400' : 'opacity-50 hover:opacity-100 text-slate-300'
            }`}
            title={pinned ? 'Unpin' : 'Pin to top'}
          >
            <Star size={13} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        )}
      </NavLink>
    </div>
  )
}

function NavGroup({ groupKey, label, items, collapsed, onToggle, onClose, pinned, onTogglePin }) {
  if (items.length === 0) return null
  const isCollapsed = !!collapsed[groupKey]
  return (
    <div className="pt-3">
      <button
        onClick={() => onToggle(groupKey)}
        className="flex items-center justify-between w-full px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>
      {!isCollapsed && (
        <div className="space-y-1 mt-1">
          {items.map(item => (
            <NavRow
              key={item.to}
              {...item}
              onClose={onClose}
              pinned={pinned.has(item.to)}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const { isAdmin, permissions, profile } = useAuth()
  const { log } = useAccessLog()
  const navigate = useNavigate()
  const docsActionCount = useDocsActionCount(!!(permissions.documents || isAdmin))
  const { totalUnread: messagesUnread } = useChannelList(permissions.can_view_messages ? profile?.id : null)
  const [pinned, togglePin] = usePinnedNav(profile?.id)
  const [collapsed, toggleGroup] = useCollapsedGroups()

  async function handleLogout() {
    await log('logout', '/login')
    await supabase.auth.signOut()
    toast.success('Logged out')
    navigate('/login')
  }

  // Always-visible core items — used constantly across every role, not grouped
  const topItems = [
    permissions.can_view_triage && { to: '/triage', icon: Activity, label: 'Triage', pinnable: false },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', pinnable: false },
    (isAdmin || permissions.can_view_tasks) && { to: '/tasks', icon: ListTodo, label: 'Tasks', pinnable: false },
    permissions.can_view_messages && { to: '/messages', icon: MessageSquare, label: 'Messages', pinnable: false, badge: messagesUnread || null },
  ].filter(Boolean)

  const groups = [
    {
      key: 'property',
      label: 'Property Ops',
      items: [
        permissions.properties && { to: '/properties', icon: Building2, label: 'Properties' },
        permissions.can_view_insurance && { to: '/insurance', icon: Shield, label: 'Insurance & Taxes' },
        permissions.llcs && { to: '/llcs', icon: Landmark, label: 'LLCs' },
        permissions.can_view_fleet && { to: '/fleet', icon: Wrench, label: 'Fleet' },
      ].filter(Boolean),
    },
    {
      key: 'deals',
      label: 'Deals & Listings',
      items: [
        permissions.deals && { to: '/deals', icon: Tag, label: 'Facebook Deals' },
        (isAdmin || permissions.can_view_listings) && { to: '/listings', icon: Building2, label: 'Listings' },
      ].filter(Boolean),
    },
    {
      key: 'money',
      label: 'Money',
      items: [
        permissions.can_view_finances && { to: '/finances', icon: Wallet, label: 'Finances' },
        permissions.can_view_bank_dashboard && { to: '/bank-dashboard', icon: PiggyBank, label: 'Bank Dashboard' },
        permissions.can_view_bookkeeping && { to: '/bookkeeping', icon: Calculator, label: 'Bookkeeping' },
        isAdmin && { to: '/bitcoin', icon: Bitcoin, label: 'Bitcoin' },
      ].filter(Boolean),
    },
    {
      key: 'sidebiz',
      label: 'Side Business',
      items: [
        permissions.chickens && { to: '/chickens', icon: Egg, label: 'Chickens' },
        permissions.can_view_happy_cuts && { to: '/happy-cuts', icon: Leaf, label: 'Happy Cuts' },
      ].filter(Boolean),
    },
    {
      key: 'reference',
      label: 'Reference',
      items: [
        (isAdmin || permissions.can_view_recipes) && { to: '/recipes', icon: ChefHat, label: 'Recipes' },
        permissions.documents && { to: '/documents', icon: FileText, label: 'Documents', badge: docsActionCount || null },
        permissions.can_view_backlog && { to: '/backlog', icon: Clipboard, label: 'Backlog' },
      ].filter(Boolean),
    },
  ]

  // Flatten every pinnable item so the Pinned section can look up icon/label/badge
  const allPinnable = groups.flatMap(g => g.items)
  const pinnedItems = allPinnable.filter(i => pinned.has(i.to))

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-slate-800 flex flex-col z-30 transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
          <span className="text-white font-bold text-lg tracking-wide">Shep Portal</span>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-1">
            {topItems.map(item => (
              <NavRow key={item.to} {...item} onClose={onClose} pinned={false} onTogglePin={togglePin} />
            ))}
          </div>

          {pinnedItems.length > 0 && (
            <div className="pt-3">
              <div className="px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Pinned
              </div>
              <div className="space-y-1 mt-1">
                {pinnedItems.map(item => (
                  <NavRow key={item.to} {...item} onClose={onClose} pinned={true} onTogglePin={togglePin} />
                ))}
              </div>
            </div>
          )}

          {groups.map(g => (
            <NavGroup
              key={g.key}
              groupKey={g.key}
              label={g.label}
              items={g.items}
              collapsed={collapsed}
              onToggle={toggleGroup}
              onClose={onClose}
              pinned={pinned}
              onTogglePin={togglePin}
            />
          ))}

          {isAdmin && (
            <NavGroup
              groupKey="admin"
              label="Admin"
              items={adminItems.map(i => ({ ...i, pinnable: false }))}
              collapsed={collapsed}
              onToggle={toggleGroup}
              onClose={onClose}
              pinned={pinned}
              onTogglePin={togglePin}
            />
          )}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </aside>
    </>
  )
}
