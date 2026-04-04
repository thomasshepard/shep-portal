import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  ChevronLeft, ChevronDown,
  CloudSun, AlertCircle, FileText, MapPin, Navigation, GripVertical,
} from 'lucide-react'

// ─── Content helpers ──────────────────────────────────────────────────────────
const SectionHead = ({ children }) => (
  <h3 className="font-semibold text-gray-700 mt-5 mb-2 text-xs uppercase tracking-widest">{children}</h3>
)
const P = ({ children }) => (
  <p className="text-gray-600 text-sm leading-relaxed mb-3">{children}</p>
)
const Steps = ({ items }) => (
  <ol className="space-y-2 mb-4">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-sm text-gray-600">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
        <span className="leading-relaxed">{item}</span>
      </li>
    ))}
  </ol>
)
const GuideTable = ({ headers, rows }) => (
  <div className="overflow-x-auto mb-4 rounded-lg border border-gray-100">
    <table className="w-full text-sm border-collapse">
      <thead><tr className="bg-gray-50">
        {headers.map((h, i) => <th key={i} className="text-left px-3 py-2 text-gray-500 font-medium text-xs uppercase tracking-wide border-b border-gray-100">{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            {row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700 text-sm border-b border-gray-50">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
const Warn = ({ children }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex gap-2">
    <span className="flex-shrink-0">⚠️</span>
    <p className="text-amber-800 text-sm leading-relaxed">{children}</p>
  </div>
)
const Tip = ({ children }) => (
  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex gap-2">
    <span className="flex-shrink-0">✅</span>
    <p className="text-green-800 text-sm leading-relaxed">{children}</p>
  </div>
)
const Info = ({ children }) => (
  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 flex gap-2">
    <span className="flex-shrink-0">ℹ️</span>
    <p className="text-blue-800 text-sm leading-relaxed">{children}</p>
  </div>
)

// ─── V1 — ClientLifecycleFlow ─────────────────────────────────────────────────
function ClientLifecycleFlow() {
  const stages = [
    { label: 'Lead', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { label: 'Scheduled', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { label: 'Complete', color: 'bg-green-100 text-green-800 border-green-200' },
    { label: 'Invoiced', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { label: 'Recurring', color: 'bg-green-200 text-green-900 border-green-300' },
  ]
  const transitions = ['Schedule mow', 'Mark Complete', 'Send Invoice', 'Set Recurring']
  return (
    <div className="overflow-x-auto mb-4">
      <div className="min-w-[480px] py-2">
        <div className="flex items-center gap-0">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center gap-0 flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1">
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${s.color}`}>{s.label}</span>
                {i < transitions.length && (
                  <span className="text-gray-400 text-xs mt-1 whitespace-nowrap">&nbsp;</span>
                )}
              </div>
              {i < stages.length - 1 && (
                <div className="flex flex-col items-center shrink-0 mx-1">
                  <div className="flex items-center">
                    <div className="w-4 h-px bg-gray-300" />
                    <span className="text-gray-400 text-xs">›</span>
                  </div>
                  <span className="text-gray-400 text-xs mt-1 whitespace-nowrap">{transitions[i]}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-3">🔁 After Recurring: each completion auto-creates the next mow</p>
      </div>
    </div>
  )
}

// ─── V2 — StatusBadges ────────────────────────────────────────────────────────
function StatusBadges() {
  const statuses = [
    { label: 'Lead', color: 'bg-yellow-100 text-yellow-800', desc: 'Reached out — not yet scheduled' },
    { label: 'Recurring', color: 'bg-green-100 text-green-800', desc: 'Active — auto-scheduling on' },
    { label: 'One-Time', color: 'bg-blue-100 text-blue-800', desc: 'Had a mow — not recurring' },
    { label: 'Cold', color: 'bg-gray-100 text-gray-700', desc: 'Quiet — follow up later' },
    { label: 'Lost', color: 'bg-red-100 text-red-700', desc: 'Will not become a client' },
  ]
  return (
    <div className="space-y-2 mb-4">
      {statuses.map(s => (
        <div key={s.label} className="flex items-center gap-3">
          <span className={`w-24 text-center px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${s.color}`}>{s.label}</span>
          <span className="text-sm text-gray-600">{s.desc}</span>
        </div>
      ))}
    </div>
  )
}

// ─── V3 — LeadSources ────────────────────────────────────────────────────────
function LeadSources() {
  const sources = [
    '🏘 Hip Cookeville', '🏡 Hip Baxter', '🏠 Nextdoor',
    '👥 Referral', '🔍 Google', '➕ Other',
  ]
  return (
    <div className="mb-4">
      <p className="text-xs text-gray-500 mb-2">Source options when adding a contact</p>
      <div className="flex flex-wrap gap-2">
        {sources.map(s => (
          <span key={s} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">{s}</span>
        ))}
      </div>
    </div>
  )
}

// ─── V4 — TimePreferenceGrid ──────────────────────────────────────────────────
function TimePreferenceGrid() {
  const prefs = [
    { icon: '⏰', label: 'Specific Time', sub: 'Exact time you enter', color: 'bg-blue-50 border-blue-100' },
    { icon: '🌅', label: 'Morning', sub: 'Defaults to 8:00 AM', color: 'bg-green-50 border-green-100' },
    { icon: '☀️', label: 'Afternoon', sub: 'Defaults to 12:00 PM', color: 'bg-yellow-50 border-yellow-100' },
    { icon: '🕐', label: 'Anytime', sub: 'No specific time set', color: 'bg-gray-50 border-gray-100' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {prefs.map(p => (
        <div key={p.label} className={`rounded-xl border p-3 ${p.color}`}>
          <div className="text-xl mb-1">{p.icon}</div>
          <div className="font-semibold text-gray-800 text-sm">{p.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{p.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ─── V5 — CancelFlowDecision ─────────────────────────────────────────────────
function CancelFlowDecision() {
  return (
    <div className="mb-4 flex flex-col items-center text-sm">
      {/* Top node */}
      <div className="px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg font-medium text-gray-700 text-xs">Cancel This Mow</div>
      <div className="w-px h-4 bg-gray-300" />
      <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 font-medium">Client Recurring?</div>
      {/* Fork */}
      <div className="w-full flex justify-center relative mt-1">
        <div className="w-32 h-px bg-gray-300 absolute top-0" />
        <div className="w-px h-4 bg-gray-300 absolute top-0 left-1/2 -translate-x-1/2" />
      </div>
      <div className="flex w-full mt-1 gap-2">
        {/* YES branch */}
        <div className="flex-1 flex flex-col items-center">
          <div className="w-px h-3 bg-green-300" />
          <div className="text-xs font-bold text-green-700 mb-1">YES</div>
          <div className="w-px h-3 bg-green-300" />
          <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center w-full">
            <div className="text-xs font-semibold text-green-800">"Schedule next mow"</div>
            <div className="text-xs text-green-600 mt-0.5">Chain stays intact ✅</div>
          </div>
        </div>
        {/* NO branch */}
        <div className="flex-1 flex flex-col items-center">
          <div className="w-px h-3 bg-amber-300" />
          <div className="text-xs font-bold text-amber-700 mb-1">NO</div>
          <div className="w-px h-3 bg-amber-300" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center w-full">
            <div className="text-xs font-semibold text-amber-800">"Just cancel"</div>
            <div className="text-xs text-amber-600 mt-0.5">Breaks chain ⚠️</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── V6 — JobDetailWireframe ──────────────────────────────────────────────────
function JobDetailWireframe() {
  return (
    <div className="flex flex-col items-center mb-4">
      <div className="w-64 border-2 border-gray-300 rounded-2xl bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">Job Detail</div>
        {/* Body */}
        <div className="px-3 py-2 space-y-2 text-xs">
          <div className="font-semibold text-gray-800">Client Name</div>
          <div className="text-blue-600 underline">📍 123 Oak St, Cookeville → Maps</div>
          {/* Amber yard notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
            <div className="font-bold text-amber-700 text-xs">⚠️ Yard Notes</div>
            <div className="text-amber-600 text-xs">Gate code, dog in yard…</div>
          </div>
          {/* Action pills */}
          <div className="flex gap-1">
            <span className="bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-600">💬 Text</span>
            <span className="bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-600">🗺 Maps</span>
            <span className="bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-600">📅 Cal</span>
          </div>
          {/* Visit notes */}
          <div className="border border-gray-200 rounded-lg p-2 text-gray-400 text-xs">Visit Notes…</div>
          {/* Photos */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">📷 Photos</div>
            <div className="grid grid-cols-3 gap-1">
              <div className="bg-gray-100 rounded aspect-square flex items-center justify-center text-gray-400 text-xs">🖼</div>
              <div className="bg-gray-100 rounded aspect-square flex items-center justify-center text-gray-400 text-xs">🖼</div>
              <div className="bg-gray-50 border border-dashed border-gray-300 rounded aspect-square flex items-center justify-center text-gray-400 text-xs">+</div>
            </div>
          </div>
          {/* Cancel link */}
          <div className="text-center text-red-400 text-xs py-1">🚫 Cancel This Mow</div>
        </div>
        {/* Pinned bottom */}
        <div className="border-t border-gray-200 bg-gray-50 px-2 py-2 flex gap-1.5">
          <div className="flex-1 bg-green-600 text-white text-xs font-semibold rounded-lg py-2 text-center">Mark Complete</div>
          <div className="flex-1 bg-blue-600 text-white text-xs font-semibold rounded-lg py-2 text-center">Send Invoice</div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">Job Detail screen — elements appear in this order</p>
    </div>
  )
}

// ─── V7 — MorningRoutineChecklist ────────────────────────────────────────────
function MorningRoutineChecklist() {
  const steps = [
    { icon: CloudSun, label: 'Check weather', sub: 'Look at the banner before planning' },
    { icon: AlertCircle, label: 'Overdue badges', sub: 'Amber flags on any slipped jobs' },
    { icon: FileText, label: 'Special notes', sub: 'Amber card on Job Detail before arriving' },
    { icon: MapPin, label: 'Get directions', sub: 'Tap Maps on each card' },
    { icon: Navigation, label: 'Head out', sub: "You're ready" },
  ]
  return (
    <div className="space-y-2 mb-4">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
          <s.icon size={16} className="flex-shrink-0 text-gray-500" />
          <div className="min-w-0">
            <span className="font-semibold text-gray-800 text-sm">{s.label}</span>
            <span className="text-gray-500 text-xs ml-2">{s.sub}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── V8 — InvoiceDecisionTree ─────────────────────────────────────────────────
function InvoiceDecisionTree() {
  return (
    <div className="mb-4">
      {/* Top nodes */}
      <div className="flex flex-col items-center gap-0">
        <div className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">Job done</div>
        <div className="w-px h-3 bg-gray-300" />
        <div className="px-3 py-1.5 bg-green-100 border border-green-300 rounded-lg text-xs font-semibold text-green-800">Mark Complete ← always first</div>
        <div className="w-px h-3 bg-gray-300" />
      </div>
      {/* Fork */}
      <div className="flex gap-3">
        {/* Left — Stripe */}
        <div className="flex-1 flex flex-col items-center gap-0">
          <div className="w-px h-3 bg-blue-300" />
          <div className="px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 text-center w-full">Card / Bank</div>
          <div className="w-px h-3 bg-blue-300" />
          <div className="px-2 py-1.5 bg-blue-100 border border-blue-200 rounded-lg text-xs font-medium text-blue-700 text-center w-full">Send Invoice</div>
          <div className="w-px h-3 bg-blue-300" />
          <div className="px-2 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600 text-center w-full">Copy text →<br />iMessage</div>
        </div>
        {/* Right — Cash/Venmo */}
        <div className="flex-1 flex flex-col items-center gap-0">
          <div className="w-px h-3 bg-amber-300" />
          <div className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 text-center w-full">Cash or Venmo</div>
          <div className="w-px h-3 bg-amber-300" />
          <div className="px-2 py-1.5 bg-amber-100 border border-amber-200 rounded-lg text-xs font-medium text-amber-700 text-center w-full">Skip Invoice</div>
          <div className="w-px h-3 bg-amber-300" />
          <div className="px-2 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-600 text-center w-full">Edit Mow →<br />Payment Method</div>
        </div>
      </div>
    </div>
  )
}

// ─── V9 — InvoiceStatusTracker ────────────────────────────────────────────────
function InvoiceStatusTracker() {
  const nodes = [
    { label: 'Not Sent', color: 'bg-gray-200 border-gray-300', text: 'text-gray-600' },
    { label: 'Sent', color: 'bg-blue-200 border-blue-300', text: 'text-blue-700' },
    { label: 'Paid', color: 'bg-green-200 border-green-300', text: 'text-green-700' },
  ]
  return (
    <div className="overflow-x-auto mb-4">
      <div className="min-w-[280px] py-2">
        {/* Main track */}
        <div className="flex items-start justify-between relative">
          {nodes.map((n, i) => (
            <div key={n.label} className="flex flex-col items-center flex-1">
              <div className={`w-9 h-9 rounded-full border-2 ${n.color} flex items-center justify-center`}>
                <span className={`text-xs font-bold ${n.text}`}>{i + 1}</span>
              </div>
              <span className={`text-xs font-semibold mt-1 ${n.text}`}>{n.label}</span>
            </div>
          ))}
          {/* Connector lines behind */}
          <div className="absolute top-4 left-[16.66%] right-[16.66%] h-px bg-gray-300 -z-0" />
        </div>
        {/* Waived branch */}
        <div className="flex items-center justify-end mt-1 pr-4">
          <div className="flex flex-col items-center">
            <div className="w-px h-3 border-l-2 border-dashed border-purple-300" />
            <div className="px-2 py-1 rounded-full border-2 border-dashed border-purple-300 text-xs font-semibold text-purple-600">Waived</div>
            <span className="text-xs text-gray-400 mt-0.5">branch from Paid</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── V10 — AutoScheduleChain ──────────────────────────────────────────────────
function AutoScheduleChain() {
  const mows = [
    {
      icon: '✓', date: 'Thu Apr 10', status: 'Completed',
      circle: 'bg-green-500 border-green-600 text-white',
      note: null, solid: true,
    },
    {
      icon: '📅', date: 'Thu Apr 24', status: 'Scheduled',
      circle: 'bg-blue-500 border-blue-600 text-white',
      note: 'auto-created Apr 10', solid: true,
    },
    {
      icon: '+', date: 'Thu May 8', status: 'Future',
      circle: 'bg-white border-gray-400 border-dashed text-gray-400',
      note: 'created when Apr 24 completes', solid: false,
    },
  ]
  return (
    <div className="overflow-x-auto mb-4">
      <div className="min-w-[320px] py-2">
        <div className="flex items-center justify-between relative">
          {mows.map((m, i) => (
            <div key={i} className="flex flex-col items-center flex-1">
              <span className="text-xs text-gray-500 mb-1 font-medium">{m.date}</span>
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold ${m.circle}`}>{m.icon}</div>
              <span className="text-xs font-semibold mt-1 text-gray-700">{m.status}</span>
              {m.note && <span className="text-xs text-gray-400 mt-0.5 text-center leading-tight">{m.note}</span>}
            </div>
          ))}
          {/* Solid line 1→2 */}
          <div className="absolute top-[42px] left-[20%] w-[28%] h-px bg-gray-400" />
          {/* Dashed line 2→3 */}
          <div className="absolute top-[42px] left-[50%] w-[28%] h-px border-t-2 border-dashed border-gray-400" />
        </div>
        <p className="text-xs text-gray-500 text-center mt-3">🔒 Same day of week · Correct interval · Fully automatic</p>
      </div>
    </div>
  )
}

// ─── V11 — RecurringSetupChecklist ───────────────────────────────────────────
function RecurringSetupChecklist() {
  const items = [
    'Status v2 = Recurring',
    'Recurring Rate entered (e.g. $45)',
    'Recurring Frequency set (Weekly / Bi-weekly / Monthly)',
  ]
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">All 3 required to activate auto-scheduling</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-bold">✓</span>
            <span className="text-sm text-gray-700">{item}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">Once all 3 are set, the next mow is created automatically on each completion.</p>
    </div>
  )
}

// ─── V12 — RevenueKPICards ────────────────────────────────────────────────────
function RevenueKPICards() {
  return (
    <div className="mb-4">
      {/* Month nav mockup */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-600 text-sm">‹</span>
        <span className="font-semibold text-gray-800 text-sm">April 2026</span>
        <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-300 text-sm">›</span>
      </div>
      {/* 2×2 KPI grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
          <p className="text-xs text-green-600 mb-1">Collected</p>
          <p className="text-lg font-bold text-green-700">$165</p>
          <p className="text-xs text-green-500">actual revenue</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
          <p className="text-xs text-blue-600 mb-1">Forecasted</p>
          <p className="text-lg font-bold text-blue-600">$105</p>
          <p className="text-xs text-blue-400">from scheduled mows</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Mows Done</p>
          <p className="text-lg font-bold text-gray-800">3</p>
          <p className="text-xs text-gray-400">completed this month</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Mows Booked</p>
          <p className="text-lg font-bold text-gray-800">2</p>
          <p className="text-xs text-gray-400">upcoming</p>
        </div>
      </div>
      {/* Flow arrow */}
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 text-center">
        <span className="font-medium text-blue-600">Scheduled mow</span>
        <span className="text-gray-400 mx-2">→ Mark Complete →</span>
        <span className="font-medium text-green-600">Completed mow</span>
        <div className="text-gray-400 mt-1">sits in Forecasted ──────────→ moves to Collected</div>
      </div>
    </div>
  )
}

// ─── V13 — MonthlyPipelineBar ────────────────────────────────────────────────
function MonthlyPipelineBar() {
  const collected = 165
  const forecasted = 105
  const total = collected + forecasted
  const collectedPct = Math.round((collected / total) * 100)
  const forecastedPct = 100 - collectedPct
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-gray-700 mb-2">April 2026 — ${total} total</p>
      <div className="flex h-8 rounded-full overflow-hidden w-full">
        <div
          className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
          style={{ width: `${collectedPct}%` }}
        >
          ${collected}
        </div>
        <div
          className="bg-blue-400 flex items-center justify-center text-white text-xs font-semibold"
          style={{ width: `${forecastedPct}%` }}
        >
          ${forecasted}
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Collected ${collected}</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Forecasted ${forecasted}</span>
      </div>
    </div>
  )
}

// ─── V14 — RoutePlanningIllustration ─────────────────────────────────────────
function RoutePlanningIllustration() {
  const cards = [
    { name: 'Chynna M.', addr: '123 Oak St', time: 'Morning' },
    { name: 'Dave & Sandi', addr: '456 Elm Dr', time: '8:00 AM' },
    { name: 'Kaitlyn B.', addr: '789 Pine Ave', time: 'Anytime' },
  ]
  return (
    <div className="mb-4">
      <div className="space-y-2">
        {cards.map((c, i) => (
          <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
            <GripVertical size={16} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm text-gray-800">{c.name}</span>
              <span className="text-xs text-gray-400 ml-2">{c.addr}</span>
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">{c.time}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">⇅ Drag to set your driving order</p>
    </div>
  )
}

// ─── V15 — QuickRefAllStatuses ────────────────────────────────────────────────
function QuickRefAllStatuses() {
  const groups = [
    {
      label: 'Client Status',
      badges: [
        { label: 'Lead', color: 'bg-yellow-100 text-yellow-800' },
        { label: 'Recurring', color: 'bg-green-100 text-green-800' },
        { label: 'One-Time', color: 'bg-blue-100 text-blue-800' },
        { label: 'Cold', color: 'bg-gray-100 text-gray-700' },
        { label: 'Lost', color: 'bg-red-100 text-red-700' },
      ],
    },
    {
      label: 'Mow Status',
      badges: [
        { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
        { label: 'Completed', color: 'bg-green-100 text-green-700' },
        { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
        { label: 'No-show', color: 'bg-red-100 text-red-700' },
      ],
    },
    {
      label: 'Invoice Status',
      badges: [
        { label: 'Not Sent', color: 'bg-gray-100 text-gray-500' },
        { label: 'Sent', color: 'bg-yellow-100 text-yellow-700' },
        { label: 'Paid', color: 'bg-green-100 text-green-700' },
        { label: 'Waived', color: 'bg-purple-100 text-purple-600' },
      ],
    },
  ]
  return (
    <div className="space-y-4 mb-4">
      {groups.map(g => (
        <div key={g.label}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.badges.map(b => (
              <span key={b.label} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${b.color}`}>{b.label}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Chapters ─────────────────────────────────────────────────────────────────
const CHAPTERS = [
  {
    title: 'The Big Picture: How the System Works',
    content: (
      <>
        <P>Happy Cuts is managed entirely through this portal. Airtable runs in the background — you never need to open it directly. Everything done here writes to Airtable automatically: adding clients, scheduling mows, marking jobs complete, sending invoices.</P>
        <SectionHead>The Client Journey</SectionHead>
        <ClientLifecycleFlow />
        <SectionHead>Step by Step</SectionHead>
        <Steps items={[
          'Someone reaches out → add them as a Lead in the Clients tab',
          'Schedule their first mow → appears on Today and Schedule',
          'Show up, do the job → tap Mark Complete in the app',
          'Send the invoice via Stripe, or collect cash or Venmo on the spot',
          'If they want recurring service → set their Status to Recurring, enter rate and frequency',
          'From that point on, completing any mow automatically schedules the next one',
        ]} />
        <SectionHead>The Five Tabs</SectionHead>
        <GuideTable
          headers={['Tab', 'What It\'s For']}
          rows={[
            ['Today', 'Daily job board — mows, overdue flags, add a mow'],
            ['Clients', 'Full client list — add leads, view history, edit contact info'],
            ['Schedule', 'Week-by-week calendar — full picture, drag to reorder'],
            ['Revenue', 'Money in and forecasted — collected vs. upcoming by month'],
            ['Guide', 'This page'],
          ]}
        />
        <SectionHead>What Lives Where</SectionHead>
        <GuideTable
          headers={['Data', 'Where It Lives']}
          rows={[
            ['Client info (name, phone, address, rate, frequency)', 'Contacts table in Airtable'],
            ['Individual mow jobs', 'Schedule table in Airtable'],
            ['Payment and invoice records', "Attached to each mow's Schedule record"],
            ['Interaction notes (texts, calls, visits)', 'Interaction Log table in Airtable'],
          ]}
        />
      </>
    ),
  },
  {
    title: 'Adding and Managing Clients',
    content: (
      <>
        <P>The Clients tab is your pipeline. Every person who reaches out should be added here so nothing falls through the cracks.</P>
        <SectionHead>Adding a New Lead</SectionHead>
        <Steps items={[
          'Clients tab → tap + Add Contact',
          'Enter Name, Phone (tap-to-text), Address (full street for Maps), City',
          'Set Source — where they came from',
          'Set Status v2 to Lead',
          'Add Lot Size if you can estimate — helps with pricing',
          'Add Notes: gate code, dog in yard, prefers texts, parking, etc.',
          'Tap Save — rate and frequency are not needed yet',
        ]} />
        <SectionHead>Lead Sources</SectionHead>
        <LeadSources />
        <SectionHead>Client Statuses</SectionHead>
        <StatusBadges />
        <SectionHead>Converting a Lead to Recurring</SectionHead>
        <Steps items={[
          'Clients tab → find the client → tap View',
          'Tap Edit Contact',
          'Set Status v2 to Recurring',
          'Enter Recurring Rate (e.g. $45) and Recurring Frequency',
          'Save — auto-scheduling is now active',
        ]} />
        <Tip>Once set to Recurring with a rate and frequency, every completed mow automatically creates the next one.</Tip>
        <SectionHead>Special Instructions</SectionHead>
        <P>Yard-specific notes you need every visit — dog on a runner, start in front, gate code, diamond cut — go in Special Instructions. These appear as an amber card on Job Detail so they're visible before every job. Set via Edit Contact → Special Instructions.</P>
        <SectionHead>Logging Interactions</SectionHead>
        <Steps items={[
          'Client detail → tap + Log Interaction',
          'Set Direction (Inbound/Outbound), Type (Text/Call/In-person), write a brief Summary',
          'Save — builds full contact history',
        ]} />
        <SectionHead>Cold and Lost Clients</SectionHead>
        <P>Mark Cold if they went quiet but may return — add a follow-up date note. Mark Lost if they won't be a client. Cold clients still appear in the Cold filter chip so they don't get forgotten.</P>
      </>
    ),
  },
  {
    title: 'Scheduling Mows',
    content: (
      <>
        <P>Recurring clients are scheduled automatically after their first mow. Intro mows, one-time jobs, and first recurring mows are added manually.</P>
        <SectionHead>Adding a Mow Manually</SectionHead>
        <Steps items={[
          'Today or Schedule tab → tap + Add Mow',
          'Select the Client',
          'Set the Date',
          'Set Time Preference',
          'If Specific Time: enter the time (e.g. "8:00 AM")',
          'Set Type — Intro, One-Time, or Recurring',
          'Enter Amount Charged and any job-specific Notes',
          'Tap Save',
        ]} />
        <SectionHead>Time Preferences</SectionHead>
        <TimePreferenceGrid />
        <SectionHead>Adding to Google Calendar</SectionHead>
        <P>On any Job Detail screen, tap the Cal button. Google Calendar opens pre-filled with client name, address, time block, amount, and special instructions. Save from there to add it to your personal calendar.</P>
        <SectionHead>Reordering Jobs Within a Day</SectionHead>
        <P>On the Schedule tab, drag mow cards within a day to set your driving order. Saves automatically to Airtable.</P>
        <SectionHead>Cancelling a Mow</SectionHead>
        <P>On Job Detail → scroll down → tap Cancel This Mow (red link).</P>
        <CancelFlowDecision />
        <Warn>For recurring clients, always use "Schedule next mow" — never "Just cancel." Just cancel breaks the auto-scheduling chain.</Warn>
      </>
    ),
  },
  {
    title: 'Running a Job (Day Of)',
    content: (
      <>
        <SectionHead>Morning Routine</SectionHead>
        <MorningRoutineChecklist />
        <SectionHead>Job Detail Screen Layout</SectionHead>
        <JobDetailWireframe />
        <P>Every element is tappable. Mark Complete and Send Invoice are always pinned to the bottom so you can reach them with one hand.</P>
        <SectionHead>Adding Photos</SectionHead>
        <Steps items={[
          'Job Detail → scroll to the Photos section',
          'Tap Camera Roll to pick an existing photo (recommended)',
          'Or tap Take Photo to open the camera directly',
          'Photos save to the mow record in Airtable',
        ]} />
        <SectionHead>Visit Notes</SectionHead>
        <P>After the job, tap Visit Notes and add anything worth remembering — what took extra time, what the client mentioned, follow-up needed. Saves to the mow record and visible in Revenue history.</P>
      </>
    ),
  },
  {
    title: 'Completing a Job and Invoicing',
    content: (
      <>
        <SectionHead>Marking a Mow Complete</SectionHead>
        <Steps items={[
          'Open Job Detail → tap Mark Complete (green, bottom left)',
          'Confirm in the modal',
          'System: sets Status to Completed, updates client Status v2, auto-creates next mow if Recurring',
        ]} />
        <Tip>Mark jobs complete before leaving the property — keeps the schedule accurate.</Tip>
        <SectionHead>What to Do After the Job</SectionHead>
        <InvoiceDecisionTree />
        <SectionHead>Sending a Stripe Invoice</SectionHead>
        <Steps items={[
          'Job Detail → tap Send Invoice (blue, bottom right)',
          'Review pre-filled details: client name, amount, email',
          'Confirm — Stripe creates and emails the invoice automatically',
          'Copy the pre-written text → send via iMessage to notify the client',
        ]} />
        <Info>If a client has no email on file, the invoice routes to the owner's email as a record.</Info>
        <SectionHead>Cash and Venmo Jobs</SectionHead>
        <P>Mark Complete as normal. Skip Send Invoice or send to yourself as a record. Open Edit This Mow and set Payment Method to Cash or Venmo so Revenue tracking stays accurate.</P>
        <SectionHead>Invoice Status Lifecycle</SectionHead>
        <InvoiceStatusTracker />
        <SectionHead>If Invoicing Fails</SectionHead>
        <Warn>If Send Invoice fails, mark the job complete anyway and invoice manually. Mark Complete and Send Invoice are fully independent — one failing never affects the other.</Warn>
        <Steps items={[
          'Mark Complete as normal — always works',
          'Go to stripe.com → find the client → create the invoice manually',
          'Return to Edit This Mow → set Invoice Status to Sent',
        ]} />
      </>
    ),
  },
  {
    title: 'Recurring Clients and Auto-Scheduling',
    content: (
      <>
        <SectionHead>How It Works</SectionHead>
        <P>The rule is simple: mark a mow complete → the next one is automatically added to the schedule. Once a client is Recurring with a rate and frequency, no manual scheduling is needed after their first mow.</P>
        <AutoScheduleChain />
        <Info>When a recurring mow is marked complete, a toast confirms the next date — e.g. "Complete! Next mow scheduled for Thu, Apr 24." The new mow always lands on the same day of week at the correct interval.</Info>
        <SectionHead>What You Need to Activate Auto-Scheduling</SectionHead>
        <RecurringSetupChecklist />
        <SectionHead>Scheduling Details</SectionHead>
        <GuideTable
          headers={['Setting', 'What It Controls']}
          rows={[
            ['Recurring Frequency', 'Days between mows: Weekly=7, Bi-weekly=14, Monthly=30'],
            ['Day of Week', 'Always matches the last completed mow — never drifts'],
            ['Default Time', 'Morning (8:00 AM) — edit in Job Detail if needed'],
            ['Amount Charged', "Pulled from the client's Recurring Rate automatically"],
          ]}
        />
        <SectionHead>When a Client Wants to Skip</SectionHead>
        <Steps items={[
          'Find their mow in Schedule → open Job Detail',
          'Tap Cancel This Mow',
          'Tap "Schedule next mow for [date]" in the prompt',
        ]} />
        <Warn>Do not tap "Just cancel" for a skipping recurring client — it breaks the chain. Always use "Schedule next mow."</Warn>
        <SectionHead>Adding a New Recurring Client</SectionHead>
        <Steps items={[
          'Add them as a contact, schedule and complete their intro mow',
          'After they confirm recurring: Edit Contact → Status v2 = Recurring, set Rate and Frequency',
          'Manually schedule their first recurring mow (no completed mow to chain from yet)',
          'From that first completion forward — fully automatic',
        ]} />
        <SectionHead>Overdue Mows</SectionHead>
        <P>If a Scheduled mow's date has passed without being marked complete, it shows an amber Overdue badge on the Today tab. Tap the card to mark it complete or edit the date.</P>
      </>
    ),
  },
  {
    title: 'Revenue and Forecasting',
    content: (
      <>
        <P>The Revenue tab shows money already collected and money coming in. Use the arrows to navigate between months.</P>
        <SectionHead>KPI Cards</SectionHead>
        <RevenueKPICards />
        <SectionHead>Monthly at a Glance</SectionHead>
        <MonthlyPipelineBar />
        <SectionHead>How Forecasted Stays Accurate</SectionHead>
        <P>The Forecasted number pulls directly from real Scheduled mow records. When a recurring mow is auto-created, it immediately adds to the Forecasted total. When marked complete, it moves from Forecasted to Collected automatically. Keep the schedule current and the forecast will be right.</P>
        <SectionHead>Viewing the Mow List</SectionHead>
        <P>Two filter chips: Completed (default, most-recent-first) and Scheduled (soonest-first). Each row shows date, client, type, amount, status badge, and invoice status. Tap any row to open that job's detail.</P>
        <SectionHead>Total Pipeline</SectionHead>
        <P>At the bottom of the Scheduled view — Forecasted this month and All future booked. All future booked is your total pipeline across every future month.</P>
      </>
    ),
  },
  {
    title: 'Advanced Tips and Workflows',
    content: (
      <>
        <SectionHead>Planning Your Driving Route</SectionHead>
        <RoutePlanningIllustration />
        <Steps items={[
          'Schedule tab → navigate to today',
          'Drag cards into your preferred driving order',
          'Open Maps from the first card to start navigation',
          'Order saves automatically to Airtable',
        ]} />
        <SectionHead>Weekly Prep Routine</SectionHead>
        <Steps items={[
          'Schedule tab → check next week — recurring mows should already be there',
          'Add any one-time or intro mows you have booked',
          'Reorder each day in driving order',
          'Revenue tab → check Forecasted to see what the week is worth',
        ]} />
        <Tip>Five minutes on Sunday evening. Monday morning the app is ready.</Tip>
        <SectionHead>Keeping Payment Data Clean</SectionHead>
        <P>Always set Payment Method on every completed mow. Stripe jobs are set automatically when you Send Invoice. For cash and Venmo: set manually in Edit This Mow.</P>
        <SectionHead>Waiving a Charge</SectionHead>
        <P>Mark complete, skip Send Invoice, set Invoice Status to Waived in Edit This Mow. Keeps the mow in records without inflating revenue numbers.</P>
      </>
    ),
  },
  {
    title: '★ Quick Reference',
    isStar: true,
    content: (
      <>
        <SectionHead>All Statuses at a Glance</SectionHead>
        <QuickRefAllStatuses />
        <SectionHead>Recurring Frequency Reference</SectionHead>
        <GuideTable
          headers={['Frequency', 'Days Between Mows']}
          rows={[
            ['Weekly', '7'],
            ['Bi-weekly', '14'],
            ['Monthly', '~30'],
          ]}
        />
        <SectionHead>Time Preference Reference</SectionHead>
        <GuideTable
          headers={['Option', 'Schedule DateTime', 'Shows As']}
          rows={[
            ['Specific Time', 'Exact date + time', '"8:00 AM"'],
            ['Morning', 'Date + 08:00', '"Morning"'],
            ['Afternoon', 'Date + 12:00', '"Afternoon"'],
            ['Anytime', 'Date + 12:00', '"Anytime"'],
          ]}
        />
      </>
    ),
  },
]

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HappyCutsGuide() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [openChapter, setOpenChapter] = useState(0)

  if (profile?.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/happy-cuts')} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 min-h-[44px] px-1">
          <ChevronLeft size={16} /> Back
        </button>
        <span className="font-semibold text-gray-800 text-sm">Happy Cuts Guide</span>
        <div className="w-12" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Hero banner */}
        <div className="bg-green-600 rounded-xl p-5 mb-6 mt-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌿</span>
            <h1 className="text-lg font-bold">Happy Cuts — Complete Guide</h1>
          </div>
          <p className="text-green-100 text-sm">Your Yard. Done Right.</p>
          <p className="text-green-200 text-xs mt-2">8 chapters · Beginner to advanced · Last updated April 2026</p>
        </div>

        {/* Accordion */}
        <div className="space-y-2">
          {CHAPTERS.map((ch, i) => {
            const isOpen = openChapter === i
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenChapter(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between px-4 py-4 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${ch.isStar ? 'bg-yellow-400 text-white' : 'bg-green-600 text-white'}`}>
                      {ch.isStar ? '★' : i + 1}
                    </span>
                    <span className="font-semibold text-gray-800 text-sm leading-snug">{ch.isStar ? 'Quick Reference' : ch.title}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 ml-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    {ch.content}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 italic text-center mt-6">Happy Cuts Guide · Last updated April 2026</p>
      </div>
    </div>
  )
}
