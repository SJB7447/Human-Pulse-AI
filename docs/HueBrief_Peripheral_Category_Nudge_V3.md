# HueBrief – Peripheral Category Nudge Implementation Plan (V3 Final)

> 목표: 사용자가 특정 감정 카테고리 뉴스에 일정 시간 이상 머무르거나 동일 감정 기사 소비가 반복될 경우,  
> 화면 주변(주변시야)에 **소형 감정 구체 + 말풍선 UI**를 통해 다른 감정 카테고리를 부드럽게 추천한다.

---
## 0. 기술스택 업데이트 (현재 서비스 코드 기준)

- Frontend: **Vite + React + TypeScript + Tailwind + Framer Motion**
- State/Data: **Zustand**, **TanStack Query**
- Backend: **Express (`server/routes.ts`)**
- DB/Infra: **Supabase + fallback in-memory**
- 3D: **Three.js + React Three Fiber**
- AI: **Gemini**, HueBot 컴포넌트 별도 운영
- 관련 코드 기준점:
  - 감정 뉴스 소비 흐름: `client/src/pages/emotion.tsx`
  - HueBot: `client/src/components/HueBot.tsx`
  - API 라우팅/정책: `server/routes.ts`

---
## 1. 기능 목적

- 감정 편향 소비 완화 (특히 immersion / gravity)
- 둠스크롤 및 과몰입 완충 장치
- 사용자 제어권을 유지한 비강제 전환 UX
- 뉴스 읽기 흐름 방해 최소화

---
## 2. 트리거 조건 (Emotion-Aware Rules)

### 2.1 시간 기반 트리거
- immersion / gravity → **10분 (600초) 연속 체류**
- 기타 카테고리 → 15분 (900초)

“체류” 정의:
- document.visibilityState === "visible"
- 탭 비활성 시 타이머 정지

---

### 2.2 행동 기반 트리거 (연속 기사 소비)

적용 대상:
- immersion (red)
- gravity (gray)

넛지 발생 조건 (OR):

✔ 10분 연속 체류  
✔ 동일 카테고리 기사 **6개 이상 연속 소비**

“연속 소비” 정의 (최소 1개 충족):

- 상세 페이지 ≥ 6초 체류
- ≥ 20% 스크롤
- 영상 ≥ 5초 재생

---
## 3. 넛지 UI 구조 (3단계)

### STEP 1 – 주변시야 미니 감정 구체 등장
- 추천 카테고리 2~3개
- spectrum 최소 1개 포함 권장

---

### STEP 2 – 말풍선 UI (경량 안내 레이어)

역할:
- 방해 없는 가벼운 안내
- 사용자 선택 트리거
- HueBot 모달 진입 게이트

카피 예시:

타이틀:  
**“다른 색을 추천해 드릴까요?”**

버튼:

✔ **다른 색 추천받기**  
✔ 오늘은 숨기기

UI 규칙:

- 화면 중앙 침범 금지
- 시선 방해 모션 금지 (bounce/shake 금지)
- opacity 절제 (0.92~0.96)

---

### STEP 3 – HueBot 모달 (선택 시 진입)

진입 조건:
- 사용자가 말풍선 클릭 시만 등장

HueBot 메시지 예시:

“지금 카테고리에서 꽤 오래 머무르셨어요.  
균형을 위해 다른 관점의 뉴스를 추천해 드릴게요.”

Quick Actions:

✔ 추천 목록 보기  
✔ 스펙트럼으로 전환  
✔ 오늘은 그만 보기  
✔ 닫기

---
## 4. 방해 최소화 규칙 (Critical UX Safeguards)

HueBot 자동 등장 금지.

모달 표시 제한:

- 스크롤 중 → 지연 표시
- 텍스트 선택 중 → 표시 금지
- 영상 fullscreen → 표시 금지
- 기사 읽기 모달 상태 → compact 모드

---
## 5. z-index 정책 (Layer Safety Model)

권장 토큰:

Base Content → z=0~100  
Modal Container → z=1000  
Peripheral Nudge Overlay → **z=1050**  
HueBot Modal → **z=1100**

원칙:

✔ 모달 상태에서도 표시 허용  
✔ 단, 본문 영역 침범 금지  
✔ Safe Zone 위치 강제

---
## 6. 모바일 정책

- 일부 구체 크롭 허용
- 탭 히트박스는 화면 안 유지
- 데스크탑은 크롭 금지

---
## 7. 데이터 이벤트 정의

`peripheral_nudge_triggered`  
`peripheral_nudge_shown`  
`peripheral_nudge_click`  
`peripheral_nudge_suppressed`  
`huebot_nudge_opened`

---
## 8. 최종 UX 철학

이 넛지는 **주의 환기 장치이지 개입 장치가 아니다.**

강제 전환 금지.  
읽기 흐름 존중.  
항상 사용자 선택 기반.

