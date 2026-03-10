import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

export default function ToolView() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [tool, setTool] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
      .then(({ data, error }) => {
        if (error) { toast.error('Tool not found'); navigate('/tools'); return }
        setTool(data)
        setLoading(false)
      })
  }, [slug])

  if (loading) return <LoadingSpinner />
  if (!tool) return null

  return (
    <div className="space-y-4 h-full flex flex-col">
      <button onClick={() => navigate('/tools')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={16} /> Back to Tools
      </button>
      <h1 className="text-xl font-bold text-gray-900">{tool.title}</h1>
      <iframe
        srcDoc={tool.content}
        sandbox="allow-scripts allow-forms"
        className="flex-1 w-full border border-gray-200 rounded-xl bg-white"
        style={{ minHeight: '70vh' }}
        title={tool.title}
      />
    </div>
  )
}
