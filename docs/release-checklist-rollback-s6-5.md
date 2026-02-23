# Release Checklist & Rollback Plan (S6-5)

## Goal
- Define a repeatable release gate and rollback sequence for Human Pulse AI.
- Ensure release can be approved with objective PASS/FAIL evidence.

## Scope
- App: `client/`, `server/`, `api/`
- DB migrations already applied in production candidate scope:
  - `migrations/004_add_user_consents.sql`
  - `migrations/005_add_admin_action_logs.sql`
  - `migrations/006_add_report_workflow_columns.sql`
- Ops docs dependency:
  - `docs/backup-recovery-runbook-s6-2.md`
  - `docs/ops-audit-regression-s5-6.md`

## Release Readiness Checklist (Pre-Deploy)
1. Code quality gate
- [ ] `npm run typecheck` PASS
- [ ] `npm run lint` PASS
- [ ] `npm test` PASS
- [ ] `npm run test:ops-admin` PASS
- [ ] `npm run test:ops-alert` PASS

2. Functional smoke gate (manual)
- [ ] Admin hide/publish reflects in News/Emotion list
- [ ] Admin issue add/edit/delete persists after refresh
- [ ] Admin report status transition (`reported -> in_review -> resolved`) works
- [ ] Export manual run records history
- [ ] Hue Bot basic chat response/fallback works

3. Data and migration gate
- [ ] Required migrations are applied in target DB
- [ ] No schema drift against `shared/schema.ts` for modified entities
- [ ] Backup snapshot created before deploy (per S6-2 runbook)

4. Performance gate (S6-4 follow-up)
- [ ] Initial route load is stable after lazy-loading changes
- [ ] Admin page export actions dynamically load libraries without runtime error
- [ ] News detail interactive renderer lazy-loads without blank/freeze

## Deployment Procedure (Standard)
1. Freeze window
- Announce release window and temporary admin operation caution.

2. Pre-deploy backup
- Execute pre-release snapshot according to `docs/backup-recovery-runbook-s6-2.md`.
- Record timestamp, operator, artifact, checksum.

3. Deploy
- Deploy backend/API first, then frontend.
- Keep old release artifact reference available for immediate revert.

4. Post-deploy verification (15-30 min)
- API:
  - `GET /api/articles?all=true`
  - `GET /api/admin/stats`
  - `GET /api/admin/action-logs?limit=20`
  - `GET /api/admin/alerts/summary`
- UI:
  - Home load
  - Emotion list load
  - Admin dashboard load + hide/publish action
  - Export schedule panel load

## Rollback Trigger Criteria
- P0 functional failure (login blocked, admin actions fail, main news unavailable)
- Sustained critical alert spike after deploy (failure rate/latency/AI error)
- Data integrity risk detected (missing writes, malformed status transitions)

## Rollback Plan
1. Stop impact expansion
- Pause high-write operations (scheduled exports/fetch jobs if required).

2. App rollback
- Revert to previous known-good app release artifact.
- Confirm route and API compatibility with current DB schema.

3. Data rollback decision
- If only app regression: keep DB as-is.
- If data corruption risk: execute restore from pre-release snapshot following `docs/backup-recovery-runbook-s6-2.md`.

4. Verification after rollback
- Re-run API smoke endpoints
- Validate admin critical actions (hide/publish/review/report status)
- Confirm alerts stabilize

5. Incident record
- Record root cause, impacted window, workaround, final fix owner.

## Release Evidence Template
| Date (UTC) | Release Tag | Operator | Quality Gate | Smoke Gate | Backup ID | Result | Notes |
|---|---|---|---|---|---|---|---|
| 2026-02-13 | TBD | TBD | PASS | PASS | TBD | READY | S6-5 checklist established |

## Verification Log (This Sprint)
- 2026-02-13: `npm run typecheck` PASS
- 2026-02-13: `npm run lint` PASS
- 2026-02-13: `npm test` PASS
- 2026-02-13: Ops scripts are available for release gate
  - `npm run test:ops-admin`
  - `npm run test:ops-alert`
