import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const statusColors = {
  active: 'bg-green-100 text-green-700',
  rehab: 'bg-yellow-100 text-yellow-700',
  listed: 'bg-blue-100 text-blue-700',
  sold: 'bg-gray-100 text-gray-600',
  pending: 'bg-orange-100 text-orange-700',
}

export default function Properties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load properties')
        else setProperties(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
      {properties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No properties yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/properties/${p.id}`)}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              {p.thumbnail_url ? (
                <img src={p.thumbnail_url} alt={p.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                  <Building2 size={36} className="text-gray-300" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <MapPin size={13} />
                  {p.address}{p.city ? `, ${p.city}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
