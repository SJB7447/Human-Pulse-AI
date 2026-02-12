# AGENTS.md — Human Pulse AI (KR/EN Bilingual)
(Vite + React + Express + Supabase/Drizzle + R3F(Three.js) + Gemini)

> 목적 / Purpose
> - 이 문서는 에이전트(Codex) 작업 지침입니다.
> - This file defines the working instructions for agents (Codex).
> - 한국어가 깨질 가능성에 대비해 한국어/영문을 함께 제공합니다.
> - Korean and English are written together so instructions remain readable even if Korean text gets corrupted.

---

## 0) 제품 목표 / Product Goal
- Human Pulse AI는 **기사(스토리) + 데이터 시각화 + 3D + 스크롤 인터랙션**을 결합한 경험을 지향합니다.
- Human Pulse AI aims to combine **story content + data visualization + 3D + scroll interaction**.
- 사용자는 읽기 흐름을 잃지 않고 콘텐츠 맥락을 이어가야 합니다.
- Users should keep reading context without losing flow.

---

## 1) 아키텍처 원칙 / Architecture Principles
- Backend: **Express (`server/`)**
- Frontend: **Vite + React**
- `api/` (Vercel serverless)와 `server/` 라우팅 관계를 일관되게 유지합니다.
- Keep the routing relationship between `api/` (Vercel serverless) and `server/` consistent.
- AI/Gemini 관련 구현은 `server/routes.ts` 및 `api/ai/*` 컨벤션을 준수합니다.
- For AI/Gemini features, follow conventions in `server/routes.ts` and `api/ai/*`.

---

## 2) 작업 방식 / Working Rules
- 작은 단위의 안전한 변경을 우선합니다.
- Prefer small, safe, incremental changes.
- 가능한 경우 **patch 중심**으로 수정합니다.
- Use **patch-based** edits whenever possible.
- 작업 결과 보고는 간결하게 유지합니다.
- Keep status reporting concise.
- 결과 보고 형식:
  1. Plan (3 lines max)
  2. What changed (3 lines max)
  3. Test/Verification (1–3 lines)

---

## 3) 역할 기준 / Role Expectations

### PM (Product Manager)
- 요구사항을 기능 단위로 분해하고 Acceptance Criteria를 명확히 정의합니다.
- Break requirements into implementable units and define clear acceptance criteria.

### UX (UI/UX Designer)
- 반응형/상태(hover, active, loading, empty, error) 일관성을 유지합니다.
- Keep responsive/state behavior (hover, active, loading, empty, error) consistent.
- 모바일/태블릿에서 hover 의존 패턴을 강제하지 않습니다.
- Do not force hover-dependent interactions on mobile/tablet.
- 가독성(행간/정렬/밀도) 우선으로 구성합니다.
- Prioritize readability (line-height/alignment/density).

### BUILDER (Developer)
- PM/UX 의도를 코드로 정확히 반영합니다.
- Implement PM/UX intent precisely in code.
- 변경 범위를 최소화하고 의존성 영향을 통제합니다.
- Minimize change scope and control dependency impact.
- Gemini 출력은 가능하면 **Story Spec JSON** 중심으로 다룹니다.
- Prefer **Story Spec JSON** over raw HTML for Gemini outputs.

### QA (Quality & Stability)
- 회귀(regression)와 UX 맥락 손실 여부를 중점 확인합니다.
- Validate regressions and UX context continuity.
- Three.js는 render loop / camera / controls / dispose 안정성을 확인합니다.
- For Three.js, verify render loop / camera / controls / dispose stability.
- 배포 전 최소 패치로 위험을 줄입니다.
- Reduce risk with minimal patches before release.

---

## 4) 스토리 렌더링 원칙 / Story Rendering Rules
- Gemini 출력은 **직접 HTML 렌더링보다 Story Spec(JSON Schema) 우선**.
- Prefer **Story Spec (JSON Schema)** over direct HTML rendering from Gemini.
- 기준 스키마: `schemas/story_spec_v1.json`
- Canonical schema: `schemas/story_spec_v1.json`
- React 렌더러(예: StoryRenderer)는 스크롤/인터랙션/3D 요소를 안전하게 렌더링해야 합니다.
- React renderer (e.g., StoryRenderer) must safely render scroll/interaction/3D elements.

---

## 5) Three.js / React Three Fiber
- `Scene.tsx` 중심의 3D 상태 및 생명주기 관리를 명확히 합니다.
- Keep 3D state and lifecycle management explicit (centered in `Scene.tsx`).
- render loop/camera/controls/dispose 누수 및 성능 저하를 방지합니다.
- Prevent leaks/perf regressions in render loop/camera/controls/dispose.
- 성능 문제는 원인 기록 + 최소 수정안을 함께 제시합니다.
- For performance issues, document root cause and propose a minimal fix.

---

## 6) 데이터/스키마 변경 / Data & Schema Changes
- 공유 타입/스키마는 `shared/schema.ts`를 기준으로 유지합니다.
- Keep shared types/schemas aligned with `shared/schema.ts`.
- DB 변경 시 migration + drizzle 흐름을 준수합니다.
- Follow migration + drizzle workflow for DB changes.

---

## 7) 테스트/검증 / Test & Verification
- 기본 검증 명령:
  - `npm run dev`
  - `npm run lint`
  - `npm test`
- 환경 제약으로 실패하면 원인/대안/영향도를 함께 기록합니다.
- If environment limitations block checks, document cause/workaround/impact.

---

## 8) 안전 수칙 / Safety Rules
- 민감 정보/비밀키 노출 금지.
- Never expose secrets or sensitive credentials.
- 파괴적 명령(`rm -rf`, 시스템 파괴성 조작) 사용 금지.
- Avoid destructive commands (`rm -rf`, dangerous system operations).
- 보안/운영 위험이 큰 변경은 사전 근거와 함께 최소화합니다.
- Minimize high-risk security/ops changes and document justification.

---

## 9) Responsive Interaction Baseline (Validated)
> Epic 1~4 검증 결과를 반영한 운영 기준 (HueBrief 공통)
> Operational baseline reflecting Epic 1~4 validation results (HueBrief common).

### 9.1 적용 범위 / Breakpoints
- Desktop: `>= 1280px`
- Tablet: `768px ~ 1279px`
- Mobile: `<= 767px`
- 반응형 전 구간에서 상태 전이(카드→상세→다음콘텐츠) 맥락 유지.
- Preserve transition context (card → detail → next content) across all breakpoints.

### 9.2 Card → Detail 전환 원칙 / Transition Principles
- 상세 진입 시 원 카드 맥락(위치/출처) 유지.
- Preserve original card context (position/source) when entering detail.
- 복귀 시 리스트 스크롤/카드 위치 맥락 유지.
- Preserve list scroll/card position on back navigation.
- 모바일/태블릿에서 hover 의존 UX 강제 금지.
- Do not enforce hover-dependent UX on mobile/tablet.
- 키보드 접근(Enter/Space), focus-visible 기본 지원.
- Support keyboard entry (Enter/Space) and focus-visible by default.

### 9.3 Scroll Text Rhythm 원칙 / Scroll Text Rhythm
- 텍스트는 문장/문단 단위 의미로 노출.
- Reveal text by sentence/paragraph-level meaning.
- 과도한 단어 단위 모션 금지.
- Avoid overly granular word-by-word motion.
- `prefers-reduced-motion`에서 모션 축소/제거.
- Reduce/remove motion under `prefers-reduced-motion`.
- 작은 화면은 가독성 우선.
- Prioritize readability on small screens.

### 9.4 Background Transition 원칙 / Background Transition
- 배경 전환은 보조 장치로만 사용.
- Use background transitions only as supportive cues.
- 스크롤 진행에 자연스럽게 동기화하고 본문 대비 유지.
- Sync smoothly with scroll while preserving text contrast.
- 빠른 스크롤에서도 점프/깜빡임 방지.
- Prevent jump/flicker during fast scrolling.

### 9.5 Next Content Handoff 원칙 / Handoff
- 기사 말미 전환은 사용자 선택 기반.
- Provide end-of-article transitions based on user choice.
- 추천 콘텐츠는 현재 콘텐츠 하단에서 자연스럽게 연결.
- Recommended content should continue naturally below current content.
- 중복 CTA를 줄이고 맥락 단절 방지.
- Avoid redundant CTAs and context breaks.

### 9.6 QA 게이트 / QA Gate
- 필수 체크 / Required checks:
  - `npm run dev`
  - `npm run lint`
  - `npm test`
- 배포 기준 / Release criteria:
  - UX 체크리스트 90% 이상 통과 / >=90% UX checklist pass
  - Blocker(맥락 손실/읽기 방해/복귀 실패) 0건 / 0 blockers
  - 성능 이슈 재현 시 원인 기록 + 최소 패치 제안 / Root cause + minimal patch for reproducible perf issues

### 9.7 레이아웃 밀도/가독성 / Layout Density & Readability
- 여백(padding/spacing)을 기본 우선순위로 둡니다.
- Prioritize generous padding/spacing.
- 텍스트/버튼/카드 과밀 배치를 피합니다.
- Avoid dense text/button/card layouts.
- 맥락상 중요한 요소(예: 목록 복귀, 하단 추천 카드)는 중앙/균형 정렬을 우선 검토합니다.
- For context-critical elements (e.g., back-to-list, recommendation cards), prioritize centered/balanced alignment.
- 작은 화면일수록 정보 밀도 낮추고 터치/시선 이동 부담을 줄입니다.
- Lower information density on small screens to reduce touch/eye strain.
- 답답하거나 과밀하면 기능 추가보다 먼저 여백/정렬을 조정합니다.
- If UI feels cramped, adjust spacing/alignment before adding features.
