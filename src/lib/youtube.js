// YouTube pipeline — Airtable config and shared helpers.
//
// Every field is addressed by ID when written (names drift, IDs don't), and
// read back by name, which is how airtableFetch returns records. The one
// config block below is the only place IDs live: the PC runner keeps its own
// copy of the same map in runner/src/config.js, so change both together.
//
// Base: "YouTube Pipeline" appFuesAtBoOkMMB1. Reached through airtable-proxy,
// which gates it on can_view_youtube (see supabase/functions/airtable-proxy).

export const YT_BASE_ID = 'appFuesAtBoOkMMB1'

export const T = {
  videos: 'tblFMKKJ0plUZrx7L',
  outliers: 'tbleqYZI4xMo6miFs',
  sources: 'tblnjv0I4A23DzV8H',
  series: 'tblEFB3l7HO6kiXBl',
  claims: 'tbl60NkL6r20YdJxF',
  costs: 'tblm4tPfIhHIq3OMP',
  runner: 'tblVgYZVOc68YVPzf',
}

// Field IDs for writes. Reads use the names in the comment on each line.
export const F = {
  videos: {
    subject: 'fldGocgq1wAP6GfBp',          // Town
    stage: 'fldRZQVJh6PRwRqN3',            // Stage
    state: 'fldWETNzh7CRUZBVA',            // State
    company: 'fldfWvMr0EsklCPFY',          // Company
    angle: 'fldioSANOtwjbDf3r',            // Subject Angle
    series: 'fldnDQJFqlIqaiwQh',           // Series
    titleOptions: 'fldPHgyzdLsGQ8n7j',     // Title Options
    finalTitle: 'flddLRJRfMtfS1c66',       // Final Title
    hook: 'fldHjZ4hMEDO9c39v',             // Hook (first 30 sec)
    priority: 'fldgx4jSccnhGDW2a',         // Priority
    scriptLink: 'fldsaEGZu826UtDWQ',       // Script Link
    script: 'fld98gPUC24yj4m3B',           // Script
    briefClaude: 'fldSuDL6qM5LWNZPO',      // Brief (Claude)
    briefNeon: 'fldnhJQPICzJLXjTQ',        // Brief (Neon)
    researchClaude: 'fldGsHBpkc8phhoyb',   // Research (Claude)
    researchNeon: 'flddj2rZYDMkFoFwT',     // Research (Neon)
    briefWinner: 'fldCu4lag42jQOVUX',      // Brief Winner
    judgeNotes: 'fldIV605ZweC95UP4',       // Judge Notes
    youtubeUrl: 'fld9n8w6PkgP7KD7w',       // YouTube URL
    youtubeId: 'fldZzJV1mzp09Nl70',        // YouTube Video ID
    privacy: 'fldEhdY5ljJJqDtJW',          // Privacy Status
    publishDate: 'fldLYnSQu15xErusy',      // Publish Date
    goLiveAt: 'fldSRGcrAEmB1pYac',         // Go Live At
    approved: 'fldCEDcu97p8oNn1u',         // Approved to Publish
    approvedAt: 'fldMZbXudCiFWWOkQ',       // Approved At
    views7: 'fldq3IBpp5L4C3WzQ',           // Views (7 day)
    ctr: 'fldQiKrTIlmNpvm5E',              // CTR %
    avd: 'fldxY0jVPZpNcP2YC',              // Avg View Duration
    thumbnail: 'fldCRjc2EBPpbKn8O',        // Thumbnail
    videoFile: 'fldL8thcExbnijuhw',        // Video File Link
    runFolder: 'fldJkNTDE3rCKIlTF',        // Run Folder
    runnerStatus: 'fldczhfQhXfm6EYoj',     // Runner Status
    runnerStep: 'fld9EQucU7LuKlNfl',       // Runner Step
    runnerProgress: 'fldDZ7pUnPAyTdg1r',   // Runner Progress
    runnerLog: 'fld3vgH9mdThmYuyQ',        // Runner Log
    lastError: 'fldBKb2HMrm5tDpxw',        // Last Error
    retry: 'fld4KgijEeQs7B7Ug',            // Retry Requested
    stageChanged: 'fldHaAfOUvzk5NdrA',     // Stage Changed
    daysInStage: 'fldk2c4xQ7Ksg3RyF',      // Days in Stage
    reviewMinutes: 'fldVJf7FIHJ8PWnnG',    // Review Minutes
    audioLength: 'fldiweFmvXHPcCnbl',      // Audio Length
    renderMinutes: 'fld9gHwDknen6Fssh',    // Render Minutes
    aiCost: 'fldhqaO5jb53g5Y0V',           // AI Cost
    openClaims: 'fld1JM9kJv0Xg7l6i',       // Open Claims
    photosToCheck: 'fldyIgXIouEVYMPZe',    // Photos To Check
    health: 'fld72mdHTfb0D41gz',           // Health
    publishedThisWeek: 'fldzxAGU4ayVtVb8Z',// Published This Week
    inspiredBy: 'fldUTgdl23z0AZm9S',       // Inspired By
    sources: 'fldXDM3YaqjA6snmd',          // Sources & Photos
    notes: 'fldlzPq5NHUtL0WoP',            // Notes
  },
  sources: {
    item: 'fldN7Rw2eXN8mrPVn',             // Item
    kind: 'fld67pMhiLboJN1Kt',             // Kind
    url: 'fldyztsxkc3AGveDD',              // URL
    archive: 'fld82jdXNZCNGydZ0',          // Archive
    rights: 'fldkIq9vdUxzsJkD9',           // Rights
    rightsStatement: 'fldul2b5QdERUhl6e',  // Rights Statement
    approved: 'fldnFT4DvmUZcAE5Q',         // Approved
    removed: 'fldcHxfE0jK3b1NXq',          // Removed
    image: 'fldH6ZQAPlRCfXgtH',            // Image
    credit: 'fldwjmFmiZG2oiyAR',           // Credit Line
    notes: 'fldyAyHCORH6mEhnS',            // Notes
    video: 'fldttc9J2W1xqYRg0',            // Video Ideas
  },
  series: {
    name: 'fldeyAcnHdDyrgEjQ',             // Name
    active: 'fldsTN1mY4JrTv8dN',           // Active
    scriptParts: 'fld2kKS4BCBitAMDV',      // Script Parts
    researchPrompt: 'fldmm1NBydALQZWKs',   // Research Prompt
    scriptPrompt: 'fld2TQ3RZh4E3RcQT',     // Script Prompt
    titleStyle: 'fldWQnc9uAdjiESnW',       // Title Style
    targetMinutes: 'fldhSMLHUxDJvUmKQ',    // Target Minutes
    voice: 'fldjF1sLS4g8DiEDZ',            // Voice
    look: 'fldgEXwpt4avBmxQs',             // Look
    perWeek: 'fldovrAXRQhSR2igb',          // Uploads per Week
    privacy: 'fldPpp3Bb5Rjg40QF',          // Default Privacy
    color: 'fldAglN7ITsjzZ6Io',            // Color
    notes: 'fldr3ntE8c67qgQL3',            // Notes
  },
  claims: {
    claim: 'flduJBHKHevcxf0ei',            // Claim
    video: 'fldiUESPuzGIsgeV5',            // Video
    why: 'fldH6swPgJCZ5UAwo',              // Why Flagged
    fix: 'fldvoAMpbiW20cUni',              // Suggested Fix
    sourceUrl: 'fldGyuYU2jUHIMFtB',        // Source URL
    severity: 'fldgbTeTaYrnYzd7z',         // Severity
    decision: 'fldaazMCDHRkR7uHv',         // Decision
    decidedBy: 'fldp67IJHCqjH3UFL',        // Decided By
    decidedAt: 'fldTaIhi0fAcMwuDm',        // Decided At
    applied: 'fld4vWZYCNo5ojv9b',          // Applied
  },
  costs: {
    entry: 'fldkke97ZJCmyxJao',            // Entry
    video: 'fldFUeR6KFD1upJMS',            // Video
    step: 'flds1IizHdDasVSZR',             // Step
    provider: 'fldn5ju3mt9meDPt5',         // Provider
    model: 'fld5bG4nxtafJivMr',            // Model
    inputTokens: 'fld5fMPzpHYQ28AW7',      // Input Tokens
    outputTokens: 'fldSmUnHl28L9ZrWt',     // Output Tokens
    searches: 'fldfxCjPBtemxaCoi',         // Web Searches
    cost: 'fldSQXglJFiF0ZsIf',             // Cost USD
    runAt: 'fldIq1qZOFhvGF4nU',            // Run At
  },
  runner: {
    name: 'fld2SKjCZcL3d0JDI',             // Name
    lastSeen: 'fld2MvDV1nxL50saf',         // Last Seen
    paused: 'fld4eoLGxAbuj9jrt',           // Paused
    currentJob: 'fldaoUuEwnncjX5Hl',       // Current Job
    monthlyCap: 'fldD4z9CwPV8vXCRv',       // Monthly Cap USD
    perVideoCap: 'fldI83SOp4IjMnswe',      // Per Video Cap USD
    version: 'fldpeRDygVU1Cd8la',          // Version
    notes: 'fldsezPVKCNw400aG',            // Notes
  },
}

// Stage names exactly as the Airtable single-select holds them. "VA Review"
// predates the one-person setup and is not renamed (the Airtable API can't add
// or rename select choices), so the UI shows it as "Review".
export const STAGES = [
  { key: 'Idea', label: 'Idea' },
  { key: 'Researching', label: 'Researching' },
  { key: 'Scripting', label: 'Scripting' },
  { key: 'VA Review', label: 'Review' },
  { key: 'Voiced', label: 'Voiced' },
  { key: 'Editing', label: 'Editing' },
  { key: 'Ready to Approve', label: 'Ready to Approve' },
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'Published', label: 'Published' },
]

export const stageLabel = (k) => STAGES.find(s => s.key === k)?.label || k || 'Idea'
export const stageIndex = (k) => Math.max(0, STAGES.findIndex(s => s.key === k))

// The 15 steps, in order. `who` is who does it: 'ai' runs on the PC without
// you, 'you' needs a person. The page relabels 'you' as "VA" when the helper
// view is on, which is a preview only — it changes no data.
export const STEPS = [
  { n: 1, label: 'Find outliers', who: 'you', stage: 'Idea' },
  { n: 2, label: 'Pick the subject', who: 'you', stage: 'Idea' },
  { n: 3, label: 'Research briefs', who: 'ai', stage: 'Researching' },
  { n: 4, label: 'Pick the better brief', who: 'ai', stage: 'Researching' },
  { n: 5, label: 'Write script', who: 'ai', stage: 'Scripting' },
  { n: 6, label: 'Titles and thumbnail', who: 'ai', stage: 'Scripting' },
  { n: 7, label: 'Fact check', who: 'ai', stage: 'Scripting' },
  { n: 8, label: 'Review flagged claims', who: 'you', stage: 'VA Review' },
  { n: 9, label: 'Pull photos', who: 'ai', stage: 'VA Review' },
  { n: 10, label: 'Approve photos', who: 'you', stage: 'VA Review' },
  { n: 11, label: 'Voice', who: 'ai', stage: 'Voiced' },
  { n: 12, label: 'Render video', who: 'ai', stage: 'Editing' },
  { n: 13, label: 'Approve to publish', who: 'you', stage: 'Ready to Approve' },
  { n: 14, label: 'Upload', who: 'ai', stage: 'Scheduled' },
  { n: 15, label: 'Day 7 stats', who: 'ai', stage: 'Published' },
]

export const SEVERITIES = ['High', 'Medium', 'Low']
export const DECISIONS = ['Keep', 'Use fix', 'Cut']
export const VA_RATE = 3.5

// ── safe accessors (per-page style, as the rest of the portal does it) ──────
export const safeStr = (v, fallback = '') => {
  if (v == null || v === '') return fallback
  if (Array.isArray(v)) return v.length ? safeStr(v[0], fallback) : fallback
  if (typeof v === 'object') return v.name ? String(v.name) : fallback
  return String(v)
}
export const safeNum = (v, fallback = 0) => {
  if (v == null || typeof v === 'object') return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}
export const arr = v => (Array.isArray(v) ? v : [])

export function fmtMoney(v) {
  const n = safeNum(v, 0)
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtMinutes(seconds) {
  const s = safeNum(seconds, 0)
  if (!s) return '—'
  const m = Math.round(s / 60)
  return `${m} min`
}

/** Turns an Airtable record into the flat shape the page works with. */
export function toVideo(rec, seriesById = {}) {
  const f = rec.fields || {}
  const seriesId = arr(f['Series'])[0]
  const series = seriesId ? seriesById[seriesId] : null
  return {
    id: rec.id,
    subject: safeStr(f['Town'], 'Untitled'),
    title: safeStr(f['Final Title'], ''),
    titleOptions: safeStr(f['Title Options'], ''),
    hook: safeStr(f['Hook (first 30 sec)'], ''),
    stage: safeStr(f['Stage'], 'Idea'),
    state: safeStr(f['State'], ''),
    company: safeStr(f['Company'], ''),
    angle: safeStr(f['Subject Angle'], ''),
    seriesId: seriesId || null,
    series,
    priority: safeStr(f['Priority'], ''),
    scriptLink: safeStr(f['Script Link'], ''),
    hasScript: !!safeStr(f['Script'], ''),
    briefWinner: safeStr(f['Brief Winner'], ''),
    judgeNotes: safeStr(f['Judge Notes'], ''),
    hasBriefClaude: !!(safeStr(f['Research (Claude)'], '') || safeStr(f['Brief (Claude)'], '')),
    hasBriefNeon: !!(safeStr(f['Research (Neon)'], '') || safeStr(f['Brief (Neon)'], '')),
    youtubeUrl: safeStr(f['YouTube URL'], ''),
    youtubeId: safeStr(f['YouTube Video ID'], ''),
    privacy: safeStr(f['Privacy Status'], ''),
    publishDate: safeStr(f['Publish Date'], ''),
    goLiveAt: safeStr(f['Go Live At'], ''),
    approved: f['Approved to Publish'] === true,
    approvedAt: safeStr(f['Approved At'], ''),
    views7: f['Views (7 day)'] == null ? null : safeNum(f['Views (7 day)']),
    ctr: f['CTR %'] == null ? null : safeNum(f['CTR %']),
    avd: f['Avg View Duration'] == null ? null : safeNum(f['Avg View Duration']),
    thumbnail: arr(f['Thumbnail'])[0]?.url || '',
    videoFile: safeStr(f['Video File Link'], ''),
    runFolder: safeStr(f['Run Folder'], ''),
    runnerStatus: safeStr(f['Runner Status'], 'Idle'),
    runnerStep: safeStr(f['Runner Step'], ''),
    runnerProgress: safeNum(f['Runner Progress'], 0),
    runnerLog: safeStr(f['Runner Log'], ''),
    lastError: safeStr(f['Last Error'], ''),
    retry: f['Retry Requested'] === true,
    daysInStage: safeNum(f['Days in Stage'], 0),
    reviewMinutes: safeNum(f['Review Minutes'], 0),
    audioLength: safeNum(f['Audio Length'], 0),
    renderMinutes: safeNum(f['Render Minutes'], 0),
    aiCost: safeNum(f['AI Cost'], 0),
    openClaims: safeNum(f['Open Claims'], 0),
    photosToCheck: safeNum(f['Photos To Check'], 0),
    health: safeStr(f['Health'], ''),
    publishedThisWeek: safeNum(f['Published This Week'], 0),
  }
}

export function toSeries(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    name: safeStr(f['Name'], 'Series'),
    active: f['Active'] !== false,
    color: safeStr(f['Color'], '#2563eb'),
    voice: safeStr(f['Voice'], ''),
    look: safeStr(f['Look'], ''),
    perWeek: safeNum(f['Uploads per Week'], 1),
    targetMinutes: safeNum(f['Target Minutes'], 0),
    privacy: safeStr(f['Default Privacy'], 'private'),
    scriptParts: safeStr(f['Script Parts'], ''),
    titleStyle: safeStr(f['Title Style'], ''),
    notes: safeStr(f['Notes'], ''),
  }
}

export function toClaim(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    claim: safeStr(f['Claim'], ''),
    videoId: arr(f['Video'])[0] || null,
    why: safeStr(f['Why Flagged'], ''),
    fix: safeStr(f['Suggested Fix'], ''),
    sourceUrl: safeStr(f['Source URL'], ''),
    severity: safeStr(f['Severity'], 'Medium'),
    decision: safeStr(f['Decision'], ''),
    applied: f['Applied'] === true,
  }
}

export function toPhoto(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    item: safeStr(f['Item'], 'Untitled'),
    kind: safeStr(f['Kind'], ''),
    url: safeStr(f['URL'], ''),
    archive: safeStr(f['Archive'], ''),
    rights: safeStr(f['Rights'], ''),
    rightsStatement: safeStr(f['Rights Statement'], ''),
    credit: safeStr(f['Credit Line'], ''),
    approved: f['Approved'] === true,
    removed: f['Removed'] === true,
    image: arr(f['Image'])[0]?.url || '',
    videoId: arr(f['Video Ideas'])[0] || null,
  }
}

export function toOutlier(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    title: safeStr(f['Video Title'], ''),
    url: safeStr(f['URL'], ''),
    channel: safeStr(f['Channel'], ''),
    subs: safeNum(f['Channel Subs'], 0),
    views: safeNum(f['Views'], 0),
    length: safeStr(f['Length'], ''),
    uploaded: safeStr(f['Upload Date'], ''),
    topicType: safeStr(f['Topic Type'], ''),
    takeaway: safeStr(f['Takeaway'], ''),
    multiple: safeNum(f['Multiple'], 0),
    found: safeStr(f['Date Found'], ''),
  }
}

export function toCost(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    videoId: arr(f['Video'])[0] || null,
    step: safeStr(f['Step'], ''),
    provider: safeStr(f['Provider'], ''),
    model: safeStr(f['Model'], ''),
    cost: safeNum(f['Cost USD'], 0),
    runAt: safeStr(f['Run At'], ''),
  }
}

export function toRunner(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    name: safeStr(f['Name'], 'PC'),
    lastSeen: safeStr(f['Last Seen'], ''),
    paused: f['Paused'] === true,
    currentJob: safeStr(f['Current Job'], ''),
    monthlyCap: safeNum(f['Monthly Cap USD'], 0),
    perVideoCap: safeNum(f['Per Video Cap USD'], 0),
    version: safeStr(f['Version'], ''),
  }
}

/** The runner counts as on when it checked in within the last 10 minutes. */
export function runnerState(runner) {
  if (!runner) return 'off'
  const seen = runner.lastSeen ? new Date(runner.lastSeen).getTime() : 0
  const fresh = seen && Date.now() - seen < 10 * 60 * 1000
  if (!fresh) return 'off'
  return runner.paused ? 'paused' : 'on'
}

/** One line per thing that wants a person, nearest deadline first. */
export function buildTasks(videos) {
  const tasks = []
  for (const v of videos) {
    if (v.stage === 'Ready to Approve' && !v.approved) {
      tasks.push({ kind: 'approve', video: v, label: 'Approve to publish', weight: 1 })
    }
    if (v.runnerStatus === 'Failed') {
      tasks.push({ kind: 'retry', video: v, label: `Runner stopped at ${v.runnerStep || 'a step'}`, weight: 2 })
    }
    if (v.openClaims > 0) {
      tasks.push({ kind: 'claims', video: v, label: `${v.openClaims} claim${v.openClaims === 1 ? '' : 's'} to decide`, weight: 3 })
    }
    if (v.photosToCheck > 0) {
      tasks.push({ kind: 'photos', video: v, label: `${v.photosToCheck} photo${v.photosToCheck === 1 ? '' : 's'} to check`, weight: 4 })
    }
    if (v.stage === 'Scheduled' && v.privacy && v.privacy !== 'public') {
      tasks.push({ kind: 'makepublic', video: v, label: 'Make public in YouTube Studio', weight: 5 })
    }
    if (v.stage === 'Published' && v.views7 != null && v.ctr == null) {
      tasks.push({ kind: 'ctr', video: v, label: 'Add CTR from Studio', weight: 6 })
    }
    if (v.stage === 'Idea' && v.runnerStatus === 'Idle') {
      tasks.push({ kind: 'start', video: v, label: 'Start research', weight: 7 })
    }
  }
  return tasks.sort((a, b) => a.weight - b.weight)
}

export function weekStart(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

/** Videos published in the current week, against the series goal. */
export function paceThisWeek(videos, seriesList) {
  const start = weekStart()
  const out = videos.filter(v => {
    if (!v.publishDate) return false
    const d = new Date(v.publishDate + 'T00:00:00')
    return d >= start
  }).length
  const goal = seriesList.filter(s => s.active).reduce((n, s) => n + (s.perWeek || 0), 0)
  return { out, goal }
}

export function monthSpend(costs) {
  const now = new Date()
  return costs.reduce((sum, c) => {
    if (!c.runAt) return sum
    const d = new Date(c.runAt)
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return sum
    return sum + c.cost
  }, 0)
}

export function previewUrlFor(photo) {
  if (photo.image) return photo.image
  if (photo.url) {
    const match = photo.url.match(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:(.+)$/)
    if (match) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${match[1]}?width=480`
    }
  }
  return ''
}
