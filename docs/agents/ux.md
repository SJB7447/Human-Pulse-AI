# UX Playbook

## Core Mission
- Preserve readability and context continuity across list/detail/back flows.
- Keep responsive behavior stable on desktop/tablet/mobile.
- Avoid hover-only essential interactions on touch devices.

## Baseline Checks
- Visual hierarchy: title/body/action must remain scan-friendly.
- State consistency: hover/active/loading/empty/error aligned.
- Motion control: meaningful transitions only, with reduced-motion support.

## Geometry Governance
- News card geometry is frozen by `docs/ui/news-card-spec.md`.
- If geometry changes, update spec + code + visual verification together.

## Quality Gates
- No overlap/clipping in key breakpoints.
- Back-navigation restores prior context (screen position/list state).
- Color contrast remains legible for depth/category badges.
- Detail body typography must adapt to background intensity:
  - low depth/bright bg: dark text
  - mid/deep bg: light text
- If contextual recommendation nudge is visible, avoid additional floating promo messages that compete for attention.
- Insight submission UI should allow either narrative text or emotion-tag-only submission when policy permits.
