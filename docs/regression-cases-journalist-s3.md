# Journalist Regression Cases (Sprint 3)

## Scope
- Wizard flow (`S3-1`)
- Draft snapshot/restore (`S3-2`)
- AI results hub apply/undo/retry (`S3-3`, `S3-5`)
- Publish emotion auto/manual consistency (`S3-4`)

## Cases (15)
| ID | Scenario | Steps | Expected |
|---|---|---|---|
| JR-01 | Wizard step lock | Open writer with empty form | Step 1 only unlocked |
| JR-02 | Keyword unlock | Enter keyword and run keyword analysis | Step 2 unlocked, no crash |
| JR-03 | Outline generation | Run outline generation after keyword | Step 3 unlocked, outline filled |
| JR-04 | Draft generation guard | Try generate draft before outline | Blocked with validation toast |
| JR-05 | Draft generation success | Generate draft after outline | Step 4 unlocked, content inserted |
| JR-06 | Local snapshot restore | Refresh page after editing | Keyword/outline/draft restored |
| JR-07 | Manual snapshot cap | Save snapshots 6+ times | Only latest 5 retained |
| JR-08 | Snapshot restore | Restore an old version | Editor data replaced correctly |
| JR-09 | Snapshot compare | Select compare for version | Changed line summary visible |
| JR-10 | AI title apply | Generate titles and apply selected title | Keyword/title field updated |
| JR-11 | AI hashtag partial apply | Select subset of hashtags then apply | Only selected hashtags retained |
| JR-12 | AI undo | Apply AI result then Undo | Previous state restored |
| JR-13 | Failed-step retry | Force AI failure then click retry | Same failed step reruns only |
| JR-14 | Emotion manual override | Select manual emotion, AI recommendation changes | Manual value kept, warning shown |
| JR-15 | Emotion auto publish | Switch back to auto and publish | Published emotion equals auto recommendation |

## Execution Log
| Date | Runner | ID | Result(PASS/FAIL) | Notes |
|---|---|---|---|---|
| 2026-02-13 | Codex | JR-01~JR-15 | PASS (Code-level) | `npm run lint`, `npm test` passed after S3-1~S3-5 changes |
| 2026-02-13 | Codex | JR-01~JR-15 | BLOCKED (Browser) | Interactive UI scenarios require live browser/manual QA run |
| 2026-02-13 | Codex | JR-01~JR-15 | PASS (Re-run, Automated) | Re-ran `npm run typecheck`, `npm run lint`, `npm test`; no regression detected |
| 2026-02-13 | QA-TBD | JR-01~JR-15 | TBD | Fill PASS/FAIL per case after manual browser execution |
