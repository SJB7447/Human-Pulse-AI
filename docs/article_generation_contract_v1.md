# HueBrief Article Generation Contract v1

## 1. Scope
- Applies to journalist portal article generation pipeline.
- Covers: keyword search, reference selection, draft generation (quick/interactive-longform), validation gates, and publish handoff.

## 2. Core Non-Negotiables
- Reference article is context only, never a copy target.
- Do not reuse reference headline wording or structure.
- Do not mirror sentence flow/paragraph rhythm from reference.
- Output article must be independently constructed in wording and narrative order.

## 3. Mode Contracts
- `draft` (Quick Article)
- Target: concise text-first draft.
- Hard limit target: short body (service target <= 500 Korean chars).
- Output JSON fields remain compatible with current client contract.

- `interactive-longform`
- Target: deep explanatory structure with richer sections and media slots.
- Output must include structured sections and 3~5 media slots where possible.

## 4. API Contract (Current Baseline)
- Endpoint: `POST /api/ai/generate-draft`
- Input:
  - `keyword: string`
  - `mode: "draft" | "interactive-longform"`
  - `selectedArticle: { title, summary, url, source }`
- Output (JSON):
  - `title: string`
  - `content: string`
  - `sections: { core, deepDive, conclusion }`
  - `mediaSlots: Array<{ id, type, anchorLabel, position, caption }>`
  - `sourceCitation: { title, url, source }`
  - `fallbackUsed: boolean`

## 5. Validation Gates (Target)
- Parse Gate: valid JSON only.
- Similarity Gate:
  - Headline lexical overlap threshold.
  - Structural overlap heuristic threshold.
- Compliance Gate:
  - Defamation/privacy/overclaim checks.
- Retry Policy:
  - One regeneration attempt on gate failure.
  - Block publish if gate remains failed.

## 6. Prompt Architecture (Target)
- Global system constraints block.
- Mode-specific task block (`draft`, `interactive-longform`).
- Input context block (keyword + selected reference metadata).
- Output schema block (strict JSON).

## 7. Observability
- Log prompt version and mode.
- Log parse failures and gate failure reasons.
- Track fallback rate and retry outcomes.

## 8. Out-of-Scope (v1)
- Model switch/change.
- End-to-end redesign of media generation endpoints.
- Full compliance classifier replacement.
