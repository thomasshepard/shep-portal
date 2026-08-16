// Client-side CSV/JSON download helper. No library — CSV escaping is
// simple enough to hand-roll, and this keeps every export button (P&L,
// Balance Sheet, Journal Entries, Partner Capital, ledger backup) on one
// small shared utility instead of each page reinventing Blob/<a> plumbing.

function escapeCsvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** headers: string[]. rows: array of arrays, same length/order as headers. */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map(row => row.map(escapeCsvCell).join(','))
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(filename, blob)
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(filename, blob)
}
