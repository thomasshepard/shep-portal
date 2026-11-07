import { isNum } from './marketFormat'

// Number formatting for the Data Explorer, keyed by the `format` field of each measure.
//   annual:  pct (0.065 -> 6.5%), usd, num, ratio (3.67 -> 3.67x)
//   monthly: pct_points (6.5 -> 6.50%), points (0.39 -> 0.39 pts), num, index
//   local:   usd, num

const trim = (v, digits) => String(+v.toFixed(digits))

export function compactNum(v) {
  if (!isNum(v)) return ''
  const a = Math.abs(v)
  if (a >= 1e9) return `${trim(v / 1e9, 2)}B`
  if (a >= 1e6) return `${trim(v / 1e6, 2)}M`
  if (a >= 1e3) return `${trim(v / 1e3, 1)}k`
  return trim(v, 1)
}

const commas = v => Math.round(v).toLocaleString('en-US')

const FORMATS = {
  pct: { full: v => `${(v * 100).toFixed(1)}%`, axis: v => `${trim(v * 100, 1)}%` },
  pct_points: { full: v => `${v.toFixed(2)}%`, axis: v => `${trim(v, 1)}%` },
  points: { full: v => `${v.toFixed(2)} pts`, axis: v => trim(v, 1) },
  usd: {
    full: v => `${v < 0 ? '-' : ''}$${commas(Math.abs(v))}`,
    axis: v => `${v < 0 ? '-' : ''}$${compactNum(Math.abs(v))}`,
  },
  ratio: { full: v => `${v.toFixed(2)}x`, axis: v => `${trim(v, 1)}x` },
  num: { full: v => (Math.abs(v) >= 1000 ? commas(v) : trim(v, 1)), axis: compactNum },
  index: { full: v => v.toFixed(1), axis: compactNum },
}

const guard = fn => v => (isNum(v) ? fn(v) : '')

/** { full, axis } formatters for a measure format; unknown formats fall back to plain numbers. */
export function formatterFor(format) {
  const f = FORMATS[format] || FORMATS.num
  return { full: guard(f.full), axis: guard(f.axis) }
}

/** Formatter for index-to-100 views. */
export const indexFormatter = {
  full: guard(v => v.toFixed(1)),
  axis: guard(v => String(Math.round(v))),
}

/** Signed % change from a to b, e.g. +42.3%. Blank if a is missing or not positive. */
export function pctChange(a, b) {
  if (!isNum(a) || !isNum(b) || a <= 0) return null
  return (b - a) / a
}

export function fmtChange(v) {
  if (!isNum(v)) return '—'
  const n = v * 100
  return `${n > 0 ? '+' : ''}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const chipCls = on =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
  }`
