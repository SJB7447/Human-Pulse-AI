# HueBrief Responsive UX Task Board (for Human Pulse AI)

## 1) Plan (3)
1. 기존 HueBrief 구조를 유지하면서 데스크톱/태블릿/모바일 모두에 적용 가능한 인터랙션 태스크를 분해한다.
2. 카드→상세 전환, 스크롤 텍스트, 배경 컬러 전환, 다음 콘텐츠 연결의 상태 전이를 반응형 기준으로 정의한다.
3. 추후 `AGENTS.md` 등록을 위해 그대로 옮겨 적을 수 있는 기준 블록을 함께 제공한다.

## 2) What changed (3)
1. 반응형 브레이크포인트 기준 UX 태스크 보드를 정의했다.
2. 인터랙션별 상태 전이 모델 + 수용 기준(acceptance criteria)을 분리했다.
3. QA 체크리스트와 `AGENTS.md` 등록용 템플릿 문구를 정리했다.

## 3) 실행/검증 방법 (1~3)
1. 스테이징에서 데스크톱/태블릿/모바일로 동일 시나리오를 수행해 상태 전이 누락 여부를 확인한다.
2. 모션 민감 사용자 기준(`prefers-reduced-motion`)으로 대체 흐름이 유지되는지 확인한다.
3. QA 체크리스트 90% 이상 충족 시에만 AGENTS 기준으로 승격한다.

---

## A. Scope & Breakpoints

- **Desktop:** `>= 1280px`
- **Tablet:** `768px ~ 1279px`
- **Mobile:** `<= 767px`

### 공통 원칙
- 레이아웃 복제 금지, 인터랙션 원리만 적용.
- 기존 HueBrief 정보 구조(카드 목록 → 상세 → 다음 콘텐츠) 유지.
- 1스크린에서 “읽기 우선” 원칙 유지 (모션이 텍스트 이해를 방해하면 실패).

---

## B. Epic 1 — Card → Detail Immersive Expansion

### 목표
카드 선택 시 사용자가 맥락을 잃지 않고 몰입형 상세로 확장되도록 한다.

### 상태 전이
`Idle -> Hover/Focus -> Intent -> Expanding -> DetailActive -> ReturnIntent -> Collapsing -> Idle`

### Task Board

#### B1. Desktop
- [ ] Hover 단계에서 카드 심도/강조를 제공하되 과도한 이동 없음.
- [ ] 클릭 시 원 카드 좌표를 기준으로 상세가 확장되는 느낌 유지.
- [ ] 상세 진입 후 헤드라인/메타/본문 순서로 계층적 등장.
- [ ] 닫기 시 원래 카드 위치와 스크롤 맥락 복원.

**Acceptance Criteria**
- [ ] 사용자가 “어떤 카드에서 왔는지” 1초 이내 인지 가능.
- [ ] 진입/복귀 애니메이션이 내용 읽기보다 튀지 않음.

#### B2. Tablet
- [ ] Hover 의존 UX 제거, 탭 기반 Focus 상태 명확화.
- [ ] 좌우 여백을 유지한 확장(풀스크린 강제 금지).
- [ ] 닫기 버튼 및 back 제스처 접근성 확보.

**Acceptance Criteria**
- [ ] 한 손 조작 기준으로 닫기/복귀 동선이 명확.

#### B3. Mobile
- [ ] 카드 탭 즉시 상세 전환하되 과한 줌 모션 금지.
- [ ] 상단 고정 최소화(본문 가독성 우선).
- [ ] 복귀 시 카드 리스트 위치 정확 복원.

**Acceptance Criteria**
- [ ] 전환 후 2스크롤 이내 핵심 정보 도달 가능.

---

## C. Epic 2 — Scroll Text Rhythm

### 목표
텍스트를 “읽히는 리듬”으로 노출해 서사 몰입을 강화한다.

### 상태 전이
`Hidden -> Priming -> Reveal -> Readable -> SoftExit`

### Task Board

#### C1. Content Chunking
- [ ] 문장/구절 단위 노출 (단어 단위 난분할 금지).
- [ ] 핵심 문장과 보조 문장 대비 차등.
- [ ] 긴 문단은 2~3개 블록으로 분할.

#### C2. Responsive Behavior
- [ ] Desktop: 넓은 화면에서도 시선 이동이 과도하지 않도록 줄 길이 제한.
- [ ] Tablet: 블록 간 간격을 유지해 리듬 붕괴 방지.
- [ ] Mobile: 텍스트 등장 모션 최소화, 읽기 끊김 없는 페이드 중심.

#### C3. Accessibility
- [ ] `prefers-reduced-motion`에서 등장 모션 축소/제거.
- [ ] 모션 제거 시에도 강조 정보(핵심 문장)는 시각적으로 구분.

**Acceptance Criteria**
- [ ] 사용자 테스트에서 “읽기 방해” 피드백 비율 20% 미만.

---

## D. Epic 3 — Background Color Transition

### 목표
감정/주제 전환을 배경으로 보조하되, 가독성을 우선한다.

### 상태 전이
`Base -> TransitionStart -> Blend -> Settled`

### Task Board
- [ ] 섹션 경계에서만 색 전환 트리거.
- [ ] 텍스트/CTA 대비 유지(명도 대비 실패 금지).
- [ ] 빠른 스크롤에서도 점프/깜빡임 없는 연속 전환.
- [ ] 모바일에서 채도 과다로 본문 가독성 저하 방지.

**Acceptance Criteria**
- [ ] 모든 브레이크포인트에서 본문 대비 기준 충족.
- [ ] 컬러가 콘텐츠보다 먼저 인지되지 않음.

---

## E. Epic 4 — Next Content Natural Handoff

### 목표
현재 콘텐츠 종료 후 다음 콘텐츠로 자연스럽게 이어지는 흐름을 만든다.

### 상태 전이
`CurrentActive -> OutroCue -> NextPreview -> CommitNext`

### Task Board
- [ ] 종료 직전 짧은 Outro Cue 제공(끝남 인지).
- [ ] 다음 콘텐츠는 Preview 카드로 먼저 노출.
- [ ] 강제 전환 대신 사용자 선택(계속 읽기/목록 복귀) 제공.
- [ ] 모바일에서는 Thumb reach 영역 내 CTA 배치.

**Acceptance Criteria**
- [ ] 다음 콘텐츠 클릭률이 기존 대비 개선(팀 KPI 기준).
- [ ] 사용자가 "갑자기 넘어갔다" 피드백을 주지 않음.

---

## F. State-by-State UI Checklist

### Hover / Focus
- [ ] 상호작용 가능 요소인지 즉시 인지 가능.
- [ ] 색/그림자/스케일 중 1~2개만 사용해 과잉 연출 방지.

### Active
- [ ] 현재 읽고 있는 맥락(섹션/카드/진행상태) 표시.
- [ ] 주요 CTA는 한 화면에 1개 우선.

### Loading
- [ ] 스켈레톤/프로그레스 표시가 구조를 암시.
- [ ] 로딩 후 레이아웃 점프 최소화.

### Empty
- [ ] 빈 상태 원인 + 다음 행동 제안(재시도/탐색).

### Error
- [ ] 오류 메시지는 사용자 행동 중심 문구 사용.
- [ ] 복구 액션(재시도/뒤로가기) 명확 제공.

---

## G. QA Test Matrix (Responsive)

### Device Matrix
- [ ] Desktop: 1440x900 / 1920x1080
- [ ] Tablet: 1024x1366 / 834x1194
- [ ] Mobile: 390x844 / 360x800

### Scenario Matrix
- [ ] 카드 선택 → 상세 진입 → 복귀
- [ ] 긴 기사 스크롤(빠른/느린)
- [ ] 섹션 전환 시 배경 변화
- [ ] 콘텐츠 끝에서 다음 콘텐츠 진입
- [ ] reduced-motion 환경

### Quality Gate
- [ ] UX 체크리스트 90% 이상 통과
- [ ] Blocker(맥락 손실/읽기 방해/복귀 실패) 0건
- [ ] 성능 이슈(FPS 급락, 스터터) 재현 시 원인 기록

---

## H. AGENTS.md 등록 준비용 블록 (Draft)

아래 문구는 검증 완료 후 `AGENTS.md`에 추가할 초안:

- 반응형 인터랙션은 Desktop/Tablet/Mobile 각각에서 상태 전이 일관성을 유지한다.
- 카드→상세 전환은 맥락 보존(원 카드 위치/복귀)을 기본 원칙으로 한다.
- 스크롤 텍스트는 읽기 리듬 우선이며 과도한 모션을 금지한다.
- 배경 컬러 전환은 섹션 의미 전환 보조 목적만 허용한다.
- 다음 콘텐츠 전환은 예고(Preview) 후 사용자 선택 기반으로 진입한다.
- `prefers-reduced-motion` 대체 흐름을 필수로 제공한다.
- QA 게이트(체크리스트 90%+, Blocker 0건) 통과 시에만 배포한다.

