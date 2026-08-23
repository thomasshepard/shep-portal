// Backlog Inbox grooming — client-side Claude call, same shape as documentLinks.js.
// Classifies a raw one-liner idea into Kind/Category/Effort/Value + a fleshed-out
// description, so the Groom view has something to pre-fill instead of a blank form.

const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

export const KIND_OPTIONS = ['Build', 'Do', 'Decide / Research']
export const CATEGORY_OPTIONS = ['Operations', 'Real Estate', 'Happy Cuts', 'Homestead', 'Personal', 'Technical', 'Finance', 'Infrastructure']
export const EFFORT_OPTIONS = ['S', 'M', 'L', 'XL']

/**
 * Calls Claude to classify + flesh out a raw captured idea.
 * Returns { kind, category, effort, value, description, buildPrompt, checkInDate }
 * (any field may be null), or null on any failure — never throws. Grooming is an
 * assist, not a blocker: callers should fall back to an empty editable form.
 */
export async function groomBacklogIdea(rawText) {
  if (!ANTH_KEY || !rawText?.trim()) return null

  const system = `You groom a raw, half-formed idea captured into a personal/business dev backlog into a structured card. Return ONLY JSON, no markdown, no preamble. Shape:
{"kind":string|null,"category":string|null,"effort":string|null,"value":number|null,"description":string,"buildPrompt":string|null,"checkInDate":"YYYY-MM-DD"|null}
"kind" must be exactly one of this list, or null if genuinely unclear: ${JSON.stringify(KIND_OPTIONS)}. "Build" means a feature to add to this software portal. "Do" means a one-off task/errand (e.g. an admin action, a phone call, a purchase) that doesn't belong on a dev backlog. "Decide / Research" means it needs a decision or investigation before it's actionable either way.
"category" must be exactly one of this list, or null: ${JSON.stringify(CATEGORY_OPTIONS)}.
"effort" must be exactly one of this list, or null: ${JSON.stringify(EFFORT_OPTIONS)}.
"value" is an integer 1-5, or null.
"description" is a fleshed-out 2-4 sentence expansion -- what it is, why it matters. Never leave it empty; if the raw text is too sparse to expand meaningfully, restate it clearly instead of inventing details.
"buildPrompt" is a concrete implementation-ready prompt ONLY if kind is "Build" -- otherwise null.
"checkInDate" is a suggested YYYY-MM-DD date ONLY if kind is "Decide / Research" (typically 7-14 days from today) -- otherwise null.
Never invent a value outside the given lists -- use null if unsure.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTH_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: rawText }],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    let text = json?.content?.[0]?.text || '{}'
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(text)

    return {
      kind:        KIND_OPTIONS.includes(parsed.kind) ? parsed.kind : null,
      category:    CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : null,
      effort:      EFFORT_OPTIONS.includes(parsed.effort) ? parsed.effort : null,
      value:       Number.isInteger(parsed.value) && parsed.value >= 1 && parsed.value <= 5 ? parsed.value : null,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      buildPrompt: typeof parsed.buildPrompt === 'string' ? parsed.buildPrompt : null,
      checkInDate: typeof parsed.checkInDate === 'string' ? parsed.checkInDate : null,
    }
  } catch {
    return null
  }
}
