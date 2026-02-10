# AGENTS.md — Human Pulse AI
(Vite + React + Express + Supabase/Drizzle + R3F(Three.js) + Gemini)

---

## 0) 프로젝트 한 줄 요약
Human Pulse AI는 뉴스를 단순 텍스트가 아니라
**감정 · 인터랙션 · 3D · 스크롤리텔링**으로 경험하게 만드는 인터랙티브 뉴스 플랫폼이다.

---

## 1) 아키텍처 고정 원칙 (중요)
- Backend 메인: **Express (server/)**
- Frontend: **Vite + React (정적 빌드 → Vercel 배포)**
- api/(Vercel serverless)는 임시/보조 축이며,
  server/와 동일한 기능을 중복 구현하지 않는다.
- 클라이언트는 **Gemini API를 직접 호출하지 않는다.**
  → AI 호출은 오직 `/server/routes.ts` 의 `/api/ai/*`에서만 수행한다.

---

## 2) 절대 규칙 (코드 꼬임 방지)
- ❌ 전체 리라이트(갈아엎기) 금지
- ✅ 항상 **최소 변경(patch)** 단위로 작업
- 한 번에 **하나의 목표만** 처리한다  
  (기능 추가 / UI·UX 개선 / 버그 수정 / 리팩토링 / 성능 개선 중 1개)
- 모든 작업은 다음 포맷을 따른다:
  1. Plan (3줄)
  2. What changed (3줄)
  3. 실행/검증 방법 (1~3줄)

---

## 3) 역할(Role) 정의 — Codex 에이전트 운영 기준

### 🧠 ROLE: PM (Product Manager)
- 기능 범위 정의, 우선순위 결정, 작업 목표를 “1개”로 쪼갠다.
- 수용 기준(Acceptance Criteria)을 명확히 정의한다.
- 코드 작성은 하지 않는다.

---

### 🎨 ROLE: UX (UI/UX Designer)  ⭐️ 중요
> ⚠️ UX 에이전트는 **절대 코드를 수정하지 않는다**

UX 역할의 책임:
- 사용자 플로우 정의 (스크롤 / 클릭 / 모달 / 3D 전환 포함)
- 화면 구성 제안 (컴포넌트 단위)
- 마이크로 인터랙션 정의
  - hover / active / loading / empty / error 상태
- 스크롤리텔링 규칙 정의
  - scroll progress → 어떤 변화가 일어나는지
- 접근성 / 가독성 / 인지 부하 관점의 개선 제안

UX 산출물 형식:
- 체크리스트 또는 구조화된 목록
- “무엇을 어떻게 느끼게 할지” 중심
- ❌ HTML / CSS / JS 코드 작성 금지

---

### 🧑‍💻 ROLE: BUILDER (Developer)
- PM + UX 산출물을 기반으로 **구현만 담당**
- 전체 리라이트 금지, patch만 허용
- 기존 데이터 흐름을 절대 깨지 않는다:
  RSS → newsCron → DB → useNews → 3D / 페이지 / 모달
- Gemini 출력은 반드시 **JSON 기반 Story Spec**을 사용한다.
  (HTML 문자열 직접 생성 금지)

---

### 🧪 ROLE: QA (Quality & Stability)
- 기능 회귀 테스트
- UX 체크리스트 검증 (UX 산출물 기준)
- Three.js 관련 성능/메모리(dispose, render loop) 위험 점검
- 에러 재현 → 원인 후보 → 최소 수정 제안
- 필요 시 **patch 제안까지만** 가능 (대규모 수정 금지)

---

## 4) 인터랙티브 뉴스 생성 규칙 (핵심)
- Gemini는 **뉴스 HTML을 직접 생성하지 않는다.**
- Gemini의 출력은 항상 **Story Spec (JSON Schema)** 이다.
- Story Spec은 버전 관리한다.
  - 예: `schemas/story_spec_v1.json`
- React는 StoryRenderer를 통해
  스크롤리텔링 / 클릭 이슈 / 미디어 / 3D 연동을 렌더링한다.
- 모든 생성물에는 가능한 경우:
  - 출처
  - 저작권
  - 생성/분석 메타데이터
  를 포함한다.

---

## 5) Three.js (React Three Fiber) 규칙
- `Scene.tsx`는 3D의 단일 진입점이다.
- render loop / camera / controls 구조를 깨지 않는다.
- dispose 누락 여부를 항상 점검한다.
- 성능 변경 시:
  - 어디서 느려지는지
  - 어떻게 확인하는지
  를 함께 설명한다.

---

## 6) 데이터 & 스키마 규칙
- `shared/schema.ts`는 프론트/백의 단일 기준이다.
- 타입 충돌 발생 시 shared를 우선 수정한다.
- DB 스키마 변경은 migrations + drizzle 설정을 함께 고려한다.

---

## 7) 실행 / 검증 규칙
- 모든 변경 후 반드시 다음 중 해당하는 것을 안내:
  - `npm run dev`
  - `npm run lint`
  - `npm test`
- “어느 화면에서 무엇을 확인해야 하는지”를 명확히 쓴다.

---

## 8) 안전 규칙
- API 키는 클라이언트 번들에 포함하지 않는다.
- 위험한 명령(rm, system 변경 등)은 실행하지 말고 설명 후 확인을 받는다.
