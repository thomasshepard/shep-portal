import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PAGE_SIZE = 25

export default function AdminLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ user: '', action: '', date: '' })

  useEffect(() => {
    load()
  }, [page, filters])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('access_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.user) query = query.ilike('user_email', `%${filters.user}%`)
    if (filters.action) query = query.eq('action', filters.action)
    if (filters.date) query = query.gte('created_at', filters.date)

    const { data, error, count } = await query
    if (error) toast.error('Failed to load logs')
    else { setLogs(data || []); setTotal(count || 0) }
    setLoading(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Access Logs</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <input
          placeholder="Filter by email…"
          value={filters.user}
          onChange={e => { setFilters(f => ({ ...f, user: e.target.value })); setPage(0) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filters.action}
          onChange={e => { setFilters(f => ({ ...f, action: e.target.value })); setPage(0) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          <option value="page_view">page_view</option>
          <option value="login">login</option>
          <option value="logout">logout</option>
          <option value="file_download">file_download</option>
        </select>
        <input
          type="date"
          value={filters.date}
          onChange={e => { setFilters(f => ({ ...f, date: e.target.value })); setPage(0) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">User</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Page</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700">{l.user_email}</td>
                    <td className="px-5 py-3">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{l.action}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{l.page_path}</td>
                    <td className="px-5 py-3 text-gray-400">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
              <span>Page {page + 1} of {totalPages} ({total} total)</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                  Previous
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
