import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

export default function Tools() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('pages')
      .select('id, title, slug, description, icon, is_active')
      .eq('is_active', true)
      .order('title')
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load tools')
        else setTools(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
      {tools.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Wrench size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No tools available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => navigate(`/tools/${tool.slug}`)}
              className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:shadow-md hover:border-blue-200 transition-all group"
            >
              <div className="text-3xl mb-3">{tool.icon || '🔧'}</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">{tool.title}</h3>
              {tool.description && <p className="text-sm text-gray-500 mt-1">{tool.description}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
