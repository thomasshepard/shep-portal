import { useState } from 'react'
import { X, Phone, Mail, MapPin, Calendar, CircleDot, CircleEllipsis, CircleCheck } from 'lucide-react'
import { fmtDate } from '../lib/airtable'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// The Airtable field only actually defines these three — anything else typed
// into a free-text dropdown silently creates junk ad-hoc options on save.
const STATUSES = [
  { value: 'Todo', label: 'Todo', icon: CircleDot, active: 'bg-gray-800 text-white border-gray-800', idle: 'border-gray-200 text-gray-500 hover:border-gray-300' },
  { value: 'In progress', label: 'In progress', icon: CircleEllipsis, active: 'bg-blue-600 text-white border-blue-600', idle: 'border-gray-200 text-gray-500 hover:border-blue-200' },
  { value: 'Resolved', label: 'Resolved', icon: CircleCheck, active: 'bg-green-600 text-white border-green-600', idle: 'border-gray-200 text-gray-500 hover:border-green-200' },
]

const safeStr = v => (v == null ? '' : String(v))
const safeNum = v => (v == null || v === '' ? '' : Number(v))

export default function MaintenanceForm({ record, tenantName, onSave, onClose }) {
  const f = record?.fields || {}
  const photos = Array.isArray(f.Photos) ? f.Photos : []

  const [status, setStatus] = useState(f.Status || 'Todo')
  const [resolution, setResolution] = useState(safeStr(f.Resolution))
  const [resolutionEstimate, setResolutionEstimate] = useState(safeStr(f['Resolution Estimate']))
  const [estimatedCost, setEstimatedCost] = useState(safeNum(f['Estimated Cost']))
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const fields = { Status: status, Resolution: resolution }
    if (resolutionEstimate) fields['Resolution Estimate'] = resolutionEstimate
    if (estimatedCost !== '') fields['Estimated Cost'] = Number(estimatedCost)
    await onSave(fields, record.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{f.Name || 'Maintenance Request'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        {/* Reported — read-only context so you never have to close this to remember what was asked */}
        <div className="px-6 pt-4 pb-1 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
            {f.Address && (
              <span className="flex items-center gap-1"><MapPin size={13} />{f.Address}</span>
            )}
            {f.Date && (
              <span className="flex items-center gap-1"><Calendar size={13} />{fmtDate(f.Date)}</span>
            )}
            {tenantName && <span className="text-gray-700 font-medium">{tenantName}</span>}
          </div>
          {(f['Contact Phone'] || f['Contact Email']) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {f['Contact Phone'] && (
                <a href={`tel:${f['Contact Phone']}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <Phone size={13} />{f['Contact Phone']}
                </a>
              )}
              {f['Contact Email'] && (
                <a href={`mailto:${f['Contact Email']}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <Mail size={13} />{f['Contact Email']}
                </a>
              )}
            </div>
          )}
          {f['Request Notes'] && (
            <p className="text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{f['Request Notes']}</p>
          )}
        </div>

        {photos.length > 0 && (
          <div className="px-6 pt-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button
                  key={p.id || i}
                  type="button"
                  onClick={() => setLightbox(p)}
                  className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                >
                  <img src={p.thumbnails?.large?.url || p.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map(s => {
                const Icon = s.icon
                const on = status === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`flex items-center justify-center gap-1.5 text-sm font-medium border rounded-lg py-2 transition-all duration-150 ${on ? s.active + ' scale-[1.02]' : s.idle}`}
                  >
                    <Icon size={14} />
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimated cost">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={estimatedCost}
                  onChange={e => setEstimatedCost(e.target.value)}
                  className={inp + ' pl-6'}
                />
              </div>
            </Field>
            <Field label="Resolve by">
              <input type="date" value={resolutionEstimate} onChange={e => setResolutionEstimate(e.target.value)} className={inp} />
            </Field>
          </div>

          <Field label="Resolution notes">
            <textarea
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              rows={3}
              className={inp}
              placeholder="What was done, who's handling it, next steps..."
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.url} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-5 right-5 text-white/80 hover:text-white"
          >
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
