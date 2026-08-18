import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import './BankDashboard.css'

const NEW_OWNER = '__new__'
const PLAID_SDK_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600&family=Space+Mono:wght@400;700&display=swap'

function fmtMoney(n) {
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return { whole: parts[0], cents: parts[1] }
}

function nextDueDate(dueDay) {
  const now = new Date()
  const daysThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  let candidate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, daysThisMonth))
  candidate.setHours(0, 0, 0, 0)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (candidate < today) {
    const nextMonth = now.getMonth() + 1
    const daysNextMonth = new Date(now.getFullYear(), nextMonth + 1, 0).getDate()
    candidate = new Date(now.getFullYear(), nextMonth, Math.min(dueDay, daysNextMonth))
  }
  return candidate
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function callGateway(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('bank-dashboard', { body: { action, ...payload } })
  if (error) throw new Error(error.message || `${action} failed`)
  if (data?.ok === false) throw new Error(data.error || `${action} failed`)
  return data
}

export default function BankDashboard() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [relinkingId, setRelinkingId] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [ownerOptions, setOwnerOptions] = useState(['Personal'])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [mortgages, setMortgages] = useState({})
  const [editingMortgageId, setEditingMortgageId] = useState(null)
  const [mortgageForm, setMortgageForm] = useState({ label: '', amount: '', dueDay: '' })

  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = FONT_HREF
      document.head.appendChild(link)
    }
  }, [])

  const loadOwnerOptions = useCallback(async () => {
    try {
      const data = await callGateway('list_owners')
      setOwnerOptions(data.owners || ['Personal'])
    } catch { /* non-fatal — dropdown just falls back to defaults */ }
  }, [])

  const loadMortgages = useCallback(async () => {
    try {
      const data = await callGateway('list_mortgages')
      const map = {}
      for (const m of data.mortgages || []) {
        map[m.account_id] = { label: m.label, amount: m.amount, dueDay: m.due_day }
      }
      setMortgages(map)
    } catch { /* non-fatal — boxes just don't show until this loads */ }
  }, [])

  const loadBalances = useCallback(async (live) => {
    if (live) setRefreshing(true)
    try {
      const data = await callGateway(live ? 'get_balances' : 'get_balances_cached')
      setAccounts(data.accounts || [])
      setUpdatedAt(data.updatedAt || null)
      await Promise.all([loadOwnerOptions(), loadMortgages()])
    } catch (err) {
      toast.error(err.message || 'Failed to load balances')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [loadOwnerOptions, loadMortgages])

  useEffect(() => { loadBalances(false) }, [loadBalances])

  async function startLink() {
    setLinking(true)
    try {
      await loadScriptOnce(PLAID_SDK_SRC)
      const data = await callGateway('create_link_token')
      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            await callGateway('exchange_token', {
              public_token,
              institution_name: metadata.institution?.name || 'Linked account',
            })
            toast.success('Bank linked')
            loadBalances(true)
          } catch (err) {
            toast.error(err.message || 'Failed to link account')
          } finally {
            setLinking(false)
          }
        },
        onExit: () => setLinking(false),
      })
      handler.open()
    } catch (err) {
      toast.error(err.message || 'Failed to open Plaid Link')
      setLinking(false)
    }
  }

  // Re-authenticates an already-linked, broken item (ITEM_LOGIN_REQUIRED)
  // in place via Plaid's "update mode" — same Item, same access_token,
  // just a fresh login. Unlike startLink(), success doesn't call
  // exchange_token: update mode doesn't rotate the access_token, so
  // there's nothing new to store.
  async function startRelink(itemId, institutionName) {
    setRelinkingId(itemId)
    try {
      await loadScriptOnce(PLAID_SDK_SRC)
      const data = await callGateway('create_link_token', { itemId })
      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: () => {
          toast.success(`${institutionName} re-linked`)
          loadBalances(true)
          setRelinkingId(null)
        },
        onExit: () => setRelinkingId(null),
      })
      handler.open()
    } catch (err) {
      toast.error(err.message || 'Failed to open Plaid Link')
      setRelinkingId(null)
    }
  }

  async function unlinkItem(itemId, institutionName) {
    if (!confirm(`Unlink ${institutionName}? This removes all its accounts from the dashboard until you re-link.`)) return
    try {
      await callGateway('remove_item', { itemId })
      toast.success(`${institutionName} unlinked`)
      loadBalances(true)
    } catch (err) {
      toast.error(err.message || 'Failed to unlink')
    }
  }

  async function assignOwner(accountId, value) {
    let owner = value
    if (owner === NEW_OWNER) {
      const entered = prompt('New owner name (e.g. a person or a business):')
      if (!entered || !entered.trim()) return
      owner = entered.trim()
      if (!ownerOptions.includes(owner)) setOwnerOptions(prev => [...prev, owner])
    }
    setAccounts(prev => prev.map(a => a.accountId === accountId ? { ...a, owner: owner || null } : a))
    try {
      await callGateway('set_owner', { accountId, owner: owner || null })
    } catch (err) {
      toast.error(err.message || 'Failed to save owner')
    }
  }

  function openMortgageEdit(accountId) {
    const existing = mortgages[accountId]
    setMortgageForm({
      label: existing?.label || '',
      amount: existing?.amount != null ? String(existing.amount) : '',
      dueDay: existing?.dueDay != null ? String(existing.dueDay) : '',
    })
    setEditingMortgageId(accountId)
  }

  async function saveMortgage(accountId) {
    const label = mortgageForm.label.trim()
    const amount = Number(mortgageForm.amount)
    const dueDay = Number(mortgageForm.dueDay)
    if (!label) return toast.error('Label is required')
    if (!amount || amount <= 0) return toast.error('Enter a valid amount')
    if (!dueDay || dueDay < 1 || dueDay > 31) return toast.error('Due day must be 1-31')
    try {
      await callGateway('set_mortgage', { accountId, label, amount, dueDay })
      setMortgages(prev => ({ ...prev, [accountId]: { label, amount, dueDay } }))
      setEditingMortgageId(null)
      toast.success('Saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    }
  }

  async function clearMortgage(accountId) {
    try {
      await callGateway('set_mortgage', { accountId, amount: null })
      setMortgages(prev => { const next = { ...prev }; delete next[accountId]; return next })
      setEditingMortgageId(null)
      toast.success('Removed')
    } catch (err) {
      toast.error(err.message || 'Failed to remove')
    }
  }

  const grouped = useMemo(() => {
    const byOwner = {}
    for (const acct of accounts) {
      const key = acct.error ? '__error__' : (acct.owner || 'Unassigned')
      ;(byOwner[key] = byOwner[key] || []).push(acct)
    }
    const keys = Object.keys(byOwner).filter(k => k !== '__error__' && k !== 'Unassigned')
    keys.sort((a, b) => (a === 'Personal' ? -1 : b === 'Personal' ? 1 : a.localeCompare(b)))
    if (byOwner['Unassigned']) keys.push('Unassigned')
    if (byOwner['__error__']) keys.push('__error__')
    return keys.map(key => ({
      key,
      label: key === '__error__' ? 'Needs attention' : key,
      accounts: byOwner[key],
      total: byOwner[key].reduce((sum, a) => a.error ? sum : sum + (a.current ?? a.available ?? 0), 0),
    }))
  }, [accounts])

  const total = accounts.reduce((sum, a) => a.error ? sum : sum + (a.current ?? a.available ?? 0), 0)
  const errorCount = accounts.filter(a => a.error).length
  const ownerCount = grouped.filter(g => g.key !== '__error__').length
  const { whole, cents } = fmtMoney(total)

  const asOfLabel = updatedAt
    ? 'as of ' + new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'not yet loaded'

  if (loading) return <LoadingSpinner />

  return (
    <div className="bd-root">
      <header className="bd-hero">
        <div>
          <span className="bd-kicker">Consolidated Position</span>
          <h1>Ledger</h1>
        </div>
        <div className="bd-hero-right">
          <span className="bd-kicker">{asOfLabel}</span>
          <button
            className={`bd-ghost-btn${refreshing ? ' bd-spinning' : ''}`}
            title="Refresh balances"
            onClick={() => loadBalances(true)}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <section className="bd-total-panel">
        <div className="bd-total-label">Total across all accounts</div>
        <div className="bd-total-figure">
          <span className="bd-currency">$</span>{whole}
          <span className="bd-cents" style={{ fontSize: '0.55em' }}>.{cents}</span>
        </div>
        <div className="bd-total-sub">
          {accounts.length === 0
            ? 'no accounts linked yet'
            : `${accounts.length - errorCount} account${accounts.length - errorCount !== 1 ? 's' : ''} across ${ownerCount} owner${ownerCount !== 1 ? 's' : ''}${errorCount ? ` · ${errorCount} need attention` : ''}`}
        </div>
      </section>

      <main className="bd-main">
        <div className="bd-section-head">
          <h2>Accounts</h2>
          <button className="bd-primary-btn" onClick={startLink} disabled={linking}>
            {linking ? 'Opening…' : '+ Link a bank'}
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="bd-empty-state">
            <p>Nothing linked yet. Add Chase, RelayFi, Discover — anything Plaid supports — and this fills in.</p>
          </div>
        ) : (
          <div className="bd-account-list">
            {grouped.map(group => {
              const { whole: gWhole, cents: gCents } = fmtMoney(group.total)
              return (
                <div key={group.key} className="bd-institution-group">
                  <div className="bd-institution-header">
                    <span>{group.label}</span>
                    {group.key !== '__error__' && <span className="bd-group-total">${gWhole}.{gCents}</span>}
                  </div>
                  {group.accounts.map(acct => {
                    if (acct.error) {
                      const needsRelink = acct.error.startsWith('Needs re-link')
                      return (
                        <div key={acct.itemId} className="bd-account-row bd-error">
                          <div className="bd-name-block">
                            <div className="bd-name">{acct.institutionName}</div>
                            <div className="bd-meta">
                              error
                              {needsRelink && (
                                <button
                                  className="bd-relink-inline"
                                  disabled={relinkingId === acct.itemId}
                                  onClick={() => startRelink(acct.itemId, acct.institutionName)}
                                >
                                  {relinkingId === acct.itemId ? 're-linking…' : 're-link'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="bd-amount">{acct.error}</div>
                        </div>
                      )
                    }
                    const balance = acct.current ?? acct.available ?? 0
                    const { whole: aWhole, cents: aCents } = fmtMoney(balance)
                    const options = ['Unassigned', ...ownerOptions.filter(o => o !== 'Unassigned')]
                    return (
                      <div key={acct.accountId} className="bd-account-row">
                        <div className="bd-name-block">
                          <div className="bd-name">{acct.accountName}</div>
                          <div className="bd-meta">
                            {acct.type || ''}{acct.mask ? ` · ···${acct.mask}` : ''} · {acct.institutionName}
                            <button className="bd-unlink-inline" onClick={() => unlinkItem(acct.itemId, acct.institutionName)}>
                              unlink
                            </button>
                          </div>
                        </div>
                        <div className="bd-row-right">
                          <select
                            className="bd-owner-select"
                            value={acct.owner || ''}
                            onChange={e => assignOwner(acct.accountId, e.target.value)}
                          >
                            {options.map(o => (
                              <option key={o} value={o === 'Unassigned' ? '' : o}>{o}</option>
                            ))}
                            <option value={NEW_OWNER}>+ New owner…</option>
                          </select>

                          {editingMortgageId === acct.accountId ? (
                            <div className="bd-mortgage-form">
                              <input
                                placeholder="e.g. 188 Virginia mortgage"
                                value={mortgageForm.label}
                                onChange={e => setMortgageForm(f => ({ ...f, label: e.target.value }))}
                              />
                              <div className="bd-mortgage-form-row">
                                <input
                                  type="number" step="0.01" placeholder="Amount"
                                  value={mortgageForm.amount}
                                  onChange={e => setMortgageForm(f => ({ ...f, amount: e.target.value }))}
                                />
                                <input
                                  type="number" min="1" max="31" placeholder="Due day"
                                  value={mortgageForm.dueDay}
                                  onChange={e => setMortgageForm(f => ({ ...f, dueDay: e.target.value }))}
                                />
                              </div>
                              <div className="bd-mortgage-form-actions">
                                {mortgages[acct.accountId] && (
                                  <button className="bd-mortgage-clear" onClick={() => clearMortgage(acct.accountId)}>remove</button>
                                )}
                                <button onClick={() => setEditingMortgageId(null)}>cancel</button>
                                <button className="bd-mortgage-save" onClick={() => saveMortgage(acct.accountId)}>save</button>
                              </div>
                            </div>
                          ) : mortgages[acct.accountId] ? (
                            <div
                              className={`bd-mortgage-box ${balance >= mortgages[acct.accountId].amount ? 'bd-mortgage-ok' : 'bd-mortgage-short'}`}
                              onClick={() => openMortgageEdit(acct.accountId)}
                              title="Click to edit"
                            >
                              <span className="bd-mortgage-label">{mortgages[acct.accountId].label}</span>
                              <span className="bd-mortgage-due">
                                due {nextDueDate(mortgages[acct.accountId].dueDay).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                {balance < mortgages[acct.accountId].amount ? ' · short' : ''}
                              </span>
                              <span className="bd-mortgage-amount">${fmtMoney(mortgages[acct.accountId].amount).whole}.{fmtMoney(mortgages[acct.accountId].amount).cents}</span>
                            </div>
                          ) : (
                            <button className="bd-mortgage-add" onClick={() => openMortgageEdit(acct.accountId)}>+ mortgage</button>
                          )}

                          <div className={`bd-amount${balance < 0 ? ' bd-negative' : ''}`}>
                            {balance < 0 ? '−' : ''}${aWhole}<span className="bd-cents">.{aCents}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </main>

      <footer className="bd-footer">
        <span>Balances refresh on demand · access tokens never leave Shep Portal's backend · only you (or anyone granted access) can view this page</span>
      </footer>
    </div>
  )
}
