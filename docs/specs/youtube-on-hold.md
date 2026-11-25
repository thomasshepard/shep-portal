# YouTube page: "On hold" runner state, and "Last check-in" wording

Branch: `fix/youtube-on-hold` (already checked out). Do not commit, push or merge; Claude reviews and commits. No new packages, env vars, Supabase or Airtable schema changes (the Airtable choice is added separately).

## Why

A video can be parked on purpose: the PC runner must leave it alone until Thomas releases it. Today Kennecott sits with Runner Status `Failed`, so the portal shows a red "Runner stopped at Render video" task and counts it under "Stopped · need a retry". It is not an error. Airtable's Video Ideas table (`tblFMKKJ0plUZrx7L`) field Runner Status (`fldczhfQhXfm6EYoj`, single select) gets a new choice `On hold`. The runner skips any video whose Runner Status is `On hold`.

## Changes

1. `src/lib/youtube.js`
   - Export `const ON_HOLD = 'On hold'` and a helper `isOnHold(v)` (`v.runnerStatus === ON_HOLD`).
   - `buildTasks`: an on-hold video produces no tasks at all (no retry, claims, photos, approve or start tasks), so it never shows as something wanting a person.
2. `src/components/youtube/TodayView.jsx`
   - The "Stopped" tile counts only `Failed`, never on-hold videos (it already filters on `Failed`; keep it that way).
   - Add a fourth tile or a small gray line under the tiles: `N on hold` (gray, neutral tone), only when N > 0. Keep the grid tidy on a phone (if a 4th tile breaks the 3-column grid, use the gray line instead).
   - In the per-video list (around the `' · stopped'` text), on-hold videos show ` · on hold` in gray.
   - Change the wording `Last checked in ${...}` to `Last check-in ${...}` (keep the date/time format).
3. `src/components/youtube/BoardView.jsx`
   - `DOT['On hold'] = 'bg-gray-400'`.
   - The card badge shows `On hold` in gray (`bg-gray-100 text-gray-600` or similar) instead of any red "Stopped" text, and on-hold cards are not styled as alerts.
4. `src/components/youtube/VideoSheet.jsx`
   - `waitingOn(v)`: first check: on hold returns `{ who: 'none', text: 'On hold. The PC leaves this one alone until you take it off hold.' }`.
   - Add a gray card (same layout as the red Failed card, but `border-gray-200 bg-gray-50`, text gray, a `PauseCircle` icon from lucide-react) when on hold: title `On hold`, optional `lastError` line in small gray text, and a button `Take off hold` that calls `onWriteVideo({ [F.videos.runnerStatus]: 'Idle', [F.videos.retry]: false }, 'Taken off hold')`. Under the button, small gray text: `The PC picks it up on its next pass.`
   - The Failed card, the Running card and the "Next step" card must not show while on hold (the next-step condition becomes `!== 'Failed' && !== 'Running' && !isOnHold(v)`).
5. Anywhere else under `src/` that treats `runnerStatus === 'Failed'` as an alert (search for it), make sure an on-hold video is not shown as failed or as needing a retry.

## Done when

- `npm run build` succeeds.
- `npx eslint` on every file you changed shows no new problems compared with before your change (the repo has 115 old lint problems; do not fix unrelated ones).
- Write a short summary of files changed.
