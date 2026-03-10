import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Image, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAccessLog } from '../hooks/useAccessLog'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const statusColors = {
  active: 'bg-green-100 text-green-700',
  rehab: 'bg-yellow-100 text-yellow-700',
  listed: 'bg-blue-100 text-blue-700',
  sold: 'bg-gray-100 text-gray-600',
  pending: 'bg-orange-100 text-orange-700',
}

function fmt(val) {
  if (!val) return '—'
  return '$' + Number(val).toLocaleString()
}

export default function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { log } = useAccessLog()
  const [property, setProperty] = useState(null)
  const [photos, setPhotos] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).single()
      if (error) { toast.error('Property not found'); navigate('/properties'); return }
      setProperty(data)

      const [{ data: photoFiles }, { data: docFiles }] = await Promise.all([
        supabase.storage.from('property-photos').list(String(id)),
        supabase.storage.from('property-docs').list(String(id)),
      ])
      setPhotos(photoFiles || [])
      setDocs(docFiles || [])
      setLoading(false)
    }
    load()
  }, [id])

  async function downloadDoc(name) {
    const { data } = await supabase.storage.from('property-docs').createSignedUrl(`${id}/${name}`, 60)
    if (data?.signedUrl) {
      await log('file_download', `/properties/${id}`, { file: name })
      window.open(data.signedUrl, '_blank')
    }
  }

  if (loading) return <LoadingSpinner />
  if (!property) return null

  return (
    <div className="space-y-6 max-w-4xl">
      <button onClick={() => navigate('/properties')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={16} /> Back to Properties
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
            <p className="text-gray-500 text-sm mt-1">{property.address}{property.city ? `, ${property.city}` : ''}</p>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full capitalize ${statusColors[property.status] || 'bg-gray-100 text-gray-600'}`}>
            {property.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Detail label="Purchase Price" value={fmt(property.purchase_price)} />
          <Detail label="Rehab Budget" value={fmt(property.rehab_budget)} />
          <Detail label="ARV" value={fmt(property.arv)} />
        </div>

        {property.notes && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{property.notes}</p>
          </div>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Image size={18} /> Photos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map(photo => {
              const { data } = supabase.storage.from('property-photos').getPublicUrl(`${id}/${photo.name}`)
              return (
                <a key={photo.name} href={data.publicUrl} target="_blank" rel="noreferrer">
                  <img src={data.publicUrl} alt={photo.name} className="w-full h-36 object-cover rounded-lg hover:opacity-90 transition-opacity" />
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Docs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><FileText size={18} /> Documents</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded.</p>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">{doc.name}</span>
                <button onClick={() => downloadDoc(doc.name)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                  <Download size={14} /> Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-gray-900 font-semibold mt-0.5">{value}</p>
    </div>
  )
}
