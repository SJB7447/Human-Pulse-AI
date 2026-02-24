# Role Playbooks (PM/UX/BUILDER/QA)

## Purpose
- Keep AGENTS compact while preserving role-specific execution detail.
- Reduce ambiguity by selecting a role playbook per task.

## Source Priority
1. `AGENTS.md` (global policy and safety)
2. This folder (`docs/agents/*.md`)
3. Task-specific user instructions

## Role Selection Guide
- Planning/scope/acceptance clarity: `pm.md`
- Layout/interaction/readability/responsive: `ux.md`
- Implementation/code change delivery: `builder.md`
- Regression/risk/testing validation: `qa.md`

## Invocation
- Use request tags to prioritize a role:
  - `[PM]`, `[UX]`, `[BUILDER]`, `[QA]`
- If no tag is provided, default flow is:
1. BUILDER
2. QA

## Handoff Rule
- Any UI geometry change must update:
1. `docs/ui/news-card-spec.md`
2. implementation code
3. verification evidence (test notes/snapshot log)
