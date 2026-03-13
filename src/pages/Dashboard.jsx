import { useEffect, useState } from 'react'
import { Building2, Activity, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchAllRecords, PM_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState({ properties: 0, files: 0, recentActivity: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [{ count: propCount }, { count: fileCount }, { data: logs }] = await Promise.all([
          fetchAllRecords('Property', { fields: ['Address'] }, PM_BASE_ID).then(r => ({ count: r.data?.length || 0 })),
          supabase.storage.from('shared-files').list('').then(r => ({ count: r.data?.length || 0 })),
          supabase
            .from('access_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(isAdmin ? 10 : 5)
            .then(r => r),
        ])
        setStats({ properties: propCount || 0, files: fileCount, recentActivity: logs || [] })
      } catch {
        toast.error('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAdmin])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name || 'there'}!
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Here's what's going on.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Building2} label="Properties" value={stats.properties} color="blue" />
        <StatCard icon={Activity} label="Recent Activity" value={stats.recentActivity.length} color="green" />
        <StatCard icon={FolderOpen} label="Shared Files" value={stats.files} color="purple" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
        {stats.recentActivity.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent activity.</p>
        ) : (
          <div className="space-y-2">
            {stats.recentActivity.map(entry => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-700">{entry.user_email}</span>
                  <span className="text-xs text-gray-400 ml-2">{entry.action}</span>
                  <span className="text-xs text-gray-400 ml-1">— {entry.page_path}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}
