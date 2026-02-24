# AGENTS.md — Human Pulse AI (KR/EN Bilingual)
(Vite + React + Express + Supabase/Drizzle + R3F(Three.js) + Gemini)

> 목적 / Purpose
- 이 문서는 Codex 에이전트 작업 지침입니다.
- This file defines operational instructions for Codex agents.
- 인코딩 이슈 대비를 위해 핵심 지침은 한국어/영문 병기합니다.
- To survive encoding issues, core rules are written in Korean and English.

---

## 0) 제품 목표 / Product Goal
- Human Pulse AI는 **기사(스토리) + 데이터 시각화 + 3D + 스크롤 인터랙션** 결합 경험을 지향합니다.
- Human Pulse AI aims to combine **story content + data visualization + 3D + scroll interaction**.
- 사용자는 읽기 흐름과 맥락을 잃지 않아야 합니다.
- Users should keep narrative flow and context continuity.

---

## 1) 기술 아키텍처 / Technical Architecture
- Backend: **Express (`server/`)**
- Frontend: **Vite + React (`client/`)**
- Serverless: **`api/` (Vercel)**
- `api/`와 `server/` 라우팅 관계를 항상 일관되게 유지합니다.
- Keep routing behavior between `api/` and `server/` consistent.
- AI/Gemini 구현은 `server/routes.ts`, `api/ai/*` 관례를 우선 따릅니다.
- AI/Gemini features should follow conventions in `server/routes.ts` and `api/ai/*`.

---

## 2) 작업 원칙 / Working Principles
- 작은 단위, 안전한 변경을 우선합니다.
- Prefer small, safe, incremental changes.
- 가능한 경우 patch 중심으로 수정합니다.
- Use patch-based edits whenever possible.
- 변경 범위를 최소화하고 의존성 영향을 통제합니다.
- Minimize scope and dependency impact.
- 진행 보고는 간결하게 유지합니다.
- Keep progress reporting concise.

### 결과 보고 형식 / Output Format
1. Plan (max 3 lines)
2. What changed (max 3 lines)
3. Test/Verification (1-3 lines)

### 역할 플레이북 분리 운영 / Role Playbook Split Operation
- 역할 상세 지침은 아래 문서를 단일 참조로 사용합니다.
- Use the following documents as the single detailed source by role.
  - `docs/agents/README.md`
  - `docs/agents/pm.md`
  - `docs/agents/ux.md`
  - `docs/agents/builder.md`
  - `docs/agents/qa.md`
- 이 AGENTS는 공통 원칙과 우선순위를 정의하고, 역할별 실행 디테일은 `docs/agents/*`에 위임합니다.
- This AGENTS defines global policy; role execution details are delegated to `docs/agents/*`.

---

## 3) 역할 기준 / Role Expectations
### PM
- 요구사항을 구현 단위로 분해하고 Acceptance Criteria를 명확히 정의합니다.
- Break requests into implementable units and define explicit acceptance criteria.

### UX
- 반응형 및 상태(hover/active/loading/empty/error) 일관성을 유지합니다.
- Keep responsive and state behavior consistent.
- 모바일/태블릿에 hover 의존 UX를 강제하지 않습니다.
- Do not force hover-dependent UX on mobile/tablet.
- 가독성(행간/정렬/밀도)을 기능 추가보다 우선합니다.
- Prioritize readability (line-height/alignment/density) over adding features.

### BUILDER
- PM/UX 의도를 코드에 정확히 반영합니다.
- Implement PM/UX intent precisely.
- Gemini 출력은 가능하면 raw HTML이 아니라 **Story Spec JSON**으로 처리합니다.
- Prefer **Story Spec JSON** over raw HTML from Gemini.
- 사용자 명시 요청이 있기 전까지 Gemini 모델명(`GEMINI_TEXT_MODEL` 기본값/코드 상 모델 문자열)을 절대 변경하지 않습니다.
- Do not change Gemini model identifiers unless the user explicitly requests it.
- 이미지 생성 모델은 사용자 요청 시 지정한 모델(`gemini-2.5-flash-image-002`)로 고정하며, 사용자 재요청 없이 타 모델/외부 이미지 서비스로 우회하지 않습니다.
- Keep image generation fixed to the user-requested model (`gemini-2.5-flash-image-002`) unless explicitly requested.

### QA
- 회귀(regression), 맥락 손실, 복귀 동선 실패를 집중 점검합니다.
- Validate regression risks, context loss, and back-navigation continuity.
- Three.js는 render loop/camera/controls/dispose 누수와 성능 저하를 점검합니다.
- For Three.js, verify render loop/camera/controls/dispose stability.

---

## 4) 스토리 렌더링 원칙 / Story Rendering Rules
- Gemini 출력은 **Story Spec(JSON Schema)** 우선.
- Prefer **Story Spec (JSON Schema)** over direct HTML rendering.
- 기준 스키마: `schemas/story_spec_v1.json`.
- React 렌더러는 스크롤/인터랙션/3D 요소를 안전하게 렌더링해야 합니다.
- React renderer must safely handle scroll/interaction/3D elements.

---

## 5) Three.js / React Three Fiber
- 3D 상태/생명주기 관리는 `Scene.tsx` 중심으로 명확히 유지합니다.
- Keep 3D state/lifecycle explicit and centered in `Scene.tsx`.
- 성능 이슈가 재현되면 원인 + 최소 수정안을 함께 기록합니다.
- For reproducible perf issues, record root cause and propose minimal fix.

---

## 6) 데이터/스키마 / Data & Schema
- 공유 타입/스키마는 `shared/schema.ts` 기준으로 정렬합니다.
- Keep shared types/schemas aligned with `shared/schema.ts`.
- DB 변경은 migration + drizzle 절차를 준수합니다.
- Follow migration + drizzle workflow for DB changes.

---

## 7) 테스트/검증 / Test & Verification
### 기본 체크 / Baseline checks
- `npm run dev`
- `npm run lint`
- `npm test`

### 실패 시 기록 / If blocked by environment
- 실패 원인(cause), 대안(workaround), 영향(impact)을 반드시 기록합니다.
- Always document cause, workaround, and impact.

---

## 8) 안전 수칙 / Safety Rules
- 비밀키/민감정보 노출 금지.
- Never expose secrets or sensitive data.
- 파괴적 명령 사용 금지.
- Avoid destructive commands.
- 보안/운영 리스크가 큰 변경은 근거를 남기고 최소화합니다.
- Minimize high-risk security/ops changes with clear rationale.

---

## 9) Responsive Interaction Baseline
### 9.1 Breakpoints
- Desktop: `>= 1280px`
- Tablet: `768px ~ 1279px`
- Mobile: `<= 767px`

### 9.2 Context Continuity
- 카드 → 상세 → 다음 콘텐츠 전환에서 맥락 유지.
- Preserve context during card → detail → next-content transitions.
- 복귀 시 리스트 스크롤 위치 유지.
- Preserve list scroll position on return.

### 9.3 Motion & Readability
- 문장/문단 단위 의미 노출 우선.
- Reveal text by sentence/paragraph meaning.
- 과도한 단어 단위 모션 금지.
- Avoid over-animation.
- `prefers-reduced-motion` 지원.
- Support reduced motion.

### 9.4 Next Content Handoff
- 기사 말미 전환은 사용자 선택 기반.
- End-of-article transitions should be user-choice driven.
- 추천 콘텐츠는 현재 기사 하단에서 자연스럽게 연결.
- Recommendations should continue naturally below current content.

### 9.5 Layout Density & Readability
- 여백(padding/spacing) 우선.
- 텍스트/버튼/카드 과밀 배치 금지.
- 작은 화면일수록 정보 밀도 축소.

---

## 10) 현재 UX 중점 항목 (뉴스/감정 페이지) / Current UX Focus
- 감정 카드 색 대비는 intensity 구간별로 명확히 구분하되 극단값을 피합니다.
- Tier emotion-card contrast by intensity while avoiding extreme values.
- 상세 모달은 중앙 본문 축 정렬과 하단 액션 가시성을 유지합니다.
- Keep centered content alignment and always-visible footer actions.
- 추천 뉴스는 맥락 연결 + 감정 균형을 동시에 만족하도록 배치합니다.
- Recommendation area should satisfy both continuity and emotional balance.

---

## 11) UI/UX Visual Baseline (Operational)
### 11.1 Border & Shadow Policy
- Border와 shadow는 기능적으로 꼭 필요한 경우에만 사용합니다.
- 기본 구분은 컬러 자체, 여백, 타이포 위계로 해결합니다.
- 카드/버튼/패널에 불필요한 외곽선 중첩을 금지합니다.
- 그림자는 depth cue가 필요한 핵심 컴포넌트에 한정합니다.

### 11.2 Layout & Spacing Priority
- 기능 추가보다 레이아웃 정렬과 spacing 일관성을 우선합니다.
- 동일 컨테이너 내 핵심 블록(이미지/제목/요약/본문/추천/푸터)은 폭과 축 정렬을 맞춥니다.
- 작은 화면에서 정보 밀도를 자동으로 낮추고, 겹침 없는 반응형을 기본으로 합니다.

### 11.3 Color-First Distinction
- 상태 구분은 보더보다 배경색/텍스트 대비/톤 스텝으로 우선 처리합니다.
- category/depth 컬러는 `docs/color_reference.md`를 단일 기준으로 유지합니다.
- low/mid/high depth에서 텍스트 대비 점검을 릴리즈 체크리스트에 포함합니다.

### 11.4 News Card Freeze Baseline
- 뉴스 카드 고정 스펙 단일 기준 문서: `docs/ui/news-card-spec.md`
- Single source of truth for frozen news-card geometry/UI: `docs/ui/news-card-spec.md`
- 카드 레이아웃/좌표/텍스트 컷오프 변경 시 아래 3가지를 반드시 동시 업데이트합니다.
- On any card geometry/cutoff change, update all three in the same change:
1. `docs/ui/news-card-spec.md`
2. 구현 코드 상수/레이아웃 (`client/src/pages/emotion.tsx` 또는 후속 카드 컴포넌트)
3. 시각 회귀 기준(스크린샷/스냅샷) 및 검증 기록
- 위 3개 중 하나라도 누락되면 변경 완료로 간주하지 않습니다.
- Any missing item means the change is incomplete.

---

## 12) Prompt Planning & Governance Baseline
### 12.1 Source of Truth
- 기사 생성 계약 기준 문서:
  - `docs/article_generation_total_2026-02-23.md` (통합본 / consolidated)
  - `docs/article_generation_contract_v1.md`
  - `docs/article_generation_tickets_v1.md`
- 구현은 계약 문서의 용어/코드/게이트 정의와 동기화합니다.

### 12.2 Prompt Change Rule
- 프롬프트 변경 시 아래 4가지를 함께 업데이트합니다.
1. Prompt version string
2. 통합본 문서: `docs/article_generation_total_2026-02-23.md`
3. Contract/Ticket 문서
4. Regression test notes (cause/workaround/impact)

### 12.3 Gate Rule
- 최소 게이트: parse -> schema -> similarity -> compliance.
- similarity/compliance 차단 시 actionable reason 반환.
- 기자 포털 UI는 code 기반 라벨과 권장 조치 노출.

### 12.4 Telemetry Rule
- 운영 지표 최소 항목:
  - requests, success, retries, fallbackRecoveries
  - parseFailures, schemaBlocks, similarityBlocks, complianceBlocks, modelEmpty
- 관리자 대시보드에서 즉시 확인 가능해야 하며, 주간 추세 추적이 가능해야 합니다.

---

## 13) Agent Invocation Rule
- 역할 호출은 작업 요청 문장에 태그를 명시해 수행합니다.
- Invoke role behavior by adding tags in the request.
  - `[PM]` 요구사항 분해/AC 우선
  - `[UX]` 인터랙션/레이아웃/반응형 우선
  - `[BUILDER]` 구현/리팩터링/의존성 영향 최소화 우선
  - `[QA]` 회귀/리스크/검증 로그 우선
- 태그가 없으면 기본 순서: `BUILDER -> QA` 로 처리합니다.
- If no tag is provided, default execution order is `BUILDER -> QA`.
