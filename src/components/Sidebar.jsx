import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Building2, Landmark, Clipboard,
  Users, ScrollText, X, LogOut, Egg, FileText, Tag, Leaf, ListTodo, ChefHat, Activity, Bitcoin,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchAllRecords, DOCS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import { useAccessLog } from '../hooks/useAccessLog'
import toast from 'react-hot-toast'

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/logs', icon: ScrollText, label: 'Access Logs' },
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

export default function Sidebar({ open, onClose }) {
  const { isAdmin, permissions } = useAuth()
  const { log } = useAccessLog()
  const navigate = useNavigate()
  const docsActionCount = useDocsActionCount(!!(permissions.documents || isAdmin))

  async function handleLogout() {
    await log('logout', '/login')
    await supabase.auth.signOut()
    toast.success('Logged out')
    navigate('/login')
  }

  const navItems = [
    permissions.can_view_triage && { to: '/triage', icon: Activity, label: 'Triage' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    (isAdmin || permissions.can_view_tasks) && { to: '/tasks', icon: ListTodo, label: 'Tasks' },
    permissions.properties && { to: '/properties', icon: Building2, label: 'Properties' },
    permissions.deals && { to: '/deals', icon: Tag, label: 'Facebook Deals' },
    permissions.llcs && { to: '/llcs', icon: Landmark, label: 'LLCs' },
    permissions.chickens && { to: '/chickens', icon: Egg, label: 'Chickens' },
    (isAdmin || permissions.can_view_recipes) && { to: '/recipes', icon: ChefHat, label: 'Recipes' },
    (isAdmin || permissions.can_view_listings) && { to: '/listings', icon: Building2, label: 'Listings' },
    isAdmin && { to: '/happy-cuts', icon: Leaf, label: 'Happy Cuts' },
    isAdmin && { to: '/bitcoin', icon: Bitcoin, label: 'Bitcoin' },
    permissions.documents && { to: '/documents', icon: FileText, label: 'Documents', badge: docsActionCount || null },
    permissions.can_view_backlog && { to: '/backlog', icon: Clipboard, label: 'Backlog' },
  ].filter(Boolean)

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
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-4">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
              </div>
              {adminItems.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </>
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
