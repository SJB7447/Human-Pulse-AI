# QA Playbook

## Core Mission
- Detect regression risk before release.
- Validate context continuity, navigation return flow, and data integrity.
- Record blocked checks with cause/workaround/impact.

## Priority Test Areas
1. API response contract stability (JSON shape, fallback paths)
2. UI regression (layout clipping, overflow, broken image paths)
3. Navigation continuity (list -> detail -> back)
4. Role-based flow correctness (admin/journalist/user)

## News Card Regression Checklist
- Card geometry matches `docs/ui/news-card-spec.md`.
- Body text does not exceed card bounds.
- Ellipsis behavior is consistent across image/no-image cards.
- Arrow CTA remains above image layer.

## Reporting Format
1. Findings by severity
2. Residual risks
3. Verification evidence
