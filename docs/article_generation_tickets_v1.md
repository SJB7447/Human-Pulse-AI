# Article Generation Tickets v1

## T1. Prompt Layer Modularization (Completed)
- Goal: Separate article generation prompt into reusable builder module.
- Scope:
  - Add server-side prompt builder with global hard constraints + mode-specific rules.
  - Replace inline prompt string in `/api/ai/generate-draft` with builder call.
- Acceptance Criteria:
  - Existing API contract unchanged.
  - Typecheck/lint passes.
  - Prompt text is no longer hardcoded inline in route handler.

## T2. Mode Contract Hardening
- Goal: Enforce mode-level writing constraints.
- Scope:
  - Stronger quick-mode brevity constraints.
  - Longform section-depth constraints.
  - Output schema check by mode.
- Progress:
  - Added `normalizeDraftMode` and rebuilt prompt text with Korean-first constraints.
  - Added mode-aware validation gate in `/api/ai/generate-draft`.
  - Returns actionable schema failure payload with `AI_DRAFT_SCHEMA_INVALID`.
- Acceptance Criteria:
  - `draft` and `interactive-longform` produce distinct distributions.
  - Schema validation failures are surfaced with actionable errors.

## T3. Similarity Gate (Headline + Structure)
- Goal: Reduce reference resemblance risk.
- Scope:
  - Add headline overlap heuristic.
  - Add paragraph-structure similarity heuristic.
  - Add single retry with revised anti-similarity instruction.
- Progress:
  - Added headline exact-match/overlap checks and structure-overlap heuristic.
  - Added one-time retry path with anti-similarity regeneration instruction.
  - Added hard block response `AI_DRAFT_SIMILARITY_BLOCKED` with issue diagnostics.
- Acceptance Criteria:
  - Gate failure reason is logged and returned (internal diagnostics).
  - Retry path works and blocks if still failed.

## T4. Compliance Gate Integration
- Goal: Add pre-publish risk check coupling.
- Scope:
  - Run compliance analysis after generation.
  - Return risk summary + actionable suggestions.
- Progress:
  - Added shared compliance assessor for unified scoring and summary.
  - `/api/ai/generate-draft` now includes `compliance` in success response.
  - High-risk outputs are blocked with `AI_DRAFT_COMPLIANCE_BLOCKED` (HTTP 409).
- Acceptance Criteria:
  - High risk can block publish flow.
  - Journalist UI shows clear remediation messages.

## T5. Journalist UI Alignment
- Goal: Align portal UX with contract.
- Scope:
  - Show mode-specific constraints in UI.
  - Show parse/gate failure reason in concise terms.
  - Keep restore-draft and media placement flow intact.
- Progress:
  - Draft generation errors now preserve `code/issues/compliance` payloads in client service.
  - Journalist draft panel now maps gate error codes to concise Korean guidance.
  - Blocked cases show up to 4 actionable issues in the draft warning box.
  - Added code-specific labels/hints for blocked draft states in AI writing helper panel.
  - Compliance summary card now adapts color tone by `riskLevel` (low/medium/high).
- Acceptance Criteria:
  - No regression in existing wizard completion flow.
  - QA scenarios for fallback/error states pass.

## T6. Telemetry & Quality Dashboard
- Goal: Operational visibility for generation quality.
- Scope:
  - Log prompt version/mode/retry/fallback/gate failures.
  - Add admin-facing counters for failure categories.
- Progress:
  - Added in-memory draft ops telemetry counters with mode split and prompt version.
  - `/api/admin/stats` now includes `aiDraftOps` snapshot for dashboard consumption.
  - Admin dashboard now renders AI draft generation metrics (request/success/retry/block counts).
  - Added DB log persistence via `admin_action_logs` (`ai_draft_metric_v1`) and startup rehydration from logs.
  - File persistence remains as fallback when DB log hydration is unavailable.
- Acceptance Criteria:
  - Metrics available in admin operational panel or logs.
  - Enables tracking of weekly regression trends.
