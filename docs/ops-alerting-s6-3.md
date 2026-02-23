# Ops Alerting (S6-3)

## Goal
- Provide threshold-based operational alerts for:
  - API failure rate
  - API latency (p95)
  - AI endpoint 5xx errors

## Implemented
- Server alert monitor in `server/routes.ts`
  - request metrics window tracking
  - threshold evaluation (10-min window)
  - cooldown dedupe (5 min per alert type)
  - alert → admin action log linkage (`ops_alert`)
- Admin alert APIs
  - `GET /api/admin/alerts`
  - `GET /api/admin/alerts/summary`
  - `POST /api/admin/alerts/test`
- Admin dashboard section
  - summary cards (failure rate/p95/AI errors/alert count)
  - recent alerts list
  - test alert trigger button

## Thresholds
- Failure rate alert: `>= 20%` in last 10 min (`critical` if `>= 35%`)
- p95 latency alert: `>= 1500ms` in last 10 min (`critical` if `>= 3000ms`)
- AI error alert: AI 5xx `>= 3` in last 10 min (`critical` if `>= 6`)

## Verification
- `npm run test:ops-alert` PASS
- `npm run test:ops-admin` PASS
- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm test` PASS
