# S0-3 Encoding and Copy Quality Gate (2026-02-13)

## Goal
- Block user-visible text corruption (mojibake) before release.
- Define repeatable checks for detection, correction, and regression control.

## Scope
- `client/src/**/*.tsx`, `client/src/**/*.ts`
- `server/**/*.ts` files that return user-facing text
- `docs/**/*.md` for operational/user guidance

## Detection Rules
1. Replacement character check
- Command: `rg -n -P "\\x{FFFD}" client/src server docs -g "*.tsx" -g "*.ts" -g "*.md"`
- Pass criteria: `0` results

2. Han-script contamination check (manual triage allowed)
- Command: `rg -n -P "\\p{Han}" client/src -g "*.tsx" -g "*.ts"`
- Pass criteria:
  - Regex-only cases are allowed
  - Any Han-script character in UI labels/toasts/buttons must be reviewed

3. Locale-key coverage check (AUTH + shared)
- Command: `rg -n "toast\\(|placeholder=|TabsTrigger|<Button|<Label" client/src/pages/login.tsx client/src/components/Header.tsx`
- Pass criteria: AUTH/shared strings are rendered via locale map keys

## Correction Rules
1. Save edited files as UTF-8.
2. Prefer locale map keys (for example `COPY`) over page-local hardcoded text.
3. Do not guess unreadable text; rewrite from functional context.
4. For heavily corrupted files, prefer full-file UTF-8 rewrite over partial patching.

## Manual QA Checklist
1. Auth Landing
- KR/EN toggle updates title/description/CTA without broken text.

2. Login/Signup
- OTP messages, error toasts, role labels, and buttons render correctly.

3. Shared Header
- Navigation and auth actions render correctly in both locales.

4. News Detail and Journalist
- Modal labels, toasts, and section headings show no corruption.
- If corruption is found, register file as S0-3 follow-up cleanup.

## Current Scan Summary
- Replacement character direct check: no findings in current scan.
- Han-script scan: one regex punctuation finding in `client/src/components/NewsDetailModal.tsx`.
- Browser-level visual QA is still required due terminal encoding ambiguity.

## Definition of Done
- Detection command logs recorded.
- Manual checklist completed for in-scope pages.
- No new encoding/copy corruption introduced in PR review.
