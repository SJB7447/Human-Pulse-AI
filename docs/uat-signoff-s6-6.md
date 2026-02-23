# UAT & Release Sign-off (S6-6)

## Goal
- Complete UAT approval for release candidate and finalize sign-off decision.
- Record residual issues with priority agreement.

## Input Artifacts
- `docs/sprint-task-breakdown-2026-02-13.md`
- `docs/release-checklist-rollback-s6-5.md`
- `docs/backup-recovery-runbook-s6-2.md`
- `docs/ops-audit-regression-s5-6.md`
- `docs/regression-cases-admin-news.md`

## UAT Scope
1. Core user flow
- Home -> Emotion list -> News detail -> return flow
- Hue Bot open/chat/fallback

2. Admin flow
- Hide/publish status reflection
- Review complete/reopen
- Issue add/edit/delete
- Report workflow transition
- Export run + history visibility

3. Ops flow
- Alert summary/alerts list visibility
- Action log traceability for admin actions

## UAT Execution Checklist
1. Functional
- [ ] News list/detail/return context continuity PASS
- [ ] Hidden article not exposed in public list PASS
- [ ] Admin issue CRUD persists after refresh PASS
- [ ] Report status workflow PASS
- [ ] Export manual run/history PASS

2. Quality
- [ ] `npm run typecheck` PASS
- [ ] `npm run lint` PASS
- [ ] `npm test` PASS
- [ ] `npm run test:ops-admin` PASS
- [ ] `npm run test:ops-alert` PASS

3. Ops readiness
- [ ] Pre-release backup evidence recorded
- [ ] Rollback trigger/owner confirmed
- [ ] Release communication window confirmed

## Sign-off Decision Rule
- APPROVED:
  - P0 blocker = 0
  - UAT critical path PASS
  - Rollback owner and procedure confirmed
- CONDITIONAL:
  - No P0, limited P1 with clear mitigation and due date
- REJECTED:
  - Any P0 failure or data-integrity uncertainty

## Residual Issue Agreement
| ID | Issue | Priority | Owner | Target Date | Mitigation |
|---|---|---|---|---|---|
| R-001 | TBD | P2 | TBD | TBD | TBD |

## Sign-off Record
| Date (UTC) | Candidate | PM | QA | Tech Lead | Decision | Notes |
|---|---|---|---|---|---|---|
| 2026-02-13 | RC-TBD | TBD | TBD | TBD | APPROVED (Template) | S6-6 sign-off template established |

## Verification Log (Current Session)
- 2026-02-13: Sprint 6 deliverables documented (S6-1 ~ S6-5).
- 2026-02-13: S6-6 UAT/sign-off criteria and evidence template created.
