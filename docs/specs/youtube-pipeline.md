# YouTube pipeline

What is built, how it hangs together, and what is left. The page is at
`/youtube` behind `can_view_youtube`. The runner that does the work lives
outside this repository, because it holds API keys.

## Why it exists

One person makes two documentary videos a week with AI doing the research,
the script, the voice and the edit. The work needs somewhere to be watched
from a phone, and somewhere to answer the four questions only a person can
answer: which subject, which flagged claims are wrong, which photographs to
use, and whether this video goes out.

It is built for one person working alone, with a helper possible later. Nothing
assumes a VA exists; the owner of every step is you until a helper is given
the flag.

## Airtable

Base `appFuesAtBoOkMMB1`, "YouTube Pipeline". Every ID lives in one config
block in `src/lib/youtube.js`, mirrored in the runner's `src/config.js`.
Change both together.

| Table | ID | Holds |
| --- | --- | --- |
| Video Ideas | `tblFMKKJ0plUZrx7L` | one row per video, start to finish |
| Series | `tblEFB3l7HO6kiXBl` | one row per series: prompts, voice, look, pace, privacy |
| Outlier Research | `tbleqYZI4xMo6miFs` | small-channel videos that overperformed |
| Sources & Photos | `tblnjv0I4A23DzV8H` | each photograph with its rights |
| Flagged Claims | `tbl60NkL6r20YdJxF` | what the fact check could not source |
| Cost Log | `tblm4tPfIhHIq3OMP` | one row per model call, with its cost |
| Runner | `tblVgYZVOc68YVPzf` | the PC: last seen, paused, caps |

The stage select holds `Idea`, `Researching`, `Scripting`, `VA Review`,
`Voiced`, `Editing`, `Ready to Approve`, `Scheduled`, `Published`, `Dropped`.
`VA Review` predates the one-person setup; the Airtable API cannot rename a
select choice, so the UI shows it as "Review" and the stored value stays as it
is. Writes use `typecast: true`, which is how `Ready to Approve` was created.

`Town` is the primary field and is used as the subject of any series, not only
a town. `Subject Angle` carries the one-line angle for a series that is not
about towns; Company Towns can keep using `Company`.

## The portal page

`src/pages/YouTube.jsx`, with its views in `src/components/youtube/`. One
series filter and six tabs.

- **Today.** The runner card (on, paused, off, with Pause and Resume), three
  tiles (out this week against the series goal, stopped, stuck seven days or
  more), then the list of what wants a person, nearest first: approve, retry,
  claims, photos, make public in Studio, add CTR, start research. Then
  everything in flight.
- **Board.** The nine stages, each row showing what it is waiting on and what
  it has cost.
- **Photos.** Each photograph with its rights badge and a tick or a cross.
  Filtered to the ones still to check by default.
- **Claims.** What the fact check flagged, with Keep, Use fix or Cut.
- **Pace.** Published per week by series colour, AI spend this month against
  the cap, cost per video split into AI and time at $3.50 an hour, which
  researcher keeps winning, and the last video's numbers.
- **Outliers.** The research list, sorted by multiple, each with "Make it an
  idea".

The video sheet is where the work gets answered: what it is waiting on, the
run with a Retry button, the approve-to-publish panel, the claims and photos
inline, the fifteen steps, the research and titles, what it cost, the links,
and a way to move the stage by hand.

### The approve gate

The Approve button is disabled until every claim is decided, every photograph
is checked, and you have ticked that you watched it and that the title is
right. It writes `Approved to Publish`, `Approved At` and, if you set one,
`Go Live At`. The runner uploads nothing without that tick. The panel says
plainly that the upload is private either way and that going public is a step
you take in Studio.

## Access

`can_view_youtube`, a new flag:

- `supabase/migrations/20261123_add_can_view_youtube.sql` adds the column.
  Run it by hand in the SQL editor; `supabase db push` is not used here.
- `src/hooks/useAuth.jsx` adds it to `permissions`, admins implicitly.
- `src/pages/admin/AdminUsers.jsx` adds the toggle.
- `supabase/functions/airtable-proxy/index.ts` adds the base to `BASE_RULES`
  behind the flag, and the flag to `capabilities()`. Needs a redeploy.

A helper gets a member account with this flag, not the `va` role, which would
also show tenant data.

## The runner

Node 20, in its own folder. One pass picks the video nearest the end that has
work, runs one step, writes the result, stops.

| File | What it does |
| --- | --- |
| `src/index.js` | the loop, the check-in, Paused, `--once`, `--check`, `--dry` |
| `src/pipeline.js` | which step a stage calls for, and the progress writes |
| `src/config.js` | .env, the Airtable IDs, the models, the price table |
| `src/models.js` | Claude, Gemini and Grok, each returning text and usage |
| `src/prompts.js` | every prompt, with series overrides |
| `src/cost.js` | the cost log and the two caps |
| `src/steps/*.js` | research, script, applyfixes, photos, voice, render, upload |
| `remotion/` | the one video template |
| `kokoro/say.py` | reads a chunk of script to a wav, locally |

Claude calls stream and use adaptive thinking; research and the fact check
use web search. Research runs the two briefs in parallel, and one failing
does not stop the other. Nothing is written to Airtable in `--dry`.

### What is untested until the keys are in

Everything that calls a paid API or the PC's own tools: the two research
briefs, the judge, the script, the titles, the fact check, applying fixes,
Kokoro, the Remotion render, the upload and the day-7 stats. The pipeline's
decisions, the cost arithmetic, the timeline, the description, the chunking
and the JSON parsing are covered by 17 tests that need no keys.

## Still to do

- Run the migration, redeploy the proxy, fill `.env`, sign in to YouTube once.
- A thumbnail image: the titles step writes the idea, nothing draws it yet.
  Either a Canva template by hand or a `thumbnail.png` in the run folder,
  which the upload will then set.
- Hand off the research and script prompts to whichever model keeps winning,
  after ten videos, and drop the loser.
- `src/pages/YouTube.jsx` has one `react-hooks/set-state-in-effect` lint
  error, which is how the other sixteen pages in this repo load their data.

## Conventions this followed

Work on a feature branch. No new packages, env vars or Supabase changes
beyond the migration and the proxy entry above. Field IDs on writes, names on
reads. Per-page safe accessors rather than a shared helper. `npm run build`
passes.
