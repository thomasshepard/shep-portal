# GEMINI.md

Read this file, then read `./CLAUDE.md` in full before doing anything. It has the project architecture, Airtable rules and env vars. `memory.md` does not exist in this repo yet; ignore it.

This file is read by Gemini CLI and by Antigravity CLI (`agy`).

## Rules for Gemini / agy

- Specs to build live in `docs/specs/`. Build them exactly as written, one step at a time.
- Always work on a feature branch. Never push to `main` (pushing to `main` deploys the live site). Never merge.
- No new npm packages, env vars, API keys, Supabase changes, or Airtable schema changes unless the spec says so.
- Airtable writes use field IDs with `typecast: true`. Reads come back keyed by field name.
- Run `npm run build` and `npm run lint` before saying a step is done.
- Commit after each step.
- If something is unclear, or a done-test fails twice, stop and ask.
- When finished, write a short summary of files changed and test results for Claude to review.
