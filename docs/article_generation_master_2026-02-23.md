# HueBrief Article Generation Master Plan (KR/EN) - 2026-02-23

이 문서는 아래 2개 문서를 기준으로 현재 구현 상태를 재정렬하고, 감정 카테고리/프롬프트/게이트를 v2로 개편하기 위한 통합 계획서입니다.  
This is the consolidated plan to realign current implementation and execute v2 reform of emotion categories, prompts, and gates.

- Source A: `docs/HueBrief_Emotion_Mapping_V3.md`
- Source B: `docs/HueBrief_Unified_Spec.md`

---

## 1) Executive Summary / 요약

### KR
- HueBrief 감정 체계는 "기사 주제 필터"가 아니라 "인지/정서 UX 조절 레이어"라는 점을 핵심 원칙으로 고정합니다.
- 기사 생성은 실시간 이슈 기반 사실성을 유지하되, 감정은 톤/밀도/자극 강도만 조절합니다.
- v2에서는 감정별 prompt parameter 전략(temperature/assertiveness 등)을 명시하고, fallback 노출과 품질게이트를 강화합니다.

### EN
- Emotion in HueBrief is not a topic filter; it is a cognitive-emotional UX control layer.
- Generation remains real-time-issue grounded; emotion only controls tone/density/stimulation.
- v2 formalizes per-emotion prompt parameters and strengthens fallback visibility and quality gates.

---

## 2) Canonical Principles from V3 + Unified Spec / 기준 원칙

### 2.1 Emotion Role Definition / 감정 역할 정의
- KR: 감정 키는 사실 선택기가 아니라 표현 조절기입니다.
- EN: Emotion key is a presentation regulator, not a fact selector.

### 2.2 Content Integrity / 사실 무결성
- KR: 감정 상태와 무관하게 사실 근거(실시간 이슈/출처)는 동일 수준으로 유지합니다.
- EN: Factual grounding quality must stay invariant across emotions.

### 2.3 Reference Safety / 참조 안전
- KR: 외부 기사 참조는 맥락용이며 복사/문장 구조 모사는 금지합니다.
- EN: External references are context-only; copying/structural mirroring is forbidden.

### 2.4 Spectrum Definition / 스펙트럼 정의
- KR: spectrum은 독립 카테고리가 아니라 5개 감정 결과의 균형 믹스 모드입니다.
- EN: Spectrum is a balancing mode, not an independent category.

---

## 3) Target Emotion Policy (v2 Canonical) / 감정 정책(목표)

## 3.1 immersion (Red)
- KR: 고관여 이슈에서 경각심을 주되, 공포/분노 증폭 문구 금지.
- EN: High-attention framing without fear/anger amplification.
- Suggested prompt control:
  - temperature: low-mid
  - assertiveness: medium-high
  - sensationalism_penalty: high

## 3.2 clarity (Blue)
- KR: 설명형/분석형 구조, 은유/감정 수사 최소화.
- EN: Explanatory/analytical structure with minimal rhetorical emotion.
- Suggested prompt control:
  - temperature: low
  - assertiveness: high
  - lexical_variation: medium

## 3.3 serenity (Green)
- KR: 저자극/회복형 전달, 불안 유발 문구 억제.
- EN: Low-stimulation recovery tone; anxiety-trigger suppression.
- Suggested prompt control:
  - temperature: low
  - assertiveness: low-medium
  - stimulation_cap: strict

## 3.4 vibrance (Yellow)
- KR: 긍정/활력 톤 허용, 과장/홍보성/클릭베이트 금지.
- EN: Positive activation allowed; hype/advertorial/clickbait forbidden.
- Suggested prompt control:
  - temperature: mid
  - assertiveness: medium
  - hype_penalty: high

## 3.5 gravity (Gray)
- KR: 무게감 있는 성찰형 문체, 단정적 공포 서사 금지.
- EN: Reflective gravity tone without deterministic fear narrative.
- Suggested prompt control:
  - temperature: low
  - assertiveness: high
  - alarmism_penalty: high

## 3.6 spectrum (Gradient)
- KR: 5개 감정 결과를 diversity constraint로 병합(중복 제거 + 균형 점수 반영).
- EN: Merge 5 emotion outputs using diversity constraints and balance scoring.

---

## 4) Prompt Governance v2 / 프롬프트 거버넌스 v2

## 4.1 Required Prompt Blocks / 필수 블록
1. System invariants (fact-first, no-copy, JSON-only)
2. Emotion control block (tone/density/stimulation)
3. Real-time issue block (sources + evidence)
4. Output schema block
5. Safety/compliance block

## 4.2 Prohibited Prompt Behaviors / 금지 프롬프트 동작
- KR: 감정 상태를 근거로 사실을 변경하거나 과장하는 지시 금지.
- EN: No instruction that changes facts based on emotion state.
- KR: 클릭 유도형 선정성 문구 생성 지시 금지.
- EN: No clickbait-oriented sensational instruction.
- KR: 원문 기사 문장 흐름 재현 지시 금지.
- EN: No instruction to reproduce source sentence flow.

## 4.3 Mandatory Constraints / 필수 제한
- JSON only
- Per-item `sourceCitation[]` required (url + source)
- Min evidence sentence ratio threshold
- Duplication ratio threshold
- Fallback flag + reason code required on degraded output

---

## 5) Gap Analysis: Current vs Target / 현재 대비 갭

## 5.1 Strengths (Current)
- Real-time issue fetch and emotion-based keyword routing exist.
- Fallback flagging exists (`fallbackUsed`, `reasonCode`).
- Save-block for fallback items exists on emotion page.

## 5.2 Gaps (Must Fix)
1. Emotion policy is not yet formalized as explicit prompt parameter profiles.
2. `sourceCitation[]` is not enforced in emotion news output contract.
3. Quality gate for emotion news (duplication/evidence) is not strict enough.
4. Spectrum balancing mode is conceptually stated but not fully scored/controlled.
5. Prompt source files include encoding-risk zones and need normalization.

---

## 6) V2 Implementation Plan / v2 구현 계획

## 6.1 Phase P0 (Immediate, Safety + Integrity)
1. Enforce `sourceCitation[]` in `/api/ai/generate-news` output.
2. Add emotion-news quality gates:
   - duplication ratio
   - evidence coverage ratio
   - min information density
3. If gate fails, return blocked/fallback with explicit `reasonCode`.
4. UI label split:
   - `AI Generated (Verified)`
   - `Fallback Recovery`
5. Extend regression tests for gate-failure paths.

Acceptance:
- No fallback item persists.
- All persisted items include minimum citation/evidence fields.

## 6.2 Phase P1 (Prompt Architecture + Reliability)
1. Refactor prompt builder into UTF-8-safe KR/EN templates.
2. Implement emotion parameter profiles as first-class config object.
3. Add RSS short-cache and per-keyword diagnostics.
4. Add `aiNewsOps` telemetry:
   - requests, success, fallback, qualityBlocks, rssFallbacks, modelEmpty, parseFailures
5. Surface `aiNewsOps` in admin stats/dashboard.

Acceptance:
- Prompt versioning and diagnostics become deterministic.
- Pipeline failure observability available in admin.

## 6.3 Phase P2 (Governance Hardening)
1. Category-level forbidden framing matrix.
2. Add compliance sub-gate for emotion news path.
3. Trend dashboards (7d/30d) for quality and reliability.
4. Release checklist automation for prompt/docs/tests sync.

Acceptance:
- Pre-release gate catches policy regressions.
- Weekly reliability/quality trend is visible and auditable.

---

## 7) Execution Backlog / 실행 백로그

## 7.1 P0 Backlog
1. API contract update for emotion news response (`sourceCitation[]`, gate result fields).
2. Server quality-gate module (new validator + reason codes).
3. Emotion page save policy update (gate-fail block, structured UX messaging).
4. `test:ai-news` scenarios:
   - unauthorized
   - success
   - fallback-only
   - quality-blocked
5. Docs sync update:
   - contract
   - tickets
   - regression notes

## 7.2 P1 Backlog
1. `articlePrompt.ts` re-encoding and KR/EN dual template split.
2. Emotion parameter profile registry (single source of truth).
3. RSS cache + diagnostic detail model.
4. `aiNewsOps` storage and `/api/admin/stats` integration.
5. Admin page cards and trend placeholders.

## 7.3 P2 Backlog
1. Policy matrix authoring + parser.
2. Compliance sub-gate implementation and reporter UI.
3. Dashboard trend charts (7d/30d).
4. Release automation scripts for contract/prompt/test sync.

---

## 8) Owner Model / 역할 분담

- PM
  - Define acceptance criteria and release gates.
  - Control scope and milestone quality thresholds.
- UX
  - Design fallback visibility, state labels, and remediation messaging.
  - Ensure readability and low-stimulation behavior consistency across breakpoints.
- BUILDER
  - Implement API contract, prompt profiles, gates, telemetry.
  - Preserve model governance constraints.
- QA
  - Build regression matrix and failure-injection tests.
  - Validate no regression in narrative continuity and safety signals.

---

## 9) Files to Touch in v2 / 예상 수정 파일

- `server/routes.ts`
- `server/services/articlePrompt.ts`
- `server/services/newsCron.ts`
- `client/src/services/gemini.ts`
- `client/src/pages/emotion.tsx`
- `client/src/pages/admin.tsx`
- `scripts/ai_news_regression.ts`
- `docs/article_generation_contract_v1.md`
- `docs/article_generation_tickets_v1.md`

---

## 10) Notes / 비고

- KR: 본 문서는 현재 운영 코드 기준+V3/Unified 원칙을 결합한 실행 문서입니다.
- EN: This document is an execution-oriented baseline merged from current code and V3/Unified principles.
- KR: 다음 단계는 P0 구현 착수 전에 이 문서를 기준으로 계약 필드 확정이 필요합니다.
- EN: Before P0 coding starts, finalize the contract fields listed in this document.
