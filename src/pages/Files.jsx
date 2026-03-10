import { useEffect, useState } from 'react'
import { FolderOpen, Download, Upload, ArrowLeft, File } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAccessLog } from '../hooks/useAccessLog'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function Files() {
  const { isAdmin } = useAuth()
  const { log } = useAccessLog()
  const [path, setPath] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadPath(path)
  }, [path])

  async function loadPath(p) {
    setLoading(true)
    const { data, error } = await supabase.storage.from('shared-files').list(p || undefined, { sortBy: { column: 'name', order: 'asc' } })
    if (error) toast.error('Failed to load files')
    else setItems(data || [])
    setLoading(false)
  }

  async function handleDownload(name) {
    const filePath = path ? `${path}/${name}` : name
    const { data } = await supabase.storage.from('shared-files').createSignedUrl(filePath, 60)
    if (data?.signedUrl) {
      await log('file_download', `/files/${filePath}`, { file: name })
      window.open(data.signedUrl, '_blank')
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const filePath = path ? `${path}/${file.name}` : file.name
    const { error } = await supabase.storage.from('shared-files').upload(filePath, file)
    if (error) toast.error(error.message)
    else { toast.success('File uploaded'); loadPath(path) }
    setUploading(false)
    e.target.value = ''
  }

  function enterFolder(name) {
    setPath(path ? `${path}/${name}` : name)
  }

  function goUp() {
    const parts = path.split('/')
    parts.pop()
    setPath(parts.join('/'))
  }

  const isFolder = item => !item.metadata

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Files</h1>
          {path && (
            <p className="text-sm text-gray-500 mt-0.5">
              /{path}
            </p>
          )}
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
            <Upload size={16} />
            {uploading ? 'Uploading…' : 'Upload File'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {path && (
        <button onClick={goUp} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center">
              <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">This folder is empty.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map(item => (
                <div key={item.name} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    {isFolder(item)
                      ? <FolderOpen size={18} className="text-yellow-500 shrink-0" />
                      : <File size={18} className="text-gray-400 shrink-0" />
                    }
                    <button
                      onClick={() => isFolder(item) ? enterFolder(item.name) : null}
                      className={`text-sm text-gray-800 truncate ${isFolder(item) ? 'hover:text-blue-600 cursor-pointer font-medium' : ''}`}
                    >
                      {item.name}
                    </button>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {!isFolder(item) && (
                      <>
                        <span className="text-xs text-gray-400">{formatBytes(item.metadata?.size)}</span>
                        <span className="text-xs text-gray-400 hidden sm:block">
                          {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : ''}
                        </span>
                        <button onClick={() => handleDownload(item.name)} className="text-blue-600 hover:text-blue-800">
                          <Download size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
