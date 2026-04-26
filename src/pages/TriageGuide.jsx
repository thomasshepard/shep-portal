import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const H2 = ({ children }) => (
  <h2 className="text-lg font-bold text-gray-900 mt-8 mb-3 pb-1 border-b border-gray-100">{children}</h2>
)
const H3 = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-2 uppercase tracking-widest">{children}</h3>
)
const P = ({ children }) => (
  <p className="text-sm text-gray-600 leading-relaxed mb-3">{children}</p>
)
const HR = () => <hr className="border-gray-100 my-6" />
const Callout = ({ children }) => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-3 text-sm text-gray-700 leading-relaxed">{children}</div>
)
const Code = ({ children }) => (
  <pre className="bg-gray-900 text-gray-100 text-xs leading-relaxed rounded-lg px-4 py-3 mb-3 overflow-x-auto whitespace-pre">{children}</pre>
)
const GuideTable = ({ headers, rows }) => (
  <div className="overflow-x-auto mb-4 rounded-lg border border-gray-100">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-50">
          {headers.map((h, i) => (
            <th key={i} className="text-left px-3 py-2 text-gray-500 font-medium text-xs uppercase tracking-wide border-b border-gray-100">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 text-gray-700 text-sm border-b border-gray-50 align-top">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
const UL = ({ items }) => (
  <ul className="space-y-1.5 mb-4 pl-1">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
        <span className="text-gray-300 mt-0.5">–</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
)

export default function TriageGuide() {
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl mx-auto pb-16 px-4 sm:px-0">
      <div className="sticky top-0 bg-slate-50 z-10 pt-4 pb-3 border-b border-gray-100 mb-6">
        <button
          onClick={() => navigate('/triage')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-2"
        >
          <ChevronLeft size={16} /> Back to Triage
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Triage Station</h1>
        <p className="text-xs text-gray-400 mt-0.5">User Guide · Shep Portal</p>
      </div>

      {/* What it is */}
      <P>
        Triage is a single page that shows every active item across your properties, rentals, chickens, and LLCs that needs attention — sorted by urgency. Nothing else. If something is on track, it doesn't appear. You only see what's actually off.
      </P>
      <P>
        Think of it as your morning floor walk. 90 seconds, you know what's late, what's about to be late, what's gone quiet, and what you're watching. Then you put the phone down and go to work.
      </P>
      <P>
        <strong>Most items surface automatically from the rules engine.</strong> You don't need to tag anything — overdue rent, expiring leases, stale maintenance requests, LLC filing deadlines, and overdue tasks appear without any manual work. The manual flag system (Triage Setup) is for one-off situations that don't fit a rule.
      </P>

      <HR />

      {/* Reading the page */}
      <H2>Reading the page</H2>
      <P>Four sections, in order. Empty sections don't appear.</P>

      <H3>🔴 Late</H3>
      <P>The checkpoint date has passed. These need action today. If something is in this bucket, a real consequence is either already happening or about to.</P>

      <H3>🟡 Due Soon</H3>
      <P>The checkpoint is within the next 3 days. Not on fire yet, but it will be if you don't move.</P>

      <H3>⚪ Stale</H3>
      <P>No update has been logged in 7+ days. Could be fine, could be quietly drifting. Worth a quick check-in to confirm status.</P>

      <H3>🔵 Watching</H3>
      <P>Ongoing situations with no hard deadline yet — things you're keeping an eye on. No action required today, but you want them in front of you so they don't disappear.</P>

      <HR />

      {/* Reading a card */}
      <H2>Reading a card</H2>
      <Code>{`PROPERTY · 73 BENWICK
VA flag repairs completed before inspection
Expected May 1 · Due in 2 days
⚠ VA loan falls through
[Subcontractor]    [Update]  [Open →]`}</Code>

      <P><strong>Source label</strong> — which module and record. Property, Lease, Maintenance, Flock, or LLC.</P>
      <P><strong>What Should Be True</strong> — the milestone you're tracking. One clear statement of what done looks like.</P>
      <P><strong>Date line</strong> — color-coded. Red = late, amber = due soon, gray = stale, blue = watching.</P>
      <P><strong>Consequence</strong> — only shows on Late and Due Soon cards. One-line reminder of what breaks if this slips.</P>
      <P><strong>Handler badge</strong> — Thomas (slate), Janine (purple), Gabrielle (pink), Anthony (green), Subcontractor (orange), Decide (yellow). "Decide" means it's on you to figure out who handles it.</P>

      <HR />

      {/* Buttons */}
      <H2>The buttons on every card</H2>

      <H3>× (dismiss)</H3>
      <P>Small X in the top-right corner of every card. Hides the card for 24 hours. Use this when you've seen it and you're choosing to let it sit. It comes back tomorrow.</P>

      <H3>Open</H3>
      <P>Jumps directly to the source record — the full Property detail, Lease page, Maintenance request, Flock detail, or LLC record. Use this when you need context or want to take action in the module.</P>

      <H3>Update (manual items only)</H3>
      <P>Opens a quick modal with:</P>
      <UL items={[
        'Last Observed — pre-filled with the current note. Rewrite it with what\'s true now. Keep it to one line.',
        'Last Observed Date — defaults to today.',
        'Optional: Expected Next Checkpoint and Triage Status (mark as Done, change to Watch, etc.)',
        'Mark Done button — closes out the item immediately.',
      ]} />

      <H3>Action button (rule-based items)</H3>
      <P>Items from the rules engine show an action button based on what the rule says to do — e.g. "Complete Task" for overdue tasks. Tapping it resolves the item inline and removes the card.</P>

      <HR />

      {/* Rules engine */}
      <H2>The rules engine</H2>
      <P>These 9 rules run automatically on every refresh. No setup needed.</P>
      <GuideTable
        headers={['Rule', 'Triggers when']}
        rows={[
          ['Rent overdue',              'An invoice payment is past due and not marked Paid'],
          ['Lease ending',              'A lease expires within 60 days with no closed status'],
          ['Maintenance stale',         'An open maintenance request hasn\'t been updated in 7+ days'],
          ['LLC annual report',         'An LLC\'s annual report is due within 60 days'],
          ['Flock candling day',        'Today is Day 7, 14, or 17 since a growing flock\'s hatch date'],
          ['Flock processing due',      'A flock\'s processing date is within 7 days or past'],
          ['Document action required',  'A document tagged "Action Required" hasn\'t been updated in 3+ days'],
          ['Task overdue',              'A task is past its due date and not marked Done'],
          ['Alert stale',               'An Alerts table record is marked Active and is 24h+ old'],
        ]}
      />
      <P>Plus the manual flag system (Rule 10) — items you tag directly in Airtable with Triage Status = Initiative, Rhythm, or Watch.</P>

      {/* Adding things */}
      <H2>Adding things to Triage</H2>

      <H3>Most things appear automatically</H3>
      <P>If rent is overdue, a lease is expiring, or a task is late — it just shows up. No action needed. Close the underlying record (mark it paid, close the lease, complete the task) and it disappears on the next refresh.</P>

      <H3>For one-off situations: Setup page (admin only)</H3>
      <P>Go to <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">/triage/setup</code>. Use this only for items that don't fit a rule — situations, custom projects, or follow-ups with people. Fill in the 8 fields and save.</P>

      <H3>Conversational via Claude (recommended for one-offs)</H3>
      <P>Tell Claude in the Triage Operator project:</P>
      <Callout>"I need to track the new chicks coming Friday. Need to build tractor #2 before they hit week 3."</Callout>
      <P>Claude pulls up the right record, fills in all 8 fields, and confirms. You don't touch a form.</P>

      <H3>Directly in Airtable</H3>
      <P>Open any of the 5 tables and fill in the 8 triage fields manually. The triage page picks it up on the next refresh.</P>

      <HR />

      {/* The 8 fields */}
      <H2>The 8 fields behind every card</H2>
      <GuideTable
        headers={['Field', 'What it does']}
        rows={[
          ['Triage Status', 'Initiative (finite project), Rhythm (recurring), Watch (monitoring), Done (close it out), Off-Triage (hidden)'],
          ['Expected Next Checkpoint', 'The date by which the next milestone should be true'],
          ['What Should Be True', 'Plain-English description of that milestone'],
          ['Last Observed', 'Your most recent status note'],
          ['Last Observed Date', 'When you last updated the observation'],
          ['Staleness Days', 'Buffer before a missed checkpoint turns red (default: 0)'],
          ['Default Handler', 'Who owns this'],
          ['Consequence', 'What breaks if it\'s missed'],
        ]}
      />

      <HR />

      {/* Closing out */}
      <H2>Closing things out</H2>
      <P>When something is resolved, open the Update modal and change Triage Status to <strong>Done</strong>. It disappears immediately. The underlying record stays intact with its history.</P>
      <P>Don't leave Done items sitting in the view. A cluttered triage view means you stop trusting it. Trust requires signal — not noise.</P>

      <HR />

      {/* Three types */}
      <H2>The three types of triage items</H2>
      <P><strong>Initiative</strong> — has a finish line. 73 Benwick repairs before inspection. 195 Kingwood rented. These end.</P>
      <P><strong>Rhythm</strong> — recurring obligation on a clock. Lender email every 14 days. Monthly rent collection check. These tick forever.</P>
      <P><strong>Watch</strong> — ongoing situation, no action needed yet, but you don't want it disappearing from view. These resolve into an Initiative when it's time to act, or close when the situation clears.</P>

      <HR />

      {/* Daily use */}
      <H2>Daily use</H2>

      <H3>Morning — 60 seconds</H3>
      <P>Open Triage. Read the reds first. Decide: am I handling this today, am I routing it, or am I consciously letting it wait? Put the phone down.</P>

      <H3>When something changes — 15 seconds</H3>
      <P>Open the Triage Operator project in Claude. Say what happened. Claude logs it. Or tap Update directly on the card.</P>

      <H3>Sunday night — 20 minutes</H3>
      <P>In Claude, say "walk the watches." Claude reads you every Watch item with its last observation and gives you a read on whether it's drifting toward red or staying stable. You say "still watching," "promote to initiative," or "close it." This is the most important ritual in the system.</P>

      <HR />

      {/* Delegation */}
      <H2>Delegation</H2>
      <P>Every card shows a Handler badge. When the handler is Janine or Anthony, that's your signal to route — not that routing has already happened. The system tracks ownership, not communication.</P>
      <P>Janine (VA role) sees the same Triage view. Anthony and Gabrielle can be given member access with <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">can_view_triage</code> enabled via Admin → Users.</P>

      <HR />

      {/* What doesn't belong */}
      <H2>What does NOT belong in Triage</H2>
      <UL items={[
        'Low-stakes someday projects — no consequence if missed, no business impact',
        'Reference information and documents — use the Documents module',
        'General to-do items — use the Tasks module',
        'Anything you\'re adding just to feel organized — if you can\'t articulate the Consequence, it shouldn\'t be here',
      ]} />
      <P>The signal degrades when noise gets in. Be ruthless about what earns a spot.</P>

      <HR />

      {/* Triage Operator */}
      <H2>Triage Operator — the conversational interface</H2>
      <P>The fastest way to maintain this system is to not touch forms at all. Set up a Claude.ai Project called <strong>Triage Operator</strong> with the triage playbook loaded as custom instructions and Airtable MCP connected.</P>
      <GuideTable
        headers={['You say', 'What happens']}
        rows={[
          ['"Triage check-in"', 'Claude fetches all records and gives you the full briefing'],
          ['"Sent Brooke the lender email"', 'Claude logs Last Observed on 56 S Harris, asks if you want to push the checkpoint 14 days'],
          ['"Walk the watches"', 'Claude reads you every Watch item with a status assessment'],
          ['"John Phillips paid $400 partial"', 'Claude updates 589 Dyer Cemetery, logs the partial payment, asks about the checkpoint'],
          ['"Mark 73 Benwick as done"', 'Claude sets Triage Status to Done, confirms'],
          ['"Add a watch on [anything]"', 'Claude finds the right source record and fills the 8 fields'],
        ]}
      />
      <P>This is the intended mode. The portal triage page is the visual dashboard. The Claude conversation is the update interface. Together they're the operating system.</P>

      <HR />

      {/* Troubleshooting */}
      <H2>Troubleshooting</H2>

      <H3>Page loads but nothing shows</H3>
      <P>Records exist but none have Triage Status set to Initiative, Rhythm, or Watch. Go to <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">/triage/setup</code> and tag your records.</P>

      <H3>Something is in the wrong bucket</H3>
      <P>Most likely a date typo on Expected Next Checkpoint. Tap Update on the card and correct it.</P>

      <H3>Item should be gone but still shows</H3>
      <P>Open the Update modal and set Triage Status to Done.</P>

      <H3>"Last update X days ago" seems wrong</H3>
      <P>The Last Observed Date field has an old date or is empty. Tap Update, set today's date, and save.</P>

      <H3>Page shows an error / won't load</H3>
      <P>Hard refresh on mobile: close the tab fully and reopen. If it persists, check that your Airtable PAT is still valid — it's shared across all 6 bases.</P>

      <div className="mt-10 text-xs text-gray-400 text-center">
        Triage Station · Phase 1 · April 2026
      </div>
    </div>
  )
}
