import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Content helpers — same vocabulary as TriageGuide.jsx / HappyCutsGuide.jsx,
// reused for visual consistency across the app's guide pages. ──────────────
const H2 = ({ id, children }) => (
  <h2 id={id} className="text-lg font-bold text-gray-900 mt-8 mb-3 pb-1 border-b border-gray-100 scroll-mt-24">{children}</h2>
)
const H3 = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-2 uppercase tracking-widest">{children}</h3>
)
const P = ({ children }) => (
  <p className="text-sm text-gray-600 leading-relaxed mb-3">{children}</p>
)
const HR = () => <hr className="border-gray-100 my-6" />
const Steps = ({ items }) => (
  <ol className="space-y-2.5 mb-4">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-sm text-gray-600">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
        <span className="leading-relaxed">{item}</span>
      </li>
    ))}
  </ol>
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
const Stop = ({ children }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex gap-2">
    <span className="flex-shrink-0">🛑</span>
    <p className="text-red-800 text-sm leading-relaxed">{children}</p>
  </div>
)

const FlowPill = ({ label, sub, color }) => (
  <div className="flex flex-col items-center flex-1 min-w-[92px]">
    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${color}`}>{label}</span>
    {sub && <span className="text-[10px] text-gray-400 mt-1 text-center leading-tight">{sub}</span>}
  </div>
)
const FlowArrow = () => (
  <div className="flex flex-col items-center shrink-0 mx-1 mt-1">
    <div className="w-4 h-px bg-gray-300" />
    <ChevronRight size={12} className="text-gray-300 -mt-1.5" />
  </div>
)
const DecisionBox = ({ title, sub, color }) => (
  <div className={`rounded-lg border p-2.5 text-center w-full ${color}`}>
    <div className="text-xs font-semibold">{title}</div>
    {sub && <div className="text-xs mt-0.5 opacity-80">{sub}</div>}
  </div>
)

// ─── Flow 1 — where a transaction comes from ───────────────────────────────
// Two starting points converge on the same Journal Entries list. Reuses the
// horizontal chain-of-pills pattern from HappyCutsGuide's ClientLifecycleFlow.
function SourceFlow() {
  return (
    <div className="mb-4 space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[520px] flex items-start">
          <FlowPill label="Mow marked Paid" sub="Happy Cuts" color="bg-blue-100 text-blue-800 border-blue-200" />
          <FlowArrow />
          <FlowPill label="Posted instantly" sub="no review needed" color="bg-violet-100 text-violet-800 border-violet-200" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px] flex items-start">
          <FlowPill label="Bank syncs" sub="SimpleFin" color="bg-blue-100 text-blue-800 border-blue-200" />
          <FlowArrow />
          <FlowPill label="Unreviewed" sub="needs a category" color="bg-yellow-100 text-yellow-800 border-yellow-200" />
          <FlowArrow />
          <FlowPill label="Categorized" sub="auto or by hand" color="bg-orange-100 text-orange-800 border-orange-200" />
          <FlowArrow />
          <FlowPill label="Posted" sub="in Journal Entries" color="bg-green-100 text-green-800 border-green-200" />
          <FlowArrow />
          <FlowPill label="Receipt attached" sub="optional" color="bg-gray-100 text-gray-600 border-gray-200" />
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">Both paths land in the same Journal Entries list — the top row is why Happy Cuts entries never show up in Unreviewed.</p>
    </div>
  )
}

// ─── Flow 2 — does it need a human? ────────────────────────────────────────
function AutoPostDecision() {
  return (
    <div className="mb-4 flex flex-col items-center text-sm">
      <div className="px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg font-medium text-gray-700 text-xs text-center">New bank transaction synced</div>
      <div className="w-px h-4 bg-gray-300" />
      <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 font-medium text-center max-w-[280px]">
        Same vendor categorized the same way 2+ times before?
      </div>
      <div className="w-full flex justify-center relative mt-1">
        <div className="w-40 h-px bg-gray-300 absolute top-0" />
        <div className="w-px h-4 bg-gray-300 absolute top-0 left-1/2 -translate-x-1/2" />
      </div>
      <div className="flex w-full mt-1 gap-2">
        <div className="flex-1 flex flex-col items-center">
          <div className="w-px h-3 bg-green-300" />
          <div className="text-xs font-bold text-green-700 mb-1">YES</div>
          <div className="w-px h-3 bg-green-300" />
          <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center w-full">
            <div className="text-xs font-semibold text-green-800">Auto-posts</div>
            <div className="text-xs text-green-600 mt-0.5">badge: Auto · Bank Feed · Learned</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="w-px h-3 bg-amber-300" />
          <div className="text-xs font-bold text-amber-700 mb-1">NO</div>
          <div className="w-px h-3 bg-amber-300" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center w-full">
            <div className="text-xs font-semibold text-amber-800">Lands in Unreviewed</div>
            <div className="text-xs text-amber-600 mt-0.5">needs a human pick</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Flow 3 — VA per-transaction decision ──────────────────────────────────
function CategorizeDecision() {
  return (
    <div className="mb-4 flex flex-col items-center text-sm">
      <div className="px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg font-medium text-gray-700 text-xs">Open a transaction in Unreviewed</div>
      <div className="w-px h-4 bg-gray-300" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-lg">
        <DecisionBox title="⭐ AI suggestion looks right" sub="tap it" color="bg-violet-50 border-violet-200 text-violet-800" />
        <DecisionBox title="You know the right category" sub="pick it from the list" color="bg-green-50 border-green-200 text-green-800" />
        <DecisionBox title="Not sure" sub="leave it — don't guess" color="bg-red-50 border-red-200 text-red-800" />
      </div>
    </div>
  )
}

export default function BookkeepingGuide() {
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl mx-auto pb-16 px-4 sm:px-0">
      <div className="sticky top-0 bg-slate-50 z-10 pt-4 pb-3 border-b border-gray-100 mb-6">
        <button
          onClick={() => navigate('/bookkeeping')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-2"
        >
          <ChevronLeft size={16} /> Back to Bookkeeping
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Bookkeeping — Review Guide</h1>
        <p className="text-xs text-gray-400 mt-0.5">SOP · Shep Portal</p>
        <div className="flex gap-3 mt-3 text-xs font-medium">
          <a href="#va" className="text-violet-600 hover:text-violet-800">↓ VA daily routine</a>
          <a href="#admin" className="text-violet-600 hover:text-violet-800">↓ Thomas's periodic review</a>
        </div>
      </div>

      <P>
        Two people touch this ledger, on two different rhythms. The VA categorizes bank transactions almost daily, keeping the queue empty. Thomas reconciles, fixes mistakes, and handles anything that needs a judgment call — weekly-ish, or whenever Triage raises a flag. Both work inside the same page: <strong>Bookkeeping</strong>, reached from the sidebar.
      </P>

      <HR />

      {/* How money gets here */}
      <H2>How a transaction becomes a journal entry</H2>
      <P>Every dollar in the ledger arrives one of two ways.</P>
      <SourceFlow />
      <P>
        <strong>Dual-write</strong> (top row) — Happy Cuts already knows the amount and the category the moment a mow is marked paid, so it posts itself. Nothing to review, ever.
      </P>
      <P>
        <strong>Bank feed</strong> (bottom row) — every other dollar. A transaction syncs in from the bank, sits in <strong>Unreviewed</strong> until it's categorized, then posts as a real journal entry.
      </P>

      <H3>Does it need a human?</H3>
      <P>Not every bank transaction needs a click. Once a vendor has been categorized the same way twice, the system trusts the pattern:</P>
      <AutoPostDecision />
      <P>This is why the Unreviewed list shrinks over time even on entities with heavy card use — recurring vendors (gas stations, the same supplier) stop showing up after the second correct categorization.</P>

      <HR />

      {/* VA SECTION */}
      <H2 id="va">For the VA — daily routine</H2>
      <P>Goal: keep <strong>Unreviewed</strong> at zero without ever guessing. A skipped transaction costs nothing. A wrong category costs Thomas time later to find and fix.</P>

      <H3>1. Check Triage first</H3>
      <P>Two cards can show up under Bookkeeping:</P>
      <GuideTable
        headers={['Card', 'What it means', 'What you do']}
        rows={[
          ['🔴 Bank connection reconnected', 'The bank feed lost its connection — nothing new is syncing', "Flag it for Thomas. Reconnecting needs a fresh Setup Token — that's his call, not yours."],
          ['🟡/⚪ N bank transactions categorized', 'Transactions have been sitting in Unreviewed for a few days', 'This is your queue — tap Open, it drops you straight into Bookkeeping.'],
        ]}
      />

      <H3>2. Pick the entity</H3>
      <P>At the top of the Bookkeeping page, tap the pill for the business you're working on — <strong>Happy Cuts LLC</strong> or <strong>East Meadow Consulting LLC</strong>. The whole page (balances, entries, Unreviewed list) switches to that entity.</P>

      <H3>3. Work the Unreviewed list</H3>
      <P>Scroll to <strong>Bank Feed → Unreviewed transactions</strong>. For each one:</P>
      <CategorizeDecision />
      <Steps items={[
        'Read the description and amount — most bank descriptions are ugly (all-caps, store codes), but the amount and date are real signal.',
        'If a ⭐ starred suggestion is shown and it matches what the purchase was actually for, tap it.',
        'No suggestion, or the suggestion looks wrong? Use the dropdown and pick the account yourself.',
        "Genuinely can't tell what it was for? Leave it in Unreviewed. Don't pick the closest-sounding category just to clear the list.",
      ]} />
      <Warn>Fuel purchases: Happy Cuts has two fuel accounts — <strong>Fuel - Equipment (non-ethanol)</strong> for mower/trimmer gas, <strong>Fuel - Vehicle</strong> for the truck. If you don't know which, leave it.</Warn>

      <H3>4. Attach a receipt (optional, only when it helps)</H3>
      <P>Already-categorized entries can carry a linked receipt from Documents. Open the entry, tap <strong>Attach Receipt</strong>, then for each candidate shown:</P>
      <Steps items={[
        'Tap it to preview — you\'ll see a thumbnail, the summary, and a guessed dollar amount.',
        'Compare that guessed amount to the transaction amount at the top of the entry.',
        'Only tap "Attach this receipt" if the amount and date genuinely line up.',
        "Amount shows in red / doesn't match, or you're not sure? Don't attach it — tap Cancel instead. An unattached receipt is fine; a wrong one attached to the wrong transaction is confusing later.",
      ]} />

      <H3>5. Know when you're done</H3>
      <Tip>Unreviewed transactions list is empty — or everything still there is genuinely ambiguous and you've flagged it. That's a clean session.</Tip>

      <Stop>
        Never touch: <strong>Void</strong>, <strong>Record Distribution</strong>, recategorizing an entry that's already correct just because you're not sure, or pasting a new bank Setup Token. Those are Thomas's calls — flag it and move on.
      </Stop>

      <HR />

      {/* THOMAS SECTION */}
      <H2 id="admin">For Thomas — periodic review</H2>
      <P>Goal: catch what the VA correctly flagged, correct anything mis-booked, and keep the bank feed itself healthy. This is a weekly-ish pass, or reactive whenever Triage surfaces something.</P>

      <H3>1. Clear Triage first</H3>
      <GuideTable
        headers={['Card', 'What you do']}
        rows={[
          ['🔴 Bank connection reconnected', 'Bank Feed panel → get a fresh Setup Token from SimpleFin → paste it in → Connect. Re-map any account it asks about.'],
          ['🟡/⚪ N bank transactions categorized', "Usually means the VA hasn't run their routine recently, or hit a batch of ambiguous ones — work the Unreviewed list yourself, or check in with them."],
        ]}
      />

      <H3>2. Spot-check what got categorized</H3>
      <P>Expand a handful of entries badged <strong>Auto · Bank Feed</strong> or <strong>Auto · Bank Feed · Learned</strong> in the Journal Entries list. Confirm the account makes sense for the amount and memo.</P>
      <P>Found a wrong one? Expand it → <strong>Wrong category?</strong> → pick the correct account. The old entry is voided and a corrected one posts automatically — no manual cleanup needed.</P>

      <H3>3. Reconcile against the real bank</H3>
      <P>The <strong>"Does this match the bank?"</strong> panel at the top of the page:</P>
      <GuideTable
        headers={['Bank feed connected to Cash?', 'What you see', 'What to do']}
        rows={[
          ['Yes', 'Checked automatically — statement balance vs. ledger balance shown live', 'If the two numbers differ, something is missing or duplicated. Scan recent entries for a gap.'],
          ['No', 'A manual "$ ___ Check" field', 'Type the current balance from online banking, tap Check.'],
        ]}
      />

      <H3>4. Record an owner distribution</H3>
      <P>Whenever cash leaves the business outside the bank feed — a cash payment kept personally, a manual transfer out — tap <strong>Record Distribution</strong> at the top of the page and log the amount, date, and memo. This posts Dr Owner's Draws / Cr Cash directly; it never comes through the bank feed.</P>

      <H3>5. Void an entry</H3>
      <P>Only for something genuinely wrong or duplicated — not for a recategorization (use "Wrong category?" for that). Voiding marks the entry void (it stays visible, drops out of every report) and, if it came from the bank feed, frees the underlying transaction back into Unreviewed so it can be posted correctly.</P>

      <H3>6. Spot-check receipts</H3>
      <P>Skim a few entries the VA attached receipts to — open the receipt link, confirm it's genuinely the right document. This is mostly a trust check once the VA's routine is established, not a per-transaction audit.</P>

      <HR />

      {/* Reference */}
      <H2>Reference — badges you'll see</H2>
      <GuideTable
        headers={['Badge', 'Meaning']}
        rows={[
          ['Auto · Schedule / Crew', 'Posted by Happy Cuts the moment a mow or crew payout was recorded — no bank feed involved.'],
          ['Auto · Bank Feed', 'A bank transaction categorized by a human (VA or Thomas) through the Unreviewed list.'],
          ['Auto · Bank Feed · Learned', 'A bank transaction auto-posted with zero clicks, because that vendor was confirmed 2+ times before.'],
          ['Manual', 'Typed directly into Bookkeeping via New Entry — no source transaction to recategorize against.'],
        ]}
      />

      <HR />

      <H2>Troubleshooting</H2>
      <H3>The dropdown doesn't have the account I need</H3>
      <P>Chart of accounts is per-entity and set up in advance. Flag it for Thomas rather than picking the closest match — a new account code can be added in a couple minutes.</P>

      <H3>I categorized something wrong</H3>
      <P>If it's still today, VA can reopen it via "Wrong category?" the same as Thomas — recategorizing is always available on bank-feed entries, no need to void first.</P>

      <H3>The receipt picker shows nothing</H3>
      <P>Candidates are limited to Documents within 5 days of the transaction date. If the receipt was scanned much later or the date on it is off, it won't show up — that's expected, not a bug.</P>

      <H3>Bank balance won't match no matter what</H3>
      <P>Check for a transaction that synced but never got categorized (still sitting in Unreviewed), or a manual entry that duplicates something the bank feed also posted. Both throw off the match by the same amount as the missing/duplicate line.</P>

      <div className="mt-10 text-xs text-gray-400 text-center">
        Bookkeeping · Phase 2 · August 2026
      </div>
    </div>
  )
}
