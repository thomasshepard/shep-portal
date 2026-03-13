import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

// Secondary client used only for creating users — non-persisting so it
// never touches the admin's own session.
const signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
)

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'member',
  can_view_properties: false,
  can_view_llcs: false,
  can_view_chickens: false,
  can_view_documents: false,
  can_view_deals: false,
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load users')
        else setUsers(data || [])
        setLoading(false)
      })
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // ── Add user ────────────────────────────────────────────

  async function handleAddUser(e) {
    e.preventDefault()
    if (!form.email || !form.password) return toast.error('Email and password are required')
    setSaving(true)

    // Create the auth user via the secondary client (won't affect admin session)
    const { data, error: signupErr } = await signupClient.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name },
        emailRedirectTo: 'https://thomasshepard.github.io/shep-portal',
      },
    })

    if (signupErr) {
      toast.error(signupErr.message)
      setSaving(false)
      return
    }

    const newUserId = data.user?.id
    if (!newUserId) {
      toast.error('User created but could not retrieve ID — check Supabase Auth dashboard.')
      setSaving(false)
      return
    }

    // Supabase trigger auto-creates the profile row on signup.
    // Poll with retries since the trigger may take a moment to fire.
    let profileUpdated = false
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 300))
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          can_view_properties: form.can_view_properties,
          can_view_llcs: form.can_view_llcs,
          can_view_chickens: form.can_view_chickens,
          can_view_documents: form.can_view_documents,
          can_view_deals: form.can_view_deals,
        })
        .eq('id', newUserId)
      if (!profileErr) { profileUpdated = true; break }
    }

    if (!profileUpdated) {
      toast('User created — set their role manually in the Users table if needed.', { icon: '⚠️' })
    } else {
      toast.success(`${form.email} added — share the portal URL with them so they can log in`, { duration: 8000 })
      navigator.clipboard.writeText('https://thomasshepard.github.io/shep-portal').catch(() => {})
    }

    setShowAddForm(false)
    setForm(emptyForm)
    setSaving(false)
    load()
  }

  // ── Delete user ─────────────────────────────────────────

  async function handleDelete(user) {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis removes their account and all access. This cannot be undone.`)) return

    const { error } = await supabase.functions.invoke('delete-user', {
      body: { userId: user.id },
    })

    if (error) {
      // If the edge function isn't deployed yet, show a helpful message
      if (error.message?.includes('Failed to send') || error.message?.includes('404')) {
        toast.error('Delete requires the delete-user edge function to be deployed. See CLAUDE.md for instructions.')
      } else {
        toast.error('Failed to delete user: ' + error.message)
      }
      return
    }

    toast.success(`${user.email} deleted`)
    load()
  }

  // ── Toggle helpers ───────────────────────────────────────

  async function updateUser(userId, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) { toast.error(error.message); return false }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage user access. Admins always have full access regardless of permission flags.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Add User
        </button>
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
                <th className="text-center px-4 py-3 font-medium text-gray-600">Chickens</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Documents</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Deals</th>
                <th className="px-4 py-3" />
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
                    <td className="px-4 py-3 text-center">
                      <PermToggle
                        enabled={isAdmin || u.can_view_chickens}
                        locked={isAdmin}
                        onChange={() => togglePerm(u, 'can_view_chickens')}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PermToggle
                        enabled={isAdmin || u.can_view_documents}
                        locked={isAdmin}
                        onChange={() => togglePerm(u, 'can_view_documents')}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PermToggle
                        enabled={isAdmin || u.can_view_deals}
                        locked={isAdmin}
                        onChange={() => togglePerm(u, 'can_view_deals')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(u)}
                        title="Delete user"
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-400 space-y-0.5">
        <p>• <strong>Properties</strong>, <strong>LLCs</strong>, <strong>Chickens</strong>, <strong>Documents</strong>, and <strong>Facebook Deals</strong> toggles control which sections each user can see.</p>
        <p>• Admin users always have full access — their toggles are locked.</p>
        <p>• <strong>Active/Inactive</strong> is a soft flag. To fully block access, also disable the account in Supabase Auth dashboard.</p>
        <p>• <strong>Delete</strong> permanently removes the account. Requires the <code>delete-user</code> edge function to be deployed.</p>
      </div>

      {/* Add User Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Add User</h2>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <Field label="Full Name">
                <input
                  value={form.full_name}
                  onChange={e => setField('full_name', e.target.value)}
                  className={inp}
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Email *">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setField('email', e.target.value)}
                  className={inp}
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Temporary Password *">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={e => setField('password', e.target.value)}
                  className={inp}
                  placeholder="Min. 6 characters"
                />
              </Field>
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={e => setField('role', e.target.value)}
                  className={inp}
                >
                  <option value="member">Member</option>
                  <option value="va">VA</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>

              {form.role !== 'admin' && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Page Access</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.can_view_properties}
                        onChange={e => setField('can_view_properties', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Properties</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.can_view_llcs}
                        onChange={e => setField('can_view_llcs', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">LLCs</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.can_view_chickens}
                        onChange={e => setField('can_view_chickens', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Chickens</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.can_view_documents}
                        onChange={e => setField('can_view_documents', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Documents</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.can_view_deals}
                        onChange={e => setField('can_view_deals', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Facebook Deals</span>
                    </label>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400">
                The user will be able to log in immediately with these credentials. Share the password with them separately.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
