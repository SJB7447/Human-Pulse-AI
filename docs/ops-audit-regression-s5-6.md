# Ops Audit Regression (S5-6)

## Goal
- Validate operator scenarios from Sprint 5 and ensure audit log coverage has no missing actions.
- Scope: hide/publish, review complete/reopen, issue add, report create, report status workflow.

## Runner
- Command: `npm run test:ops-admin`
- Optional env: `AI_BASE_URL=http://localhost:5000`

## Cases
| ID | Endpoint(s) | Focus | Expected |
|---|---|---|---|
| OPS-01 | `/api/articles?all=true` | baseline data | article exists for flow |
| OPS-02 | `PUT /api/articles/:id` | hide | status 200 |
| OPS-03 | `PUT /api/articles/:id` | publish | status 200 |
| OPS-04 | `PUT /api/admin/reviews/:id` | review complete | status 200 |
| OPS-05 | `PUT /api/admin/reviews/:id` | review reopen | status 200 |
| OPS-06 | `POST /api/admin/reviews/:id/issues` | issue add | status 200 |
| OPS-07 | `POST /api/admin/reports` | report create | status 201 |
| OPS-08 | `PUT /api/admin/reports/:id/status` | in-review transition | status 200 |
| OPS-09 | `PUT /api/admin/reports/:id/status` | resolved transition | status 200 |
| OPS-10 | `GET /api/admin/action-logs` | audit completeness | expected actions all logged |

## Expected Audit Actions
- `hide`
- `publish`
- `review_complete`
- `review_reopen`
- `issue_add`
- `report_create`
- `report_status_update` (at least 2 events)

## Result Log
| Date | Runner | Scope | Result | Notes |
|---|---|---|---|---|
| 2026-02-13 | Codex | OPS-* | Prepared | Runner + checklist created |
| 2026-02-13 | Codex | OPS-* | BLOCKED | Initial run failed due stale dev server process; restarted and re-ran |
| 2026-02-13 | Codex | OPS-* | PASS | `npm run test:ops-admin` all cases passed, audit action coverage satisfied |
