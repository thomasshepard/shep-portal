import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp, Bell, Zap, Settings, Check, Clock, MessageSquare } from 'lucide-react'

// ── Accordion helpers ────────────────────────────────────────────────────────

function useAccordion() {
  const [openSections, setOpenSections] = useState([])
  const toggle = (id) => setOpenSections(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  const isOpen = (id) => openSections.includes(id)
  return { toggle, isOpen }
}

function Section({ id, title, toggle, isOpen, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={() => toggle(id)}
        className="w-full flex items-center justify-between p-4 text-left font-semibold text-gray-800 border-l-4 border-amber-400 hover:bg-gray-50 transition-colors">
        <span>{title}</span>
        {isOpen(id) ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {isOpen(id) && (
        <div className="px-4 pb-5 text-sm text-gray-700 space-y-3 border-t border-gray-50">
          {children}
        </div>
      )}
    </div>
  )
}

function Tip({ children }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
      <span className="flex-shrink-0">💡</span>
      <p className="text-amber-800 text-sm leading-relaxed">{children}</p>
    </div>
  )
}

function GuideTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
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
}

function StepItem({ num, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">{num}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 mb-1">{title}</p>
        <div className="text-sm text-gray-600 space-y-1">{children}</div>
      </div>
    </div>
  )
}

// ── Main Guide ───────────────────────────────────────────────────────────────

export default function DigestGuide() {
  const navigate = useNavigate()
  const { toggle, isOpen } = useAccordion()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/notifications/settings')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ChevronLeft size={16} /> Back to Notification Settings
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Daily Digest Guide</h1>
        <p className="text-sm text-gray-500 mt-1">Your morning briefing in Discord — everything that needs attention, every day at 7 AM.</p>
      </div>

      {/* Section 1 — What is the Daily Digest? */}
      <Section id="what" title="1 · What is the Daily Digest?" toggle={toggle} isOpen={isOpen}>
        <p className="mt-3 leading-relaxed">
          The digest is an automated message posted to the <strong>#shep-portal</strong> Discord channel every morning at <strong>7:00 AM Central</strong>. It pulls live data from five of your Airtable bases — Properties, Happy Cuts, Chickens, LLCs, and Tasks — compares it to yesterday's snapshot, and summarizes everything that needs your attention in one place.
        </p>
        <Tip>The digest posts even if nothing has changed, so a quiet morning is a positive signal — not a broken bot.</Tip>
      </Section>

      {/* Section 2 — What's in each digest? */}
      <Section id="contents" title="2 · What's in each digest?" toggle={toggle} isOpen={isOpen}>
        <div className="mt-3">
          <GuideTable
            headers={['Section', "What it shows", 'Delta']}
            rows={[
              ['🏠 Properties', 'Open maintenance requests', 'New since yesterday'],
              ['🌿 Happy Cuts', "Overdue mows + today's scheduled mows", 'Change in overdue count'],
              ['🐔 Chickens', 'Active flocks — bird count, days remaining', 'Mortality since yesterday'],
              ['🏢 LLCs', 'Annual reports due or overdue', 'Newly overdue'],
              ['✅ Tasks', 'Count of overdue tasks + top 5 by priority', 'New overdue tasks'],
            ]}
          />
        </div>
        <p className="leading-relaxed">
          The <strong>top 5 tasks</strong> are rendered as interactive buttons. Each has a <strong>Done ✓</strong> button you can tap directly inside Discord to mark the task complete — no need to open the portal.
        </p>
        <Tip>Each section only appears in the digest if it has something to report. A digest with only one section means everything else is clear.</Tip>
      </Section>

      {/* Section 3 — Interacting with the digest */}
      <Section id="interact" title="3 · Interacting with the digest" toggle={toggle} isOpen={isOpen}>
        <div className="space-y-5 mt-3">
          <StepItem num={1} title='Tap "Done ✓" on a task'>
            <p>Marks the task complete in Airtable immediately. The button is on the digest message itself inside Discord. No login required.</p>
          </StepItem>
          <StepItem num={2} title="@-mention">
            <p>If your Discord user ID is set in Notification Settings, the digest opens with an @-mention so you get a ping on your phone even when the server is muted.</p>
          </StepItem>
          <StepItem num={3} title='"Send test digest now" button'>
            <p>In Notification Settings → Discord section, admins can fire a digest on demand to verify setup without waiting for the 7 AM cron.</p>
          </StepItem>
          <StepItem num={4} title="Slash commands (coming soon)">
            <p><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/done [task]</code>, <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/snooze [alert]</code>, and other two-way commands are planned. Button interactions on the digest already work while slash commands are being finalized.</p>
          </StepItem>
        </div>
        <Tip>Done buttons only work for tasks that appear in the Top 5 list. To act on other tasks, open the Tasks page in the portal.</Tip>
      </Section>

      {/* Section 4 — Setting up Discord */}
      <Section id="setup" title="4 · Setting up Discord" toggle={toggle} isOpen={isOpen}>
        <div className="space-y-5 mt-3">
          <StepItem num={1} title="Enable Discord delivery">
            <p>Go to Notification Settings and turn on "Enable Discord delivery." Save settings.</p>
          </StepItem>
          <StepItem num={2} title="Set your Discord user ID">
            <p>In Discord, open Settings → Advanced → enable Developer Mode. Then right-click your own name in any channel → "Copy User ID." Paste that number into the "Your Discord user ID" field in Notification Settings.</p>
          </StepItem>
          <StepItem num={3} title="Choose which modules route to Discord">
            <p>In the "Email delivery per module" grid, set any module's delivery to <strong>Discord</strong> to route those notifications to the #shep-portal channel instead of email.</p>
          </StepItem>
          <StepItem num={4} title="Verify setup">
            <p>Use the "Send test digest now" button (visible to admins). A message should appear in #shep-portal within a few seconds.</p>
          </StepItem>
        </div>
        <Tip>Your Discord user ID is a long number like 1234567890123456789 — it is NOT your username. Developer Mode must be on to copy it.</Tip>
      </Section>

      {/* Section 5 — Per-module delivery modes */}
      <Section id="modes" title="5 · Per-module delivery modes" toggle={toggle} isOpen={isOpen}>
        <p className="mt-3 leading-relaxed">
          Each module in the portal can route notifications one of four ways. Open <strong>Notification Settings → Email delivery per module</strong> to configure.
        </p>
        <GuideTable
          headers={['Mode', 'What happens']}
          rows={[
            ['Instant', 'Email sent immediately on each event'],
            ['Digest', 'Bundled into the 7 AM email summary'],
            ['Discord', 'Sent to #shep-portal instead of email'],
            ['Off', 'In-app bell only — no email or Discord'],
          ]}
        />
        <p className="leading-relaxed">
          Critical events (e.g. severe maintenance, overdue payments) always bypass these settings and email instantly regardless of what is configured.
        </p>
      </Section>

      {/* Section 6 — Timing & schedule */}
      <Section id="timing" title="6 · Timing & schedule" toggle={toggle} isOpen={isOpen}>
        <p className="mt-3 leading-relaxed">
          The digest fires via a GitHub Actions cron job defined in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">.github/workflows/daily-notifications.yml</code>. It runs at <strong>UTC 12:00 (7:00 AM Central)</strong> every day. It calls the <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">send-daily-digest</code> Supabase edge function, which pulls fresh Airtable data, computes deltas against the <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">daily_snapshots</code> table, posts to Discord via the bot token, and saves a new snapshot.
        </p>
        <GuideTable
          headers={['Step', 'What happens']}
          rows={[
            ['1', 'GitHub Actions triggers at UTC 12:00'],
            ['2', 'Calls send-daily-digest edge function'],
            ['3', 'Fetches live data from 5 Airtable bases'],
            ['4', "Computes deltas vs yesterday's daily_snapshots row"],
            ['5', 'Posts formatted message to #shep-portal via bot'],
            ['6', "Saves today's snapshot for tomorrow's delta"],
          ]}
        />
        <Tip>Edge function deploys are NOT automatic with GitHub pushes. If you change send-daily-digest locally, run: <code className="font-mono">supabase functions deploy send-daily-digest</code> from PowerShell.</Tip>
      </Section>

      {/* Section 7 — Known limitations */}
      <Section id="limitations" title="7 · Known limitations & what's coming" toggle={toggle} isOpen={isOpen}>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 mt-3">
          <li><strong>Chicken flocks</strong> — Active flocks may not appear until the flock status filter in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">send-daily-digest/index.ts</code> is updated from <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">Status='Active'</code> to include <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">'Growing'</code> and <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">'Brooding'</code>.</li>
          <li><strong>Slash commands</strong> — Discord returned a transient error during registration. Button interactions on the digest work fine in the meantime.</li>
          <li><strong>Discord @-mention</strong> — Requires your Discord user ID to be saved in Notification Settings. The field is there; just paste your ID and save.</li>
          <li><strong>Discord settings UI</strong> — The Discord enable toggle and user ID field may not be visible in the deployed build yet. If missing, check the Notification Settings page and re-deploy after confirming the React code is correct.</li>
          <li><strong>Digest hour</strong> — Currently fixed at 7 AM CT. A time picker UI is planned.</li>
        </ul>
      </Section>

      {/* Bottom CTA */}
      <div className="pt-2">
        <button
          onClick={() => navigate('/notifications/settings')}
          className="bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors"
        >
          Go to Notification Settings
        </button>
      </div>
    </div>
  )
}
