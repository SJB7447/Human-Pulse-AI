# Backup & Recovery Runbook (S6-2)

## Goal
- Define repeatable backup and recovery procedure for Human Pulse AI operations.
- Ensure team can execute restore drill with clear evidence.

## Scope
- Database: Supabase Postgres (`news_items`, `article_reviews`, `reports`, `admin_action_logs`, `user_consents`, `users`).
- App config: env keys, schedule settings, operational docs.
- Out of scope: full infra image backup.

## RPO / RTO Target
- RPO (data loss allowance): `<= 24h`
- RTO (service recovery allowance): `<= 2h`

## Backup Policy
1. Daily logical backup (recommended: UTC 02:00)
2. Weekly full export archive (Sun)
3. Pre-release on-demand backup (before deployment)
4. Retention
- Daily: 14 days
- Weekly: 8 weeks
- Pre-release snapshot: per release tag, keep 3 latest

## Backup Procedure
1. DB logical dump (choose one path)
- Path A (Supabase dashboard): run managed backup/export from project dashboard.
- Path B (CLI): execute team-approved dump command in secured operator machine.
2. Verify artifact integrity
- Check file exists, non-zero size, timestamp.
- Compute checksum (`sha256`) and store with dump file.
3. Store evidence
- Record run in `ops log` with:
  - date/time (UTC)
  - operator
  - backup type (daily/weekly/pre-release)
  - artifact path
  - checksum
  - result (PASS/FAIL)

## Recovery Procedure
1. Incident triage
- Determine restore point (timestamp/tag) and blast radius.
- Pause write-heavy jobs (news fetch/export schedule) if needed.
2. Restore to staging first
- Import selected backup into staging DB.
- Run smoke checks:
  - article list query
  - admin review query
  - report workflow query
  - action log query
3. Production restore
- Run approved restore on production DB.
- Re-apply latest required migrations if schema drift exists.
4. Post-restore validation
- API health:
  - `GET /api/articles?all=true`
  - `GET /api/admin/stats`
  - `GET /api/admin/reviews`
  - `GET /api/admin/action-logs?limit=20`
- App smoke:
  - Admin hide/publish
  - Report status transition
  - Export manual run

## Restore Drill (Monthly)
1. Select latest weekly backup.
2. Restore into staging.
3. Execute validation checklist (above).
4. Record drill evidence:
- start/end time
- pass/fail per check
- issues and workaround
- estimated RTO

## Security Rules
1. Backup artifacts must be access-restricted (operators only).
2. Never commit dump files or secrets to git.
3. Encrypt backups at rest where possible.
4. Store env keys in secure secret manager, not in docs.

## Run Log Template
| Date (UTC) | Operator | Type | Artifact | Checksum | Restore Tested | Result | Notes |
|---|---|---|---|---|---|---|---|
| 2026-02-13 | TBD | Pre-release | TBD | TBD | No | PASS | Initial runbook established |

## Verification for S6-2
- Runbook created
- RPO/RTO defined
- Backup + recovery + drill checklist documented
