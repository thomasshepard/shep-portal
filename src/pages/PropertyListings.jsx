import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight } from 'lucide-react'

export default function PropertyListings() {
  const navigate = useNavigate()

  const properties = [
    {
      slug: 'benwick',
      address: '73 Benwick Dr',
      city: 'Crossville, TN 38555',
      listPrice: 275000,
      beds: 4, baths: 3, sqft: 1804,
      status: 'Active',
      dom: 11,
      lastUpdated: '2026-04-19',
    },
  ]

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4" style={{ fontFamily: "'Courier New', monospace" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={16} className="text-amber-400" />
          <span className="text-amber-400 font-bold text-sm tracking-wider">SHEP INTEL</span>
          <span className="text-gray-600 text-xs">|</span>
          <span className="text-gray-400 text-xs font-mono">Property Listings</span>
        </div>
        <p className="text-gray-600 text-xs mb-5 font-mono">Deal intelligence dashboards — operator use only</p>

        {/* Property cards */}
        <div className="flex flex-col gap-3">
          {properties.map((p) => (
            <button
              key={p.slug}
              onClick={() => navigate(`/listings/${p.slug}`)}
              className="w-full text-left bg-gray-900 border border-gray-700 rounded-sm p-4 hover:border-amber-400 transition-colors group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-white font-mono font-bold text-base">{p.address}</div>
                  <div className="text-gray-400 text-xs font-mono">{p.city}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-green-900 text-green-300 text-xs font-mono px-2 py-0.5 rounded-sm">{p.status}</span>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
                </div>
              </div>
              <div className="mt-3 flex gap-4 flex-wrap">
                <span className="text-amber-400 font-mono font-bold text-lg">{fmt(p.listPrice)}</span>
                <span className="text-gray-500 text-xs self-end font-mono">{p.beds}bd · {p.baths}ba · {p.sqft.toLocaleString()} sqft</span>
                <span className="text-gray-500 text-xs self-end font-mono">DOM {p.dom}</span>
              </div>
              <div className="mt-2 text-gray-700 text-xs font-mono">Last updated {p.lastUpdated}</div>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
