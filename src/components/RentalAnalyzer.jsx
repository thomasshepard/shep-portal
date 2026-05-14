import { useState, useRef } from 'react'
import {
  X, Upload, TrendingUp, Home, Sparkles, AlertCircle,
  DollarSign, BarChart2, Lightbulb, Printer, ArrowUp, ArrowDown,
  MessageSquare, CheckSquare, Square, Save, Clock, ExternalLink,
} from 'lucide-react'
import { createRecord, PM_BASE_ID } from '../lib/airtable'

const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const RENTCAST_KEY = import.meta.env.VITE_RENTCAST_API_KEY
const AT_PAT = import.meta.env.VITE_AIRTABLE_PAT

// In dev, proxy through Vite to avoid CORS (localhost → Anthropic not allowed).
// In production (GitHub Pages HTTPS), call Anthropic directly.
const CLAUDE_URL = import.meta.env.DEV
  ? '/api/anthropic/v1/messages'
  : 'https://api.anthropic.com/v1/messages'

const PROPERTY_TYPES = ['Single Family', 'Condo', 'Townhouse', 'Apartment', 'Multi Family']
const RENTCAST_TYPE_MAP = {
  'Single Family': 'Single Family',
  'Condo': 'Condo',
  'Townhouse': 'Townhouse',
  'Apartment': 'Apartment',
  'Multi Family': 'Multi Family',
}

const QUALITY_ITEMS = [
  { key: 'updated_kitchen',  label: 'Updated Kitchen' },
  { key: 'updated_bath',     label: 'Updated Bathroom(s)' },
  { key: 'washer_dryer',     label: 'Washer/Dryer In-Unit' },
  { key: 'wd_hookups',       label: 'W/D Hookups Only' },
  { key: 'central_ac',       label: 'Central Air Conditioning' },
  { key: 'window_ac',        label: 'Window A/C' },
  { key: 'garage',           label: 'Garage' },
  { key: 'carport',          label: 'Covered Parking/Carport' },
  { key: 'private_yard',     label: 'Private Yard' },
  { key: 'new_flooring',     label: 'New/Updated Flooring' },
  { key: 'new_appliances',   label: 'New Appliances' },
  { key: 'dishwasher',       label: 'Dishwasher' },
  { key: 'storage',          label: 'Extra Storage' },
  { key: 'utilities_incl',   label: 'Utilities Included' },
  { key: 'pets_ok',          label: 'Pets Allowed' },
]

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

function fmt(n) {
  if (n == null || n === '') return '—'
  return '$' + Number(n).toLocaleString()
}

function PriorityBadge({ priority }) {
  const map = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[priority] || map.low}`}>{priority}</span>
}

function ResultCard({ icon: Icon, title, color = 'blue', children }) {
  const border = { blue: 'border-blue-200 bg-blue-50', green: 'border-green-200 bg-green-50', purple: 'border-purple-200 bg-purple-50', orange: 'border-orange-200 bg-orange-50', teal: 'border-teal-200 bg-teal-50' }
  const ic = { blue: 'text-blue-600', green: 'text-green-600', purple: 'text-purple-600', orange: 'text-orange-600', teal: 'text-teal-600' }
  return (
    <div className={`border rounded-xl p-4 ${border[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={ic[color]} />
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function RentalAnalyzer({ property, unit, currentRent = 0, onClose, onSaved }) {
  const pf = property?.fields || {}
  const uf = unit?.fields || {}

  // Seed helpers — prefer unit fields, fall back to property
  function seedStr(...keys) {
    for (const k of keys) {
      const v = uf[k] ?? pf[k]
      if (v != null && v !== '') return String(v)
    }
    return ''
  }
  function seedAddress() {
    const a = pf.Address
    if (!a) return ''
    return typeof a === 'string' ? a : (Array.isArray(a) ? a[0] : '')
  }

  // ── Form state ──────────────────────────────────────────────────────────────
  const [address,       setAddress]       = useState(seedAddress)
  const [beds,          setBeds]          = useState(() => seedStr('Bedrooms', '# Bedrooms', 'Beds'))
  const [baths,         setBaths]         = useState(() => seedStr('Bathrooms', '# Bathrooms', 'Baths'))
  const [sqft,          setSqft]          = useState(() => seedStr('Sq Ft', 'Square Footage', 'SqFt', 'SF'))
  const [propertyType,  setPropertyType]  = useState('Single Family')
  const [curRent,       setCurRent]       = useState(() => currentRent > 0 ? String(currentRent) : '')
  const [qualityChecked, setQualityChecked] = useState({})
  const [qualityNotes,  setQualityNotes]  = useState('')
  const [photos,        setPhotos]        = useState([])

  // ── Analysis state ──────────────────────────────────────────────────────────
  const [step,         setStep]         = useState('form') // 'form' | 'loading' | 'results' | 'error'
  const [loadingMsg,   setLoadingMsg]   = useState('')
  const [rentcastData, setRentcastData] = useState(null)
  const [rentcastError,setRentcastError]= useState(null)
  const [aiAnalysis,   setAiAnalysis]   = useState(null)
  const [errorMsg,     setErrorMsg]     = useState('')

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [saveError,   setSaveError]   = useState('')
  const [needsSetup,  setNeedsSetup]  = useState(false)  // true = table doesn't exist yet

  // ── Claude error (when Rentcast succeeds but Claude fails) ──────────────────
  const [claudeError, setClaudeError] = useState('')

  const fileInputRef = useRef(null)

  function toggleQuality(key) {
    setQualityChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }
  const selectedQuality = QUALITY_ITEMS.filter(q => qualityChecked[q.key]).map(q => q.label)

  // ── Photo handling ──────────────────────────────────────────────────────────
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newPhotos = await Promise.all(
      files.slice(0, 6 - photos.length).map(file => new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = ev => {
          const dataUrl = ev.target.result
          resolve({ name: file.name, base64: dataUrl.split(',')[1], mediaType: file.type || 'image/jpeg', preview: dataUrl })
        }
        reader.readAsDataURL(file)
      }))
    )
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 6))
    e.target.value = ''
  }
  function removePhoto(i) { setPhotos(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Rentcast API ────────────────────────────────────────────────────────────
  async function fetchRentcast() {
    if (!RENTCAST_KEY) return { data: null, error: 'Rentcast API key not configured (VITE_RENTCAST_API_KEY)' }
    if (!address.trim()) return { data: null, error: 'No address provided' }
    try {
      const params = new URLSearchParams({ address: address.trim(), compCount: '12' })
      if (beds)  params.set('bedrooms', beds)
      if (baths) params.set('bathrooms', baths)
      if (sqft)  params.set('squareFootage', sqft)
      params.set('propertyType', RENTCAST_TYPE_MAP[propertyType] || 'Single Family')

      const res = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${params}`, {
        headers: { 'X-Api-Key': RENTCAST_KEY },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { data: null, error: err?.message || `Rentcast error: HTTP ${res.status}` }
      }
      return { data: await res.json(), error: null }
    } catch (e) {
      return { data: null, error: e.message }
    }
  }

  // ── Claude AI ───────────────────────────────────────────────────────────────
  async function fetchClaudeAnalysis(rc) {
    if (!ANTH_KEY) return { data: null, error: 'Anthropic API key not configured' }

    const curRentNum = Number(curRent) || 0
    const unitLabel  = unit ? (uf.Name || 'Unit') : null
    const qualityStr = selectedQuality.length > 0
      ? selectedQuality.join(', ')
      : 'Standard — no notable premium features checked'

    const rentcastContext = rc
      ? `Rentcast AVM Estimate: ${fmt(rc.rent)}/mo  (range: ${fmt(rc.rentRangeLow)} – ${fmt(rc.rentRangeHigh)})

Rentcast Comparables (most relevant first):
${(rc.comparables || []).slice(0, 10).map((c, i) =>
    `  ${i + 1}. ${c.formattedAddress || c.address}: ${fmt(c.price)}/mo | ${c.bedrooms}bd/${c.bathrooms}ba${c.squareFootage ? ` | ${c.squareFootage.toLocaleString()}sf` : ''}${c.distance != null ? ` | ${Number(c.distance).toFixed(1)}mi` : ''}`
  ).join('\n')}`
      : 'No Rentcast data available. Use your knowledge of the Cookeville, TN / 38506 rental market.'

    const systemPrompt = `You are a professional rental market analyst for East Meadow Properties, a residential real estate investment company based in Cookeville, TN. Your analyses are used to support rent negotiations with tenants — the "binder strategy" — where documented market evidence is presented professionally. You write with authority, precision, and a constructive landlord-friendly tone. Always respond with valid JSON only — no markdown, no extra text.`

    const userText = `Produce a complete rental market analysis for this property.

PROPERTY DETAILS
Address: ${address || 'Not provided'}${unitLabel ? `\nUnit: ${unitLabel}` : ''}
Type: ${propertyType}
Bedrooms: ${beds || 'unknown'} | Bathrooms: ${baths || 'unknown'}${sqft ? ` | Sq Ft: ${sqft}` : ''}
${curRentNum > 0 ? `Current Rent: ${fmt(curRentNum)}/mo` : 'Current Rent: Not specified'}

UNIT QUALITY & FEATURES
${qualityStr}
${qualityNotes ? `Additional context: ${qualityNotes}` : ''}

MARKET DATA
${rentcastContext}

${photos.length > 0 ? `PHOTOS: ${photos.length} photo(s) provided — assess condition.` : 'No photos provided.'}

Return ONLY a JSON object with exactly this structure:
{
  "marketRentEstimate": <number, monthly rent in dollars>,
  "rentRange": { "low": <number>, "high": <number> },
  "recommendedRent": <number, the specific proposed rent — can be above market if quality justifies it>,
  "confidence": "<low|medium|high>",
  "rationale": "<2-3 sentence factual explanation of the market estimate and key data points>",
  "marketNarrative": "<3-4 sentence professional narrative written for a tenant binder — describe Cookeville market conditions, comparable evidence, demand drivers (TN Tech, local economy), and why the proposed rent is fair and market-justified. Tone: factual, respectful, professional.>",
  "qualityAdjustment": <dollar amount, positive or negative, applied to base market estimate for this unit's quality. 0 if neutral>,
  "qualityRationale": "<1-2 sentence explanation of the quality adjustment — what specific features justify the adjustment>",
  "talkingPoints": [
    "<concise landlord talking point 1>",
    "<concise landlord talking point 2>",
    "<concise landlord talking point 3>",
    "<concise landlord talking point 4>"
  ],
  "conditionSummary": ${photos.length > 0 ? '"<brief condition assessment from photos, 1-2 sentences>"' : 'null'},
  "improvements": [
    {
      "item": "<specific concrete improvement>",
      "estimatedCost": "<dollar range, e.g. $800–$1,500>",
      "rentBoost": "<estimated monthly rent increase, e.g. $75–$125/mo>",
      "priority": "<high|medium|low>",
      "detail": "<1 sentence on why this helps in this market>"
    }
  ]
}`

    const content = photos.length > 0
      ? [
          ...photos.map(p => ({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } })),
          { type: 'text', text: userText },
        ]
      : userText

    try {
      const claudeHeaders = {
        'x-api-key': ANTH_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      }

      const res = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: claudeHeaders,
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1800,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        }),
      })
      const data = await res.json()
      if (!res.ok) return { data: null, error: data?.error?.message || `Claude error: HTTP ${res.status}` }
      // Strip markdown code fences Claude sometimes wraps around JSON
      let rawText = data.content?.[0]?.text || '{}'
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      const parsed = JSON.parse(rawText)
      return { data: parsed, error: null }
    } catch (e) {
      return { data: null, error: `Response parse error: ${e.message}` }
    }
  }

  // ── Save analysis to Airtable ───────────────────────────────────────────────
  // The "Rent Analyses" table must exist in the PM base. If it doesn't,
  // we show setup instructions rather than trying to auto-create it
  // (PAT may not have schema.bases:write scope).
  async function saveToAirtable() {
    setSaving(true)
    setSaveError('')
    setNeedsSetup(false)

    const curRentNum = Number(curRent) || 0
    const unitLabel  = unit ? (uf.Name || 'Unit') : null
    const rec        = aiAnalysis || {}

    const { error } = await createRecord('Rent Analyses', {
      Name:               `${address}${unitLabel ? ' – ' + unitLabel : ''} (${new Date().toLocaleDateString()})`,
      'Property ID':      property?.id || '',
      'Property Address': address,
      Unit:               unitLabel || '',
      'Analysis Date':    new Date().toISOString().split('T')[0],
      'Current Rent':     curRentNum,
      'Market Estimate':  rec.marketRentEstimate || rentcastData?.rent || 0,
      'Recommended Rent': rec.recommendedRent || rec.marketRentEstimate || rentcastData?.rent || 0,
      'Market Range Low':  rec.rentRange?.low  || rentcastData?.rentRangeLow  || 0,
      'Market Range High': rec.rentRange?.high || rentcastData?.rentRangeHigh || 0,
      Confidence:         rec.confidence || '',
      'Comps Count':      rentcastData?.comparables?.length || 0,
      'Features Checked': selectedQuality.join(', '),
      'Quality Notes':    qualityNotes,
      'AI Narrative':     rec.marketNarrative || rec.rationale || '',
      'Talking Points':   (rec.talkingPoints || []).join('\n'),
      Improvements:       (rec.improvements || []).map(i => `[${i.priority}] ${i.item} — ${i.rentBoost}`).join('\n'),
      'Full Data JSON':   JSON.stringify({ rentcastData, aiAnalysis }, null, 2),
    }, PM_BASE_ID)

    if (error) {
      // Detect "table not found" — show setup instructions instead of raw error
      const isNotFound = /not found|could not find|invalid/i.test(error)
      if (isNotFound) {
        setNeedsSetup(true)
      } else {
        setSaveError(error)
      }
    } else {
      setSaved(true)
      onSaved?.()
    }
    setSaving(false)
  }

  // ── Analyze flow ────────────────────────────────────────────────────────────
  async function analyze() {
    if (!address.trim()) { setErrorMsg('Please enter a property address.'); return }
    setErrorMsg('')
    setClaudeError('')
    setNeedsSetup(false)
    setStep('loading')

    setLoadingMsg('Fetching Rentcast rental comps…')
    const rcResult = await fetchRentcast()
    if (rcResult.data) setRentcastData(rcResult.data)
    else setRentcastError(rcResult.error)

    setLoadingMsg(photos.length > 0 ? 'Analyzing property photos with Claude AI…' : 'Running Claude AI market analysis…')
    const aiResult = await fetchClaudeAnalysis(rcResult.data)

    if (aiResult.error && !rcResult.data) {
      setStep('error')
      setErrorMsg(`Analysis failed: ${aiResult.error}`)
      return
    }
    if (aiResult.error) setClaudeError(aiResult.error)
    if (aiResult.data) setAiAnalysis(aiResult.data)
    setStep('results')
  }

  function reset() {
    setStep('form')
    setRentcastData(null)
    setRentcastError(null)
    setAiAnalysis(null)
    setErrorMsg('')
    setSaved(false)
    setSaveError('')
    setClaudeError('')
    setNeedsSetup(false)
  }

  // ── Binder report ───────────────────────────────────────────────────────────
  function generateBinder() {
    const curRentNum  = Number(curRent) || 0
    const recommended = aiAnalysis?.recommendedRent || aiAnalysis?.marketRentEstimate || rentcastData?.rent
    const low         = aiAnalysis?.rentRange?.low  || rentcastData?.rentRangeLow
    const high        = aiAnalysis?.rentRange?.high || rentcastData?.rentRangeHigh
    const comps       = rentcastData?.comparables || []
    const unitLabel   = unit ? (uf.Name || 'Unit') : null
    const today       = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    const deltaAmt  = recommended && curRentNum > 0 ? Math.round(recommended - curRentNum) : null
    const deltaPct  = deltaAmt != null && curRentNum > 0 ? Math.abs((deltaAmt / curRentNum) * 100).toFixed(1) : null
    const deltaDir  = deltaAmt != null ? (deltaAmt >= 0 ? 'increase' : 'decrease') : null

    const talkingPoints = aiAnalysis?.talkingPoints || []
    const improvements  = aiAnalysis?.improvements  || []
    const hasNarrative  = !!(aiAnalysis?.marketNarrative || aiAnalysis?.rationale)

    // Build Zillow search URL for a comp address
    function zillowUrl(addr) {
      return `https://www.zillow.com/homes/for_rent/${encodeURIComponent(addr)}_rb/`
    }

    // Subject property photos as base64 img tags
    const photoHtml = photos.length > 0
      ? photos.map(p => `<img src="data:${p.mediaType};base64,${p.base64}" alt="Property photo" class="prop-photo" />`).join('')
      : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rental Market Analysis — ${address}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; font-size: 13px; line-height: 1.55; }
  .page { max-width: 820px; margin: 0 auto; padding: 44px 52px 32px; }

  /* Print bar — hidden when printing */
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e40af; color: #fff; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; font-family: system-ui, sans-serif; font-size: 13px; z-index: 999; }
  .print-btn { background: #fff; color: #1e40af; border: none; border-radius: 6px; padding: 6px 18px; font-weight: 700; cursor: pointer; font-size: 13px; }
  .spacer { height: 44px; }
  @media print {
    .print-bar, .spacer { display: none !important; }
    body { font-size: 10px; }
    .page { padding: 14px 28px 10px; }
    .section { margin-bottom: 14px; }
    .headline { margin-bottom: 14px; }
    .mbox { padding: 9px 10px; }
    .mval { font-size: 20px; }
    .narrative { padding: 9px 12px; }
    .comp-table-wrap { page-break-inside: avoid; }
    table { page-break-inside: avoid; }
    .imp-row { page-break-inside: avoid; }
    .footer { page-break-before: avoid; margin-top: 12px; }
    .tp-item { padding: 5px 0; }
    .prop-photo { height: 110px; }
    .stitle { margin-bottom: 7px; }
  }

  /* Header */
  .header { border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 22px; }
  .co-name { font-family: system-ui, sans-serif; font-size: 24px; font-weight: 800; color: #1e40af; letter-spacing: -0.5px; }
  .co-tag  { font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .doc-title { font-size: 19px; font-weight: 700; margin-top: 14px; color: #111827; }
  .doc-meta { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 8px; }
  .doc-meta span { font-family: system-ui, sans-serif; font-size: 12px; color: #6b7280; }
  .doc-meta strong { color: #374151; }

  /* Headline metrics */
  .headline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 22px; }
  .mbox { border: 1px solid #e5e7eb; border-radius: 10px; padding: 13px 14px; text-align: center; background: #fff; }
  .mbox.blue  { background: #eff6ff; border-color: #bfdbfe; }
  .mbox.green { background: #f0fdf4; border-color: #bbf7d0; }
  .mlabel { font-family: system-ui, sans-serif; font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .mval   { font-size: 26px; font-weight: 700; font-family: system-ui, sans-serif; color: #111827; line-height: 1; }
  .mval.blue  { color: #1e40af; }
  .mval.green { color: #15803d; }
  .msub   { font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; margin-top: 4px; }

  /* Sections */
  .section { margin-bottom: 22px; }
  .stitle { font-family: system-ui, sans-serif; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; }

  /* Subject property photos */
  .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .prop-photo { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; display: block; }
  @media print { .prop-photo { height: 130px; } }

  /* Narrative */
  .narrative { background: #f9fafb; border-left: 4px solid #1e40af; border-radius: 0 8px 8px 0; padding: 13px 16px; font-size: 13px; color: #374151; line-height: 1.75; }
  .quality-note { margin-top: 9px; font-family: system-ui, sans-serif; font-size: 12px; color: #4b5563; }

  /* Features tags */
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag  { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 8px; font-family: system-ui, sans-serif; font-size: 11px; font-weight: 500; }

  /* Comp table */
  table { width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 11.5px; }
  thead tr { background: #f3f4f6; }
  th { padding: 8px 9px; text-align: left; font-size: 10px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.3px; }
  td { padding: 7px 9px; border-bottom: 1px solid #f3f4f6; color: #374151; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafafa; }
  .rent-col { font-weight: 700; color: #1e40af; white-space: nowrap; }
  .subject-row td { background: #eff6ff !important; font-weight: 600; }
  .subject-row .rent-col { color: #15803d; }
  .zillow-link { color: #1e40af; text-decoration: none; }
  .zillow-link:hover { text-decoration: underline; }
  .zillow-badge { display: inline-block; font-size: 9px; background: #dbeafe; color: #1e40af; border-radius: 3px; padding: 1px 4px; margin-left: 4px; vertical-align: middle; font-family: system-ui, sans-serif; font-weight: 600; }
  @media print { .zillow-badge { display: none; } }
  .table-note { font-family: system-ui, sans-serif; font-size: 10px; color: #9ca3af; margin-top: 6px; }

  /* Talking points */
  .tp-list { list-style: none; }
  .tp-item { display: flex; align-items: flex-start; gap: 9px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-family: system-ui, sans-serif; font-size: 12px; color: #374151; }
  .tp-item:last-child { border-bottom: none; }
  .tp-num { width: 20px; height: 20px; min-width: 20px; background: #1e40af; border-radius: 50%; color: white; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }

  /* Improvements */
  .imp-row { display: flex; align-items: flex-start; gap: 11px; border: 1px solid #e5e7eb; border-radius: 7px; padding: 9px 12px; margin-bottom: 6px; }
  .imp-badge { font-family: system-ui, sans-serif; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; text-transform: uppercase; margin-top: 1px; }
  .imp-badge.high   { background: #fee2e2; color: #b91c1c; }
  .imp-badge.medium { background: #fef3c7; color: #92400e; }
  .imp-badge.low    { background: #f3f4f6; color: #6b7280; }
  .imp-body { flex: 1; }
  .imp-name   { font-family: system-ui, sans-serif; font-size: 12px; font-weight: 600; color: #111827; }
  .imp-detail { font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; margin-top: 2px; }
  .imp-nums { margin-left: auto; text-align: right; flex-shrink: 0; }
  .imp-cost  { font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; white-space: nowrap; }
  .imp-boost { font-family: system-ui, sans-serif; font-size: 12px; font-weight: 700; color: #15803d; white-space: nowrap; }

  /* Footer — kept tight to content, never on its own page */
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-family: system-ui, sans-serif; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; page-break-before: avoid; }
</style>
</head>
<body>
<div class="print-bar">
  <span>📋 Rental Market Analysis — <strong>${address}${unitLabel ? ' · ' + unitLabel : ''}</strong></span>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
</div>
<div class="spacer"></div>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="co-name">East Meadow Properties</div>
    <div class="co-tag">Residential Real Estate · Cookeville, TN</div>
    <div class="doc-title">Rental Market Comparative Analysis</div>
    <div class="doc-meta">
      <span><strong>Property:</strong> ${address}</span>
      ${unitLabel ? `<span><strong>Unit:</strong> ${unitLabel}</span>` : ''}
      <span><strong>Date:</strong> ${today}</span>
      ${beds ? `<span><strong>Bed/Bath:</strong> ${beds}BR / ${baths || '?'}BA</span>` : ''}
      ${sqft ? `<span><strong>Size:</strong> ${Number(sqft).toLocaleString()} sf</span>` : ''}
      <span><strong>Type:</strong> ${propertyType}</span>
    </div>
  </div>

  <!-- Headline Metrics -->
  <div class="headline">
    ${curRentNum > 0 ? `
    <div class="mbox">
      <div class="mlabel">Current Rent</div>
      <div class="mval">$${curRentNum.toLocaleString()}</div>
      <div class="msub">per month</div>
    </div>` : `<div></div>`}
    <div class="mbox blue">
      <div class="mlabel">Market Estimate</div>
      <div class="mval blue">${fmt(aiAnalysis?.marketRentEstimate || rentcastData?.rent)}</div>
      <div class="msub">range: ${fmt(low)} – ${fmt(high)}</div>
    </div>
    <div class="mbox green">
      <div class="mlabel">Recommended Rent</div>
      <div class="mval green">${fmt(recommended)}</div>
      <div class="msub">${deltaAmt != null
        ? `${deltaAmt >= 0 ? '+' : ''}$${deltaAmt.toLocaleString()} / ${deltaPct}% ${deltaDir}`
        : `${aiAnalysis?.confidence || 'Rentcast'} estimate`
      }</div>
    </div>
  </div>

  <!-- Subject Property Photos -->
  ${photoHtml ? `
  <div class="section">
    <div class="stitle">Subject Property Photos</div>
    <div class="photo-grid">${photoHtml}</div>
  </div>` : ''}

  <!-- Market Analysis -->
  ${hasNarrative ? `
  <div class="section">
    <div class="stitle">Market Analysis</div>
    <div class="narrative">${aiAnalysis.marketNarrative || aiAnalysis.rationale}</div>
    ${aiAnalysis?.qualityRationale ? `<div class="quality-note"><strong>Quality Adjustment (${aiAnalysis.qualityAdjustment >= 0 ? '+' : ''}${fmt(aiAnalysis.qualityAdjustment)}/mo):</strong> ${aiAnalysis.qualityRationale}</div>` : ''}
  </div>` : ''}

  <!-- Unit Features -->
  ${selectedQuality.length > 0 ? `
  <div class="section">
    <div class="stitle">Unit Features &amp; Amenities</div>
    <div class="tags">${selectedQuality.map(q => `<span class="tag">${q}</span>`).join('')}</div>
    ${qualityNotes ? `<div class="quality-note" style="margin-top:9px">${qualityNotes}</div>` : ''}
  </div>` : ''}

  <!-- Comparable Properties -->
  ${comps.length > 0 ? `
  <div class="section">
    <div class="stitle">Comparable Rental Properties &nbsp;·&nbsp; ${comps.length} Comps Analyzed</div>
    <div class="comp-table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Address</th>
          <th>Bed/Bath</th>
          <th>Sq Ft</th>
          <th>Distance</th>
          <th>Rent / Mo</th>
        </tr>
      </thead>
      <tbody>
        <tr class="subject-row">
          <td>★</td>
          <td><strong>Subject Property${unitLabel ? ' – ' + unitLabel : ''}</strong></td>
          <td>${beds || '?'}bd / ${baths || '?'}ba</td>
          <td>${sqft ? Number(sqft).toLocaleString() + ' sf' : '—'}</td>
          <td>—</td>
          <td class="rent-col">${fmt(recommended)} <span style="font-size:9.5px;font-weight:400;color:#6b7280;">(proposed)</span></td>
        </tr>
        ${comps.slice(0, 10).map((c, i) => {
          const addr = c.formattedAddress || c.address || ''
          return `<tr>
          <td>${i + 1}</td>
          <td>${addr
            ? `<a href="${zillowUrl(addr)}" target="_blank" class="zillow-link">${addr}<span class="zillow-badge">Zillow ↗</span></a>`
            : '—'}</td>
          <td>${c.bedrooms || '?'}bd / ${c.bathrooms || '?'}ba</td>
          <td>${c.squareFootage ? Number(c.squareFootage).toLocaleString() + ' sf' : '—'}</td>
          <td>${c.distance != null ? Number(c.distance).toFixed(1) + ' mi' : '—'}</td>
          <td class="rent-col">${fmt(c.price)}</td>
        </tr>`}).join('')}
      </tbody>
    </table>
    <div class="table-note">
      Source: Rentcast Rental Market API · Data as of ${today} ·
      Click any address above to view listing photos on Zillow (links hidden when printing)
    </div>
    </div>
  </div>` : ''}

  <!-- Talking Points -->
  ${talkingPoints.length > 0 ? `
  <div class="section">
    <div class="stitle">Conversation Talking Points</div>
    <ul class="tp-list">
      ${talkingPoints.map((tp, i) => `<li class="tp-item"><span class="tp-num">${i + 1}</span><span>${tp}</span></li>`).join('')}
    </ul>
  </div>` : ''}

  <!-- Improvements -->
  ${improvements.length > 0 ? `
  <div class="section">
    <div class="stitle">Value-Add Improvement Opportunities</div>
    ${improvements.map(item => `
    <div class="imp-row">
      <span class="imp-badge ${item.priority}">${item.priority}</span>
      <div class="imp-body">
        <div class="imp-name">${item.item}</div>
        ${item.detail ? `<div class="imp-detail">${item.detail}</div>` : ''}
      </div>
      <div class="imp-nums">
        <div class="imp-cost">${item.estimatedCost}</div>
        <div class="imp-boost">+${item.rentBoost}</div>
      </div>
    </div>`).join('')}
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>East Meadow Properties · thomas@eastmeadowproperties.com · Prepared for internal use</span>
    <span>Generated ${today} · Rentcast${aiAnalysis ? ' + Claude AI' : ''}</span>
  </div>

</div>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  // ── Derived display values ──────────────────────────────────────────────────
  const displayEstimate = aiAnalysis?.marketRentEstimate || rentcastData?.rent
  const displayLow      = aiAnalysis?.rentRange?.low     || rentcastData?.rentRangeLow
  const displayHigh     = aiAnalysis?.rentRange?.high    || rentcastData?.rentRangeHigh
  const recommended     = aiAnalysis?.recommendedRent    || displayEstimate
  const curRentNum      = Number(curRent) || 0
  const delta           = recommended && curRentNum > 0 ? Math.round(recommended - curRentNum) : null
  const deltaPct        = delta != null && curRentNum > 0 ? ((Math.abs(delta) / curRentNum) * 100).toFixed(1) : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">Rental Market Analyzer</h2>
              {unit && <p className="text-xs text-gray-400">{uf.Name || 'Unit'}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">

          {/* ── FORM ── */}
          {step === 'form' && (
            <>
              {/* Address */}
              <div>
                <label className={lbl}>Property Address *</label>
                <input className={inp} placeholder="123 Main St, City, State ZIP" value={address} onChange={e => setAddress(e.target.value)} />
              </div>

              {/* Beds / Baths / Sqft / Type */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={lbl}>Bedrooms</label>
                  <input className={inp} type="number" min="0" placeholder="3" value={beds} onChange={e => setBeds(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Bathrooms</label>
                  <input className={inp} type="number" min="0" step="0.5" placeholder="1" value={baths} onChange={e => setBaths(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Sq Ft</label>
                  <input className={inp} type="number" min="0" placeholder="1,200" value={sqft} onChange={e => setSqft(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Type</label>
                  <select className={inp} value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                    {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Current Rent */}
              <div>
                <label className={lbl}>Current Rent (optional — enables market gap analysis)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    className={inp + ' pl-6'}
                    type="number"
                    min="0"
                    step="25"
                    placeholder="1,100"
                    value={curRent}
                    onChange={e => setCurRent(e.target.value)}
                  />
                </div>
              </div>

              {/* Quality Checklist */}
              <div>
                <label className={lbl}>Unit Features & Amenities</label>
                <div className="border border-gray-200 rounded-lg p-3 grid grid-cols-2 gap-1.5">
                  {QUALITY_ITEMS.map(q => (
                    <button
                      key={q.key}
                      onClick={() => toggleQuality(q.key)}
                      className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-md transition-colors ${
                        qualityChecked[q.key]
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {qualityChecked[q.key]
                        ? <CheckSquare size={13} className="text-blue-600 flex-shrink-0" />
                        : <Square size={13} className="text-gray-300 flex-shrink-0" />
                      }
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Notes */}
              <div>
                <label className={lbl}>Additional Notes (condition, upgrades, neighborhood — helps Claude write the binder narrative)</label>
                <textarea
                  className={inp + ' resize-none'}
                  rows={2}
                  placeholder="e.g. Large backyard, corner lot, near TN Tech, newly painted interior, good condition overall…"
                  value={qualityNotes}
                  onChange={e => setQualityNotes(e.target.value)}
                />
              </div>

              {/* Photo Upload */}
              <div>
                <label className={lbl}>
                  Photos <span className="text-gray-400 font-normal">(optional — Claude will assess condition)</span>
                </label>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {photos.map((p, i) => (
                      <div key={i} className="relative group">
                        <img src={p.preview} alt={p.name} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    {photos.length < 6 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                      >
                        <Upload size={18} />
                      </button>
                    )}
                  </div>
                )}
                {photos.length === 0 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl py-5 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    <Upload size={20} />
                    <span className="text-sm">Upload photos (up to 6)</span>
                    <span className="text-xs">Kitchen, bathrooms, living areas</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />
                  {errorMsg}
                </div>
              )}

              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                Pulls <strong>12 comparable rentals</strong> from Rentcast, then runs <strong>Claude AI</strong> to build a binder-ready report — market narrative, talking points, and improvement ROI.
              </div>
            </>
          )}

          {/* ── LOADING ── */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-700">{loadingMsg}</p>
              <p className="text-xs text-gray-400">This may take 15–25 seconds…</p>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-sm text-gray-600 text-center">{errorMsg}</p>
              <button onClick={reset} className="text-sm text-blue-600 hover:underline">Try again</button>
            </div>
          )}

          {/* ── RESULTS ── */}
          {step === 'results' && (
            <>
              {/* Claude AI error warning */}
              {claudeError && (
                <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                  <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-yellow-800">Claude AI didn't run — Rentcast data only</p>
                    <p className="text-xs text-yellow-700 mt-0.5">{claudeError}</p>
                    {ANTH_KEY ? (
                      <p className="text-xs text-yellow-600 mt-1">API key is configured — try restarting the dev server if this is local, or re-run the analysis.</p>
                    ) : (
                      <p className="text-xs text-yellow-600 mt-1">Add <code className="bg-yellow-100 px-1 rounded">VITE_ANTHROPIC_API_KEY</code> to your <code className="bg-yellow-100 px-1 rounded">.env</code> file and restart the dev server.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Current vs Market delta */}
              {curRentNum > 0 && recommended && (
                <div className={`rounded-xl p-4 border ${delta >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Current vs Market</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{fmt(curRentNum)}</span>
                        <span className="text-gray-400 text-sm">→</span>
                        <span className={`text-2xl font-bold ${delta >= 0 ? 'text-amber-700' : 'text-green-700'}`}>{fmt(recommended)}</span>
                        <span className="text-gray-500 text-sm">/mo</span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-lg font-bold px-3 py-1 rounded-lg ${delta >= 0 ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>
                      {delta >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                      {delta >= 0 ? '+' : ''}{fmt(delta)}
                      {deltaPct && <span className="text-sm font-normal ml-1">({deltaPct}%)</span>}
                    </div>
                  </div>
                  {delta >= 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      Unit is currently <strong>{fmt(delta)}/mo below market</strong> — binder report documents this gap with {rentcastData?.comparables?.length || 0} local comps.
                    </p>
                  )}
                </div>
              )}

              {/* Market Rent Estimate */}
              <ResultCard icon={DollarSign} title="Estimated Market Rent" color="green">
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">{fmt(displayEstimate)}</span>
                    <span className="text-gray-500 text-sm">/mo</span>
                  </div>
                  {(displayLow || displayHigh) && (
                    <p className="text-sm text-gray-500">
                      Market range: <span className="font-medium text-gray-700">{fmt(displayLow)} – {fmt(displayHigh)}/mo</span>
                    </p>
                  )}
                  {recommended && recommended !== displayEstimate && (
                    <p className="text-sm text-gray-700">
                      Recommended ask: <span className="font-bold text-green-700">{fmt(recommended)}/mo</span>
                      {aiAnalysis?.qualityAdjustment !== 0 && aiAnalysis?.qualityAdjustment != null && (
                        <span className="text-gray-400 text-xs ml-1">
                          ({aiAnalysis.qualityAdjustment > 0 ? '+' : ''}{fmt(aiAnalysis.qualityAdjustment)} quality adj.)
                        </span>
                      )}
                    </p>
                  )}
                  {aiAnalysis?.confidence && (
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      aiAnalysis.confidence === 'high' ? 'bg-green-100 text-green-700' :
                      aiAnalysis.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {aiAnalysis.confidence} confidence
                    </span>
                  )}
                </div>
                {aiAnalysis?.rationale && (
                  <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-green-200">{aiAnalysis.rationale}</p>
                )}
              </ResultCard>

              {/* Rentcast Comparables */}
              {rentcastData?.comparables?.length > 0 && (
                <ResultCard icon={BarChart2} title={`Rentcast Comparables (${rentcastData.comparables.length} found)`} color="blue">
                  <div className="space-y-1.5">
                    {rentcastData.comparables.slice(0, 8).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-blue-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 text-xs truncate">{c.formattedAddress || c.address}</p>
                          <p className="text-gray-400 text-xs">
                            {c.bedrooms}bd · {c.bathrooms}ba
                            {c.squareFootage ? ` · ${c.squareFootage.toLocaleString()}sf` : ''}
                            {c.distance != null ? ` · ${Number(c.distance).toFixed(1)}mi` : ''}
                          </p>
                        </div>
                        <span className="font-semibold text-gray-800 ml-3 flex-shrink-0">{fmt(c.price)}/mo</span>
                      </div>
                    ))}
                  </div>
                  {rentcastData.comparables.length > 8 && (
                    <p className="text-xs text-blue-600 mt-2">+ {rentcastData.comparables.length - 8} more comps included in binder report</p>
                  )}
                  {rentcastError && <p className="text-xs text-yellow-600 mt-2">Note: {rentcastError}</p>}
                </ResultCard>
              )}

              {/* Rentcast error only */}
              {rentcastError && !rentcastData?.comparables?.length && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  Rentcast unavailable: {rentcastError}. Analysis is AI-only.
                </div>
              )}

              {/* Condition */}
              {aiAnalysis?.conditionSummary && (
                <ResultCard icon={Home} title="Property Condition (from photos)" color="purple">
                  <p className="text-sm text-gray-700">{aiAnalysis.conditionSummary}</p>
                </ResultCard>
              )}

              {/* Talking Points */}
              {aiAnalysis?.talkingPoints?.length > 0 && (
                <ResultCard icon={MessageSquare} title="Tenant Conversation Talking Points" color="teal">
                  <ul className="space-y-2">
                    {aiAnalysis.talkingPoints.map((tp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="w-5 h-5 min-w-5 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                        {tp}
                      </li>
                    ))}
                  </ul>
                </ResultCard>
              )}

              {/* Improvements */}
              {aiAnalysis?.improvements?.length > 0 && (
                <ResultCard icon={Lightbulb} title="Rent-Boosting Improvements" color="orange">
                  <div className="space-y-3">
                    {aiAnalysis.improvements.map((item, i) => (
                      <div key={i} className="bg-white rounded-lg p-3 border border-orange-100 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 flex-1">{item.item}</p>
                          <PriorityBadge priority={item.priority} />
                        </div>
                        {item.detail && <p className="text-xs text-gray-500">{item.detail}</p>}
                        <div className="flex items-center gap-4 text-xs text-gray-600 pt-1">
                          <span>💰 Cost: <strong>{item.estimatedCost}</strong></span>
                          <span>📈 Boost: <strong className="text-green-700">{item.rentBoost}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ResultCard>
              )}

              <button onClick={reset} className="w-full text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 py-1">
                ← Edit inputs & re-analyze
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
            <button
              onClick={analyze}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles size={16} />
              Analyze Rental Market
            </button>
          </div>
        )}

        {step === 'results' && (
          <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0 space-y-2">
            {/* Primary: Generate Binder */}
            <button
              onClick={generateBinder}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
            >
              <Printer size={16} />
              Generate Binder Report
            </button>

            {/* Secondary: Save to Airtable */}
            {saved ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl py-2.5">
                <Save size={14} />
                Report saved to Airtable ✓
              </div>
            ) : (
              <button
                onClick={saveToAirtable}
                disabled={saving}
                className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors disabled:opacity-60 text-sm"
              >
                {saving ? (
                  <><div className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" /> Saving…</>
                ) : (
                  <><Save size={14} /> Save Report to Airtable</>
                )}
              </button>
            )}
            {saveError && (
              <p className="text-xs text-red-600 text-center">{saveError}</p>
            )}

            {/* needsSetup: Rent Analyses table doesn't exist yet */}
            {needsSetup && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-2">
                <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={13} /> One-time setup needed</p>
                <p>Create a table called <strong>"Rent Analyses"</strong> in your <strong>Property Management</strong> Airtable base with these fields:</p>
                <div className="bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 font-mono text-xs leading-relaxed space-y-0.5">
                  {[
                    ['Name', 'Single line text (primary)'],
                    ['Property ID', 'Single line text'],
                    ['Property Address', 'Single line text'],
                    ['Unit', 'Single line text'],
                    ['Analysis Date', 'Date'],
                    ['Current Rent', 'Currency'],
                    ['Market Estimate', 'Currency'],
                    ['Recommended Rent', 'Currency'],
                    ['Market Range Low', 'Currency'],
                    ['Market Range High', 'Currency'],
                    ['Confidence', 'Single line text'],
                    ['Comps Count', 'Number'],
                    ['Features Checked', 'Long text'],
                    ['Quality Notes', 'Long text'],
                    ['AI Narrative', 'Long text'],
                    ['Talking Points', 'Long text'],
                    ['Improvements', 'Long text'],
                    ['Full Data JSON', 'Long text'],
                  ].map(([name, type]) => (
                    <div key={name} className="flex gap-2">
                      <span className="font-semibold text-amber-900 w-36 flex-shrink-0">{name}</span>
                      <span className="text-amber-600">{type}</span>
                    </div>
                  ))}
                </div>
                <p>Then click <strong>"Save Report to Airtable"</strong> again — it will work once the table exists.</p>
              </div>
            )}

            <p className="text-xs text-center text-gray-400">Print-ready binder · Save for your records</p>
          </div>
        )}
      </div>
    </div>
  )
}
