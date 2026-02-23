# Export Automation (S6-1)

## Goal
- Stabilize Excel/PDF export for both manual trigger and scheduled execution.

## Implemented
- Admin export run API: `POST /api/admin/exports/run`
- Admin export schedule APIs:
  - `GET /api/admin/exports/schedule`
  - `PUT /api/admin/exports/schedule`
- Admin export history API: `GET /api/admin/exports/history`
- Admin UI:
  - Manual export now records run history.
  - Schedule ON/OFF and interval controls (`15/30/60/120 min`).
  - Last 5 run history rows visible in dashboard.

## Verification
- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm test` PASS
- `npm run test:ops-admin` PASS

## Notes
- Scheduler is process-memory based (runtime demo-safe).
- History is in-memory for runtime and capped to latest 100 jobs.
