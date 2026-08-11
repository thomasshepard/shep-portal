import { useEffect, useState } from 'react'
import { Plus, X, ScrollText, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

// Links Shep Portal auth accounts to Happy Cuts Crew (Airtable) records for the
// separate Crew Portal site. See /Happy Cuts/crew-portal-design.md for the full design.
// This page runs inside Shep Portal admin, which already holds the Airtable PAT —
// the Crew Portal site itself never gets it (see design doc §1).

const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
const HC_PAT = import.meta.env.VITE_AIRTABLE_PAT
const AT_BASE = `https://api.airtable.com/v0/${HC_BASE}`
const CREW_TABLE = 'tblDqfsBT67Erlwwu'

const CRF = {
  name: 'fldoR81EQ7j0NVq3F',
  phone: 'fldQXN9o0yn06x7xj',
  email: 'fldShJVF4HfO8443O',
  status: 'fldq9P1B4Gqbe1wOj', // singleSelect, includes 'Inactive'
}

const TIERS = [
  { value: 1, label: 'Tier 1 — Day list', description: "Today's assigned jobs only: time, address, service type, notes." },
  { value: 2, label: 'Tier 2 — Paid', description: '+ payout preview per job.' },
  { value: 3, label: 'Tier 3 — Field', description: '+ can mark complete, add notes/photos.' },
  { value: 4, label: 'Tier 4 — Trusted', description: '+ week ahead, job history, payout ledger.' },
]

function safeStr(val, fallback = '') {
  if (val == null || val === '') return fallback
  if (typeof val === 'object') return val.name || fallback
  return String(val)
}

async function fetchCrewFromAirtable() {
  if (!HC_BASE || !HC_PAT) return []
  const records = []
  let offset = null
  do {
    let qs = '?returnFieldsByFieldId=true'
    if (offset) qs += `&offset=${offset}`
    const r = await fetch(`${AT_BASE}/${CREW_TABLE}${qs}`, { headers: { Authorization: `Bearer ${HC_PAT}` } })
    const json = await r.json()
    if (!json.records) throw new Error(json.error?.message || 'Airtable fetch failed')
    records.push(...json.records)
    offset = json.offset || null
  } while (offset)
  return records.map(r => ({
    id: r.id,
    name: safeStr(r.fields?.[CRF.name]),
    phone: safeStr(r.fields?.[CRF.phone]),
    email: safeStr(r.fields?.[CRF.email]),
    status: safeStr(r.fields?.[CRF.status]),
  }))
}

export default function AdminCrewAccess() {
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [airtableCrew, setAirtableCrew] = useState([])
  const [links, setLinks] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [showInvite, setShowInvite] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [revealLogFor, setRevealLogFor] = useState(null) // { profileId, name }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [crewRecords, { data: linkRows, error: linkErr }] = await Promise.all([
        fetchCrewFromAirtable().catch(err => { toast.error('Failed to load Airtable Crew: ' + err.message); return [] }),
        supabase.from('crew_links').select('*').order('created_at', { ascending: false }),
      ])

      if (linkErr) {
        if (linkErr.code === '42P01' || /does not exist/i.test(linkErr.message || '')) {
          setTableMissing(true)
          setLoading(false)
          return
        }
        toast.error('Failed to load crew links: ' + linkErr.message)
      }

      setAirtableCrew(crewRecords)

      const rows = linkRows || []
      setLinks(rows)

      const profileIds = rows.map(r => r.profile_id)
      if (profileIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, email, full_name, last_login, is_active')
          .in('id', profileIds)
        if (profErr) toast.error('Failed to load profiles: ' + profErr.message)
        setProfilesById(Object.fromEntries((profs || []).map(p => [p.id, p])))
      } else {
        setProfilesById({})
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite({ crewId, email, fullName, tier }) {
    setInviting(true)
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('invite-crew-user', {
        body: { email, fullName },
      })
      if (fnErr || fnData?.error) {
        toast.error(fnErr?.message || fnData?.error || 'Failed to invite user')
        return
      }
      const userId = fnData?.userId
      if (!userId) {
        toast.error('Invite sent but no user ID returned — check Supabase Auth dashboard.')
        return
      }

      // Profile row is auto-created by the signup trigger for brand-new invites; for
      // an existing account it already exists. Either way, just set the name.
      if (fullName) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)
          if (!error) break
          await new Promise(r => setTimeout(r, 300))
        }
      }

      const { error: linkErr } = await supabase.from('crew_links').insert({
        profile_id: userId,
        airtable_crew_id: crewId,
        access_tier: tier,
        active: true,
      })
      if (linkErr) {
        if (linkErr.code === '23505') toast.error('This person is already linked to a crew record.')
        else toast.error('Failed to create crew link: ' + linkErr.message)
        return
      }

      toast.success(fnData?.alreadyExisted ? 'Linked existing account' : `Invite sent to ${email}`, { duration: 6000 })
      setShowInvite(false)
      load()
    } finally {
      setInviting(false)
    }
  }

  async function handleTierChange(link, tier) {
    const { error } = await supabase.from('crew_links').update({ access_tier: tier }).eq('id', link.id)
    if (error) { toast.error(error.message); return }
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, access_tier: tier } : l))
    toast.success('Tier updated')
  }

  async function handleToggleActive(link) {
    const nextActive = !link.active
    const { error: linkErr } = await supabase.from('crew_links').update({ active: nextActive }).eq('id', link.id)
    if (linkErr) { toast.error(linkErr.message); return }
    // Deactivating also locks the underlying Shep Portal account, since it shares
    // the same Supabase auth as the rest of the portal.
    await supabase.from('profiles').update({ is_active: nextActive }).eq('id', link.profile_id)
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, active: nextActive } : l))
    setProfilesById(prev => prev[link.profile_id] ? { ...prev, [link.profile_id]: { ...prev[link.profile_id], is_active: nextActive } } : prev)
    toast.success(nextActive ? 'Partner reactivated' : 'Partner deactivated')
  }

  if (loading) return <LoadingSpinner />

  if (tableMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex gap-3">
        <ShieldAlert className="text-amber-500 shrink-0" size={20} />
        <div>
          <p className="font-medium text-amber-800">Crew Portal tables not found</p>
          <p className="text-sm text-amber-700 mt-1">
            Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260810_create_crew_portal_tables.sql</code> in
            the Supabase SQL editor, then reload this page.
          </p>
        </div>
      </div>
    )
  }

  const linkedCrewIds = new Set(links.map(l => l.airtable_crew_id))
  const unlinkedCrew = airtableCrew.filter(c => c.status !== 'Inactive' && !linkedCrewIds.has(c.id))
  const crewById = Object.fromEntries(airtableCrew.map(c => [c.id, c]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crew Access</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage partner logins for the Happy Cuts Crew Portal — a separate site with its own
            magic-link login. Tier controls what each partner can see; see the design doc for details.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          disabled={unlinkedCrew.length === 0}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={unlinkedCrew.length === 0 ? 'Every active Crew record already has a linked account' : ''}
        >
          <Plus size={16} /> Invite Partner
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Partner</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Crew Record</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Last Login</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Tier</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Reveal Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                    No partners yet — click Invite Partner to add one.
                  </td>
                </tr>
              ) : links.map(link => {
                const profile = profilesById[link.profile_id]
                const crewRecord = crewById[link.airtable_crew_id]
                return (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{profile?.full_name || '—'}</p>
                      <p className="text-xs text-gray-400">{profile?.email || link.profile_id}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {crewRecord?.name || <span className="text-gray-300 italic">Airtable record not found</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {profile?.last_login ? new Date(profile.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={link.access_tier}
                        onChange={e => handleTierChange(link, Number(e.target.value))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        {TIERS.map(t => <option key={t.value} value={t.value}>{t.value} — {t.label.split('— ')[1]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(link)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          link.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {link.active ? 'Active' : 'Deactivated'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setRevealLogFor({ profileId: link.profile_id, name: profile?.full_name || profile?.email || 'Partner' })}
                        className="text-xs font-medium text-gray-500 hover:text-gray-800 flex items-center gap-1 mx-auto"
                      >
                        <ScrollText size={13} /> View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <InviteModal
          unlinkedCrew={unlinkedCrew}
          inviting={inviting}
          onClose={() => setShowInvite(false)}
          onSubmit={handleInvite}
        />
      )}

      {revealLogFor && (
        <RevealLogModal target={revealLogFor} onClose={() => setRevealLogFor(null)} />
      )}
    </div>
  )
}

function InviteModal({ unlinkedCrew, inviting, onClose, onSubmit }) {
  const [crewId, setCrewId] = useState(unlinkedCrew[0]?.id || '')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState(1)

  const selectedCrew = unlinkedCrew.find(c => c.id === crewId)

  useEffect(() => {
    if (selectedCrew?.email && !email) setEmail(selectedCrew.email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId])

  function handleSubmit(e) {
    e.preventDefault()
    if (!crewId || !email) return toast.error('Pick a crew record and enter an email')
    onSubmit({ crewId, email: email.trim(), fullName: selectedCrew?.name || '', tier })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 text-lg">Invite Partner</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Crew record (Airtable)</label>
            <select
              value={crewId}
              onChange={e => setCrewId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              required
            >
              {unlinkedCrew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Add the person in the Happy Cuts Crew tab first if they're not listed.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="partner@example.com"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Starting tier</label>
            <div className="space-y-1.5">
              {TIERS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    tier === t.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className={`block text-xs ${tier === t.value ? 'text-blue-100' : 'text-gray-400'}`}>{t.description}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Sends a magic-link invite email. The partner logs into the Crew Portal — not Shep Portal — with no password.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={inviting} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RevealLogModal({ target, onClose }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])

  useEffect(() => {
    supabase
      .from('contact_reveal_log')
      .select('*')
      .eq('profile_id', target.profileId)
      .order('revealed_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load reveal log: ' + error.message)
        setRows(data || [])
        setLoading(false)
      })
  }, [target.profileId])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-800 text-lg">Emergency Contact Reveals</h3>
            <p className="text-xs text-gray-400">{target.name}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No emergency reveals logged.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <div key={row.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">{new Date(row.revealed_at).toLocaleString()}</span>
                  <span className="text-xs text-gray-300">expired {new Date(row.expires_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{row.reason}</p>
                <p className="text-xs text-gray-400 mt-1">Job {row.airtable_job_id} · Contact {row.airtable_contact_id}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
