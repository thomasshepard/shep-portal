import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load users')
        else setUsers(data || [])
        setLoading(false)
      })
  }, [])

  async function updateUser(userId, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) {
      toast.error(error.message)
      return false
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u))
    return true
  }

  async function toggleActive(user) {
    const ok = await updateUser(user.id, { is_active: !user.is_active })
    if (ok) toast.success(`User ${user.is_active ? 'deactivated' : 'activated'}`)
  }

  async function togglePerm(user, field) {
    const ok = await updateUser(user.id, { [field]: !user[field] })
    if (ok) toast.success('Permissions updated')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage user access. Admins always have full access regardless of permission flags.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Last Login</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Properties</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">LLCs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => {
                const isAdmin = u.role === 'admin'
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{u.full_name || '—'}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleActive(u)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PermToggle
                        enabled={isAdmin || u.can_view_properties}
                        locked={isAdmin}
                        onChange={() => togglePerm(u, 'can_view_properties')}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PermToggle
                        enabled={isAdmin || u.can_view_llcs}
                        locked={isAdmin}
                        onChange={() => togglePerm(u, 'can_view_llcs')}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-400 space-y-0.5">
        <p>• <strong>Properties</strong> and <strong>LLCs</strong> toggles control which sections each user can see in the nav and access via URL.</p>
        <p>• Admin users have full access to everything — their toggles are locked.</p>
        <p>• Clicking the <strong>Active/Inactive</strong> badge toggles the user's active status. To fully block access, also disable the account in the Supabase Auth dashboard.</p>
      </div>
    </div>
  )
}

function PermToggle({ enabled, locked, onChange }) {
  return (
    <button
      onClick={locked ? undefined : onChange}
      disabled={locked}
      title={locked ? 'Admin — always enabled' : enabled ? 'Click to revoke' : 'Click to grant'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}
