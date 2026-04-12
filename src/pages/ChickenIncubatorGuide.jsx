import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'

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

function TimelineItem({ label, border, highlight, children }) {
  return (
    <div className={`border-l-4 ${border} pl-4 py-2 ${highlight ? 'bg-amber-50/50 rounded-r-lg -ml-px' : ''}`}>
      <p className={`font-semibold text-gray-800 mb-1 ${highlight ? 'text-amber-800' : ''}`}>{label}</p>
      <div className="text-sm text-gray-600 space-y-1">{children}</div>
    </div>
  )
}

function TroubleshootCard({ problem, cause, fix }) {
  return (
    <div className="border-l-4 border-red-400 bg-red-50 rounded-r-lg p-3">
      <p className="font-medium text-gray-800 text-sm">{problem}</p>
      <p className="text-xs text-gray-500 mt-0.5"><strong>Cause:</strong> {cause}</p>
      <p className="text-xs text-gray-600 mt-0.5"><strong>Fix:</strong> {fix}</p>
    </div>
  )
}

// ── Main Guide ───────────────────────────────────────────────────────────────

export default function ChickenIncubatorGuide() {
  const navigate = useNavigate()
  const { toggle, isOpen } = useAccordion()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/chickens')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ChevronLeft size={16} /> Back to Chickens
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Incubator Guide</h1>
        <p className="text-sm text-gray-500 mt-1">MeeF 28-Egg Incubator &middot; Chicken Hatch Cycle</p>
      </div>

      {/* Section 1 — Why Use This Tracker (always visible) */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-amber-900">Why Use This Tracker?</h2>
        <p className="text-sm text-amber-800 leading-relaxed">
          Hatching eggs is exciting — but a lot can go wrong silently over 21 days. This tracker gives you a record of every batch so you can spot patterns, improve over time, and never miss a critical window like Day 7 candling or Day 18 lockdown.
        </p>
        <ul className="space-y-1.5 text-sm text-amber-800">
          <li className="flex gap-2"><span>✅</span><span><strong>Know exactly where you are</strong> in the 21-day cycle every time you open the app</span></li>
          <li className="flex gap-2"><span>✅</span><span><strong>Never miss a candle day</strong> — the app flags Day 7 and Day 14 automatically</span></li>
          <li className="flex gap-2"><span>✅</span><span><strong>Track what works</strong> — see hatch rates by rooster, batch, and season over time</span></li>
          <li className="flex gap-2"><span>✅</span><span><strong>Photo documentation</strong> — attach photos of each batch to compare egg colors and shell quality</span></li>
          <li className="flex gap-2"><span>✅</span><span><strong>Catch problems early</strong> — candling data reveals fertility issues before they become expensive</span></li>
          <li className="flex gap-2"><span>✅</span><span><strong>Simple record-keeping</strong> — one place for everything, accessible from your phone at the incubator</span></li>
        </ul>
      </div>

      {/* Section 2 — Your Incubator at a Glance */}
      <Section id="specs" title="2 · Your Incubator at a Glance" toggle={toggle} isOpen={isOpen}>
        <h4 className="font-medium text-gray-800 mt-3 mb-2">MeeF 28-Egg Incubator</h4>
        <GuideTable
          headers={['Feature', 'Detail']}
          rows={[
            ['Capacity', '28 chicken eggs'],
            ['Auto egg turning', 'Automatic rotation on timer'],
            ['Humidity control', 'Ultrasonic atomizing humidifier'],
            ['Display', 'Digital LED — temp + humidity'],
            ['Egg tray types', 'Chicken, duck, goose'],
          ]}
        />
        <h4 className="font-medium text-gray-800 mt-4 mb-2">Quick Reference</h4>
        <div className="bg-gray-900 text-amber-400 font-mono rounded-xl p-4 text-xs leading-relaxed space-y-1">
          <p>DAYS 1-18&nbsp;&nbsp;&nbsp;99-99.5°F &middot; 45-55% RH &middot; Auto-flip ON</p>
          <p>DAY 7&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Candle — remove clears and quitters</p>
          <p>DAY 14&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Candle — remove late quitters</p>
          <p>DAY 18&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;LOCKDOWN — flip OFF &middot; humidity → 65-70% &middot; lid CLOSED</p>
          <p>DAYS 19-21&nbsp;Watch for pip — don't assist for 24 hrs after external pip</p>
          <p>POST-HATCH&nbsp;Leave in incubator until fluffy &middot; move to 95°F brooder</p>
        </div>
      </Section>

      {/* Section 3 — Setting Up a New Batch */}
      <Section id="setup" title="3 · Setting Up a New Batch" toggle={toggle} isOpen={isOpen}>
        <div className="space-y-5 mt-3">
          <StepItem num={1} title="Prep the incubator">
            <ul className="list-disc list-inside space-y-1">
              <li>Run the incubator empty for 24 hours before adding eggs</li>
              <li>Confirm temp holds at 99-99.5°F — verify with a second thermometer if unsure (budget units often read 1-2° off)</li>
              <li>Confirm humidity holds at 45-55% RH</li>
              <li>Fill the water reservoir before powering on</li>
              <li>Verify the auto-flip is rotating (watch the tray after powering on)</li>
              <li>Place on a stable, level surface away from drafts and direct sunlight</li>
            </ul>
          </StepItem>

          <StepItem num={2} title="Prep your eggs">
            <ul className="list-disc list-inside space-y-1">
              <li>Use eggs under 7 days old for best fertility</li>
              <li>Label each egg with a pencil only (markers off-gas and can harm embryos)</li>
              <li>Write the set date and an ID (E01, E02...) on each egg</li>
              <li>Optional: mark X on one side, O on the other to verify manual turning if needed</li>
            </ul>
          </StepItem>

          <StepItem num={3} title="Set eggs in the tracker">
            <ul className="list-disc list-inside space-y-1">
              <li>Tap <strong>+ New Batch</strong> in the Incubator tab</li>
              <li>Add a photo of your eggs (recommended — useful for reference later)</li>
              <li>Enter your rooster's name</li>
              <li>Set the date</li>
              <li>Enter egg counts by color</li>
              <li>Tap <strong>Add Batch</strong> — the app calculates your expected hatch date automatically (Set Date + 21 days)</li>
            </ul>
          </StepItem>

          <StepItem num={4} title="Daily routine">
            <ul className="list-disc list-inside space-y-1">
              <li>Check temp and humidity display each day</li>
              <li>Refill the water reservoir daily — the atomizer needs it</li>
              <li>Don't open the lid unless necessary during days 1-17</li>
            </ul>
          </StepItem>
        </div>
      </Section>

      {/* Section 4 — The 21-Day Timeline */}
      <Section id="timeline" title="4 · The 21-Day Timeline" toggle={toggle} isOpen={isOpen}>
        <div className="space-y-3 mt-3">
          <TimelineItem label="Days 1-6 · Early Development" border="border-yellow-400">
            <p>Embryo begins forming. Veins start developing. Keep temp and humidity stable. Check water level daily. Do not open lid unnecessarily.</p>
          </TimelineItem>

          <TimelineItem label="Day 7 · First Candle" border="border-amber-500" highlight>
            <p className="text-amber-700 text-xs font-medium mb-1">The app will flag this day automatically on your batch card.</p>
            <p>Candle each egg in a dark room with a bright flashlight or dedicated candler.</p>
            <ul className="space-y-1 mt-1">
              <li>✅ <strong>Developing:</strong> Dark spot with radiating veins, possible slight movement</li>
              <li>⚠️ <strong>Quitter:</strong> Blood ring visible, no veins, or dark mass with no structure</li>
              <li>❌ <strong>Clear:</strong> No development — likely infertile</li>
            </ul>
            <p className="mt-1 font-medium">Remove quitters and clears immediately. They will rot and can contaminate the incubator, killing healthy eggs nearby.</p>
            <p className="mt-1">Log your results: tap the batch card → Log Day 7 Results → enter how many are developing.</p>
          </TimelineItem>

          <TimelineItem label="Days 8-13 · Active Growth" border="border-orange-400">
            <p>Embryo grows rapidly. Veins become more prominent. Continue monitoring temp, humidity, and water level.</p>
          </TimelineItem>

          <TimelineItem label="Day 14 · Second Candle" border="border-amber-500" highlight>
            <p className="text-amber-700 text-xs font-medium mb-1">The app will flag this day automatically on your batch card.</p>
            <ul className="space-y-1">
              <li>✅ <strong>Developing:</strong> Most of the interior is dark (embryo), clear air cell at the wide end</li>
              <li>⚠️ <strong>Late Quitter:</strong> Dark mass, no visible movement, air cell hard to define</li>
            </ul>
            <p className="mt-1">📏 <strong>Air cell size as humidity check:</strong></p>
            <ul className="ml-4 space-y-0.5">
              <li>Air cell too small → humidity too high</li>
              <li>Air cell too large → humidity too low</li>
            </ul>
            <p className="mt-1">Remove any non-developers. Log results in the app.</p>
          </TimelineItem>

          <TimelineItem label="Days 15-17 · Pre-Lockdown" border="border-orange-500">
            <p>Embryo fills most of the egg. Begin prepping for lockdown. Start refilling water more aggressively to prep for the humidity bump on Day 18.</p>
          </TimelineItem>

          <TimelineItem label="Day 18 · LOCKDOWN" border="border-red-500" highlight>
            <p className="text-amber-700 text-xs font-medium mb-1">The app shows a lockdown checklist on this day.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Move eggs from turning tray to flat hatch tray (lay on side)</li>
              <li>Turn off auto-flip or remove eggs from turner</li>
              <li>Bump humidity to <strong>65-70% RH</strong></li>
              <li>Fill water reservoir fully</li>
              <li><strong>Do not open the lid again until hatch is complete</strong></li>
            </ul>
          </TimelineItem>

          <TimelineItem label="Days 19-20 · Internal Pip" border="border-red-400">
            <p>Chick breaks through the air cell membrane internally. You may hear faint chirping through the shell. Do not assist yet.</p>
          </TimelineItem>

          <TimelineItem label="Day 21 · External Pip and Hatch" border="border-green-500">
            <p>Chick breaks through the shell (external pip). Once pipped, the chick will zip (rotate and crack the shell in a circle) and emerge.</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Allow <strong>12-24 hours</strong> from pip to hatch — do not rush it</li>
              <li>If no progress after 24 hours from external pip, assess before assisting</li>
            </ul>
          </TimelineItem>

          <TimelineItem label="Post-Hatch" border="border-green-400">
            <p>Leave chicks in the incubator until fully dry and fluffy (12-24 hours). They absorb the yolk sac during this time and do not need food or water immediately. Move to a brooder set at 95°F once fluffy and active.</p>
          </TimelineItem>
        </div>
      </Section>

      {/* Section 5 — Brooder Temperature Schedule */}
      <Section id="brooder" title="5 · Brooder Temperature Schedule" toggle={toggle} isOpen={isOpen}>
        <GuideTable
          headers={['Week', 'Brooder Temp']}
          rows={[
            ['Week 1', '95°F'],
            ['Week 2', '90°F'],
            ['Week 3', '85°F'],
            ['Week 4', '80°F'],
            ['Week 5+', 'Reduce 5°F/week until fully feathered'],
          ]}
        />
        <Tip>Chicks that huddle under the heat source are too cold. Chicks that spread to the edges and pant are too hot. Active, spread-out chicks are just right.</Tip>
      </Section>

      {/* Section 6 — Reading Your Hatch Rates */}
      <Section id="rates" title="6 · Reading Your Hatch Rates" toggle={toggle} isOpen={isOpen}>
        <h4 className="font-medium text-gray-800 mt-3 mb-2">The three numbers</h4>
        <ul className="space-y-1.5 mb-3">
          <li><strong>Fertility Rate</strong> = Fertile at Day 7 ÷ Total Set — tells you about your rooster coverage</li>
          <li><strong>Hatch Rate</strong> = Hatched ÷ Fertile — tells you about your incubation quality</li>
          <li><strong>Overall Rate</strong> = Hatched ÷ Total Set — your bottom line</li>
        </ul>

        <h4 className="font-medium text-gray-800 mb-2">Benchmarks</h4>
        <GuideTable
          headers={['Rate', 'What It Means']}
          rows={[
            ['85-95%', 'Excellent — strong flock fertility, good incubation'],
            ['70-84%', 'Good — normal for small flocks'],
            ['50-69%', 'Investigate — rooster coverage, egg storage, or incubator issue'],
            ['Below 50%', 'Problem — check all variables systematically'],
          ]}
        />

        <h4 className="font-medium text-gray-800 mt-3 mb-2">What to do if rates are low</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Low fertility rate → check rooster-to-hen ratio, rooster health, hen age</li>
          <li>Good fertility but poor hatch rate → incubation issue (temp, humidity, turner)</li>
          <li>Declining rates over time → track by rooster in batch notes to isolate the variable</li>
        </ul>
      </Section>

      {/* Section 7 — Troubleshooting */}
      <Section id="troubleshoot" title="7 · Troubleshooting" toggle={toggle} isOpen={isOpen}>
        <div className="space-y-2 mt-3">
          <TroubleshootCard problem="Low hatch rate overall" cause="Temp too high or too low" fix="Calibrate with a second thermometer" />
          <TroubleshootCard problem="Chicks die in shell (pipped but can't hatch)" cause="Humidity too low at lockdown" fix="Bump to 65-70% on Day 18" />
          <TroubleshootCard problem="Eggs don't develop at all" cause="Infertile eggs or dead embryo from bad storage" fix="Check rooster coverage; use fresh eggs under 7 days old" />
          <TroubleshootCard problem="Humidity won't hold" cause="Low water level or atomizer issue" fix="Fill reservoir daily; check atomizer is misting" />
          <TroubleshootCard problem="Temp spikes" cause="Draft or direct sunlight" fix="Move incubator away from windows and vents" />
          <TroubleshootCard problem="Chick shrink-wrapped in shell" cause="Humidity dropped during lockdown" fix="Never open lid during lockdown — even once drops humidity fast" />
          <TroubleshootCard problem="Rotten egg in incubator" cause="Missed quitter at candling" fix="Candle diligently on Day 7 and Day 14 — when in doubt, remove" />
          <TroubleshootCard problem="Blood ring at Day 7" cause="Early embryo death" fix="Usually caused by temp fluctuation in first 3 days or old eggs" />
          <TroubleshootCard problem="Chick alive but weak at hatch" cause="Assisted hatch or nutritional issue" fix="Note in batch — separate from flock initially, assess" />
        </div>
        <div className="mt-3">
          <Tip><strong>Tip:</strong> If you're seeing consistent problems, check one variable at a time. Change temp OR humidity OR egg source — not all three at once. Your batch notes in the tracker are your best diagnostic tool.</Tip>
        </div>
      </Section>

      {/* Section 8 — Tips for Better Hatch Rates */}
      <Section id="tips" title="8 · Tips for Better Hatch Rates" toggle={toggle} isOpen={isOpen}>
        <ul className="space-y-4 mt-3">
          <li>
            <p className="font-medium">🥚 Egg quality matters more than anything</p>
            <p className="text-gray-600 mt-0.5">Use the freshest eggs possible — under 7 days old from collection. Store pointed end down at 55-65°F if you're accumulating a batch over several days. Don't wash eggs before setting.</p>
          </li>
          <li>
            <p className="font-medium">🌡️ Calibrate your thermometer</p>
            <p className="text-gray-600 mt-0.5">Budget incubator displays often read 1-2°F off. A $10 digital thermometer placed inside for 24 hours before your first hatch tells you if you need to offset your target.</p>
          </li>
          <li>
            <p className="font-medium">💧 Humidity is harder to nail than temp</p>
            <p className="text-gray-600 mt-0.5">Most first-time hatchers run too high. Aim for the lower end of 45-55% in incubation. Your Day 14 air cell size is your humidity report card — look it up when candling.</p>
          </li>
          <li>
            <p className="font-medium">🔄 Don't open the lid</p>
            <p className="text-gray-600 mt-0.5">Every lid opening during lockdown drops humidity fast and can shrink-wrap chicks. Resist the urge.</p>
          </li>
          <li>
            <p className="font-medium">📅 Track by rooster</p>
            <p className="text-gray-600 mt-0.5">If you have multiple roosters, track which one sired each batch. Fertility rate differences between batches often trace back to a specific rooster.</p>
          </li>
          <li>
            <p className="font-medium">🕯️ Candle confidently</p>
            <p className="text-gray-600 mt-0.5">A quitter left in the incubator can explode and contaminate every other egg. When in doubt, candle again the next day — development becomes obvious by Day 10.</p>
          </li>
          <li>
            <p className="font-medium">📸 Photo every batch</p>
            <p className="text-gray-600 mt-0.5">The photos you add in the tracker tell you a lot over time — shell quality, egg size variation, color distribution from different hens. The habit pays off after 3-4 batches.</p>
          </li>
        </ul>
      </Section>

      {/* Section 9 — Using This Tracker Effectively */}
      <Section id="usage" title="9 · Using This Tracker Effectively" toggle={toggle} isOpen={isOpen}>
        <h4 className="font-medium text-gray-800 mt-3 mb-2">When to open the app</h4>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li>When you set eggs → create the batch immediately</li>
          <li>Day 7 → app will remind you; log candle results right after</li>
          <li>Day 14 → same</li>
          <li>Day 18 → run through the lockdown checklist in the app</li>
          <li>After hatch → record your results while the chicks are still drying</li>
        </ul>

        <h4 className="font-medium text-gray-800 mb-2">Making the most of your batch notes</h4>
        <p className="mb-3">Use the notes field to capture anything unusual — a power outage, a humidity spike, a heat wave, which specific hens the eggs came from. These details are invisible in the numbers but explain everything when you're trying to figure out why one batch did better than another.</p>

        <h4 className="font-medium text-gray-800 mb-2">Sharing access</h4>
        <p>The tracker is shared with Gabrielle — she can log candle results and hatch outcomes too. Whoever is at the incubator can update it directly.</p>
      </Section>

      {/* Footer spacer */}
      <div className="h-8" />
    </div>
  )
}
