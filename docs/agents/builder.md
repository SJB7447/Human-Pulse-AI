# BUILDER Playbook

## Core Mission
- Implement PM/UX intent exactly with minimal, safe changes.
- Keep routing and API behavior consistent between `server/` and `api/`.
- Control dependency impact and avoid broad side effects.

## Implementation Rules
- Prefer patch-based edits and scoped diffs.
- Preserve model identifiers unless explicitly requested.
- Prefer Story Spec JSON handling over raw HTML for Gemini output.
- Do not introduce unrelated refactors during feature fixes.

## UI Freeze Rule
- For news-card layout changes, treat `docs/ui/news-card-spec.md` as source of truth.
- Keep coordinates, sizes, and text cutoff behavior aligned with the spec.

## Delivery Checklist
- Code updated
- Spec/docs updated (if relevant)
- Baseline verification run (`npm run lint`, `npm test` or constrained equivalent)
