// Formatters shared by the Market Pulse components.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const isNum = v => typeof v === 'number' && Number.isFinite(v)

export function fmtMonth(ym, long = false) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return String(ym ?? '')
  const [y, m] = ym.split('-')
  return `${(long ? MONTHS_LONG : MONTHS)[Number(m) - 1]} ${y}`
}

export const fmtDollars = v => (isNum(v) ? `$${Math.round(v).toLocaleString('en-US')}` : '')
export const fmtInt = v => (isNum(v) ? Math.round(v).toLocaleString('en-US') : '')
export const fmtPct = (v, digits = 0) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : '')

// +4% / -2% (fraction in, signed percent out)
export function fmtSignedPct(v, digits = 0) {
  if (!isNum(v)) return ''
  const n = v * 100
  const s = n.toFixed(digits)
  return `${n > 0 && Number(s) !== 0 ? '+' : ''}${s}%`
}

export function fmtSignedDays(v) {
  if (!isNum(v)) return ''
  return `${v > 0 ? '+' : ''}${Math.round(v)} days`
}

/** x value -> number on a continuous axis. 'month' ("2019-01") becomes 2019 + 0/12; others are plain numbers. */
export function toNum(x, xType) {
  if (xType === 'month') {
    const [y, m] = String(x).split('-').map(Number)
    return y + (m - 1) / 12
  }
  return Number(x)
}
