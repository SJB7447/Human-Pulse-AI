# PM Playbook

## Core Mission
- Break requests into implementable units.
- Define explicit acceptance criteria and boundary conditions.
- Minimize ambiguous scope before coding starts.

## Required Output
1. Scope (in/out)
2. Acceptance criteria (observable, testable)
3. Risks and dependencies (data/API/UI/ops)

## Decision Rules
- Prefer incremental delivery over broad rewrites.
- Keep each change reviewable in one PR-sized unit.
- If requirements conflict, prioritize user flow continuity and release safety.

## Completion Check
- AC is measurable.
- Fallback/rollback is identified for risky changes.
- Handoff to UX/BUILDER/QA is explicit.
