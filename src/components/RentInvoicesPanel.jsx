import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import { previewRentInvoices, sendRentInvoices, fetchOpenLeaseInvoices, LEASE_INVOICE_FIELDS } from '../lib/rentInvoices'
import { fmtCurrency, fmtDate } from '../lib/airtable'

const STATUS_CHIP = {
  open: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  'Past Due': 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-700',
  disputed: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-700',
  uncollectible: 'bg-gray-100 text-gray-700',
}

export default function RentInvoicesPanel() {
  const [preview, setPreview] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [previewRes, invoicesRes] = await Promise.all([
        previewRentInvoices(),
        fetchOpenLeaseInvoices()
      ])
      setPreview(previewRes)
      if (invoicesRes.error) throw new Error(invoicesRes.error)
      setInvoices(invoicesRes.data)
      setSelected(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSendClick = () => {
    setConfirming(true)
  }

  const handleCancel = () => {
    setConfirming(false)
  }

  const handleConfirmSend = async () => {
    setResults(null)
    setSending(true)
    try {
      const chosen = preview.rows.filter(r => selected.has(r.runKey))
      const expected = Object.fromEntries(chosen.map(r => [r.runKey, r.cents]))
      const res = await sendRentInvoices(chosen.map(r => r.runKey), expected)
      setResults(res.results.map(r => ({ ...r, address: chosen.find(c => c.runKey === r.runKey)?.address || r.runKey })))
      const okCount = res.results.filter(r => r.ok).length
      if (okCount > 0) {
        toast.success(`Sent ${okCount} of ${chosen.length}`)
      } else {
        toast.error('No invoices were sent')
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setConfirming(false)
      setSending(false)
      load()
    }
  }

  if (loading && !preview && invoices.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Due to go out */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Due to go out {preview?.rows?.length > 0 && <span className="text-gray-400 font-normal normal-case">({preview.rows.length})</span>}
          </h2>
          <button
            onClick={load}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={load} className="text-sm text-red-700 hover:underline">Try again</button>
          </div>
        )}

        {!preview?.rows?.length && !error && (
          <p className="text-gray-500 text-sm py-8 text-center">Nothing is due to go out right now.</p>
        )}

        {preview?.rows?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-10"></th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Property</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Payer</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Due</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Account</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Problems</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.rows.map(row => (
                  <tr key={row.runKey} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.runKey)}
                        onChange={e => {
                          const next = new Set(selected)
                          if (e.target.checked) next.add(row.runKey)
                          else next.delete(row.runKey)
                          setSelected(next)
                        }}
                        disabled={row.problems?.length > 0 || sending}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-900">{row.address}</td>
                    <td className="px-4 py-2 text-gray-700">{row.payerName}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{fmtCurrency(row.amount)}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtDate(row.dueDate)}</td>
                    <td className="px-4 py-2 text-gray-500">{row.accountName || '—'}</td>
                    <td className="px-4 py-2">
                      {row.problems?.length > 0 && (
                        <div className="space-y-1">
                          {row.problems.map((p, i) => (
                            <p key={i} className="text-xs text-red-600">{p}</p>
                          ))}
                        </div>
                      )}
                      {row.resumeDraftId && (
                        <p className="text-xs text-gray-400 mt-1">
                          An earlier send stopped; sending again reuses its draft
                        </p>
                      )}
                      {!row.problems?.length && !row.resumeDraftId && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

{preview?.rows?.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSendClick}
                disabled={selected.size === 0 || sending}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send selected
              </button>

              {confirming && (
                <div className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-4 flex-1 max-w-2xl">
                  {(() => {
                    const chosen = preview.rows.filter(r => selected.has(r.runKey))
                    const totalCents = chosen.reduce((s, r) => s + (r.cents || 0), 0)
                    const accounts = [...new Set(chosen.map(r => r.accountName).filter(Boolean))]
                    return (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-800">
                          Send {chosen.length} invoice(s) for {fmtCurrency(totalCents / 100)} through:
                          {' '}
                          <span className="font-medium">{accounts.join(', ') || '—'}</span>
                          . Stripe emails each tenant a pay link.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmSend}
                            disabled={sending}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            {sending ? 'Sending…' : 'Send now'}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={sending}
                            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {results && (
            <div className="mt-3 text-sm space-y-1">
              {results.map((r, i) => (
                <p key={i} className={r.ok ? 'text-green-700' : 'text-red-700'}>
                  {r.address}: {r.ok ? 'Sent' : r.error}
                </p>
              ))}
            </div>
          )}
        </div>

      {/* Section 2: Open invoices */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Open invoices {invoices.length > 0 && <span className="text-gray-400 font-normal normal-case">({invoices.length})</span>}
        </h2>

        {invoices.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">No open rent invoices.</p>
        )}

        {invoices.length > 0 && (
          <div className="space-y-3">
            {invoices.map(inv => {
              const f = inv.fields
              const status = f[LEASE_INVOICE_FIELDS.status] || ''
              const chipClass = STATUS_CHIP[status] || 'bg-gray-100 text-gray-700'
              const stripeId = f[LEASE_INVOICE_FIELDS.stripeInvoiceId]
              const hostedUrl = f[LEASE_INVOICE_FIELDS.hostedUrl]
              return (
                <div key={inv.id} className="flex items-center justify-between gap-4 p-4 border border-gray-100 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">
                        {stripeId || '(not sent)'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${chipClass}`}>
                        {status || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                      <span>Amount Due: {fmtCurrency(f[LEASE_INVOICE_FIELDS.amountDue])}</span>
                      <span>Due: {fmtDate(f[LEASE_INVOICE_FIELDS.dueDate])}</span>
                    </div>
                  </div>
                  {hostedUrl && (
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex-shrink-0"
                    >
                      View
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}