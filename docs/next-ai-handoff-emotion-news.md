# Human Pulse AI — 뉴스/감정 페이지 핸드오프 (Next AI Handoff)

작성 목적:
- 다음 세션 AI가 빠르게 이어서 작업할 수 있도록 현재 상태를 정리합니다.
- 최근 반복 수정이 많았던 **뉴스 상세 모달 / 감정 카테고리 카드 / 추천 뉴스**의 의도와 리스크를 함께 남깁니다.
- 감정 카테고리 관련 코드 구조/로직을 상세히 설명합니다.

---

## 1) 지금까지 완료된 작업 요약 (UI/UX + 기능)

### 1-1. 뉴스 카테고리 선택 영역 (emotion 페이지 하단)
- 레이아웃: `flex flex-wrap md:flex-nowrap justify-center`로 정렬되어
  - 데스크톱: 가로 1열
  - 모바일: 줄바꿈(2줄 이상 가능)
- 각 카테고리 버튼: `w-[118px] h-[118px] p-4` 정방형 구성.
  - 내부 콘텐츠(패딩 제외)는 약 86px 영역을 목표로 구성.
- 버튼 클릭 시:
  - `window.scrollTo({ top: 0, behavior: 'smooth' })`
  - `setLocation('/emotion/:type')` 이동
- 목적: 카테고리 전환 시 맥락 유지 + 상단부터 읽기 재시작.

### 1-2. 뉴스 카드 색상 체계(감정 깊이 기반)
- 입력값: 카드의 `emotion` + `intensity`(감정 깊이).
- 핵심 유틸:
  - `hexToHsl(hex)`
  - `getCardDepthPalette(baseHex, depth)`
- 깊이 구간:
  - `<= 60`: 밝은 톤
  - `61 ~ 70`: 중간 톤
  - `>= 71`: 진한 톤
- neutral(저채도) 분기:
  - `s < 8`이면 고정 회색 팔레트 사용 (`gravity` 보호 목적 포함)
- 적용 지점:
  - 감정 카드 배경/보더
  - 상세 모달 열 때 `cardBackground` 전달
- 목적: 감정 깊이 차이를 시각적으로 분명히 하되 과도한 색 왜곡 방지.

### 1-3. 뉴스 상세 모달 (full-screen + centered content)
- 모달 컨테이너:
  - 화면 전체를 덮는 오버레이 구조 (`fixed inset-0`)
  - 배경은 감정색 기반 radial/tint + blur
- 본문 레이아웃:
  - `max-w-4xl` 중앙 정렬
  - 반투명 화이트 패널(`bg-white/78`)로 텍스트 대비 개선
- 기사 이미지:
  - 본문 상단 영역 내 고정
- 본문 텍스트:
  - 문단/문장 단위 노출 (`proseBlocks`)
  - reduce-motion 대응
- "목록으로 돌아가기":
  - 중앙 정렬
  - 넉넉한 상하 여백
  - 배경 톤에 따른 가독성 보정(동적 텍스트 컬러/섀도)

### 1-4. 상세 모달 하단 추천 뉴스
- 추천 섹션은 화이트 배경 컨테이너로 분리 (`bg-white rounded-2xl p-4 md:p-5`).
- 카드 구성:
  - 모바일: 좌측 정방형 이미지 + 우측 제목/요약 1줄(가로형 컴팩트)
  - 데스크톱: 세로 카드 느낌 강화
- 추천 타입:
  - 동일 카테고리 `sameCategory`
  - 감정 균형 `balance` (중복 제외)
- gravity 예외:
  - 균형 추천에 `vibrance` 또는 `serenity` 최소 1개 유도

### 1-5. 상세 모달 하단 액션 버튼
- 버튼 바는 화면 전체 폭이 아니라 **본문폭 기준(max-w-4xl)** 중앙 배치.
- hover 의존 노출 로직 제거하고 항상 보이도록 변경.
- 목적: "푸터"처럼 보이는 인상 완화 + 조작 안정성 확보.

---

## 2) 감정 카테고리 코드 상세 설명 (핵심)

### 2-1. 감정 정의 소스
- 파일: `client/src/lib/store.ts`
- 핵심 타입:
  - `EmotionType = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum'`
- 각 감정은 다음 필드를 가짐:
  - `label`, `labelKo`, `subLabel`, `recommendedNews`, `color`, `pastelColor`, `colorVariations`
- `gravity`의 기본색은 회색 계열(`#999898`)로 정의되어 있음.

### 2-2. emotion 페이지에서 쓰는 색 계산 흐름
1) `item.emotion` 기준 베이스 컬러 획득
```ts
const cardEmotionColor = getEmotionColor(item.emotion);
```
2) `item.intensity` 정규화
```ts
const depth = Math.max(0, Math.min(100, item.intensity ?? 50));
```
3) HSL 변환 + 팔레트 결정
```ts
const cardPalette = getCardDepthPalette(cardEmotionColor, depth);
```
4) 카드 렌더
```ts
style={{ background: cardPalette.background, borderColor: cardPalette.border }}
```

### 2-3. `getCardDepthPalette` 설계 포인트
- neutral 분기 (`s < 8`): 회색 팔레트 강제
  - 이유: 저채도 컬러(특히 gravity)가 붉게 틀어지는 현상 방지
- non-neutral 분기:
  - 채도 범위를 `softSat`으로 제한해 극단값 억제
  - 깊이에 따라 lightness를 단계적으로 낮춤
- 이 함수는 카드 대비의 핵심이며, 향후 색상 튜닝은 이 함수만 건드리는 것을 권장.

### 2-4. 하단 감정 카테고리 버튼 로직
- 구성 데이터: `EMOTION_CONFIG.filter(e => e.type !== type)`
- 클릭 핸들러:
```ts
const handleEmotionCategorySelect = (emotionType: EmotionType) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setLocation(`/emotion/${emotionType}`);
};
```
- type 변경 effect:
```ts
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'auto' });
}, [type]);
```
- 목적: 클릭 즉시 체감 + 라우트 변경 후 상단 위치 보장.

---

## 3) 남은 과제 (우선순위 제안)

### P0 (즉시 확인)
1. **추천 뉴스 섹션 배경 흰색 체감 재검증**
   - 코드상 `bg-white`이나, 상위 배경/오버레이/투명도 조합 때문에 사용자 체감이 다를 수 있음.
   - 실제 기기(모바일/데스크톱)에서 스크린샷 비교 필요.
2. **텍스트 대비 전수 점검**
   - "목록으로 돌아가기", "추천 뉴스", "현재 감정 상태", "업로드 날짜" 등.
   - 배경 명도 변화에 따라 대비가 흔들리는지 확인.

### P1 (품질 개선)
1. 모달 내부 정렬 일관성 최종 다듬기
   - 이미지/제목/본문/추천/하단 버튼의 기준선 통일
2. 카드 색 구간의 사용자 인지 테스트
   - 50~80 밀집 구간에서 구분감 재검토
3. 추천 카드 모바일 높이 추가 압축 여부 검토

### P2 (기술 정리)
1. 색상 알고리즘을 별도 유틸 파일로 분리
2. 모달 스타일 토큰화(overlay/panel/text)
3. 시각 회귀 테스트 스냅샷 체계 도입

---

## 4) 시도했지만 실패/불완전했던 방법들

1. **hover 기반 하단 버튼 노출 방식**
   - 문제: 마우스 이탈 후 다시 안 보이는 케이스 발생.
   - 조치: 항상 노출 방식으로 전환.

2. **과도한 진색 팔레트 적용**
   - 문제: 팔레트 범위를 넘는 체감 + 텍스트 가독성 저하.
   - 조치: saturation/lightness 상한/하한 제한 + neutral 분기 도입.

3. **gravity 색 자동 계산에만 의존**
   - 문제: 회색 대신 붉은 기운 발생.
   - 조치: 저채도 색상은 회색 고정 팔레트로 강제.

4. **환경 제약으로 완전한 통합 테스트 불가**
   - `npm run dev`: Supabase/Google OAuth env 누락으로 실패
   - `npm run lint`, `npm test`: 스크립트 미정의
   - 대안: `npm run build` + vite 단독 실행 + Playwright 모의 데이터 검증

---

## 5) 다음 AI를 위한 빠른 실행 체크리스트

1. 먼저 읽을 파일
- `AGENTS.md`
- `client/src/pages/emotion.tsx`
- `client/src/components/NewsDetailModal.tsx`
- `client/src/lib/store.ts`

2. 재현 루트
- `/emotion/:type` 진입
- 카드 클릭 -> 상세 모달
- 모달 하단 추천 카드 클릭 -> 모달 기사 전환 + 필요시 외부 카테고리 라우트 변경
- 목록으로 돌아가기 가독성/정렬 확인

3. 색상 검증 포인트
- `gravity`가 반드시 회색 톤으로 유지되는지
- intensity 50/65/78 기준으로 카드 구분감이 충분한지

4. 반응형 검증 포인트
- 모바일: 추천 카드 가로형 컴팩트
- 데스크톱: 카테고리 버튼 1열 유지

---

## 6) 변경 시 권장 원칙
- 시각 요소는 "컬러 추가"보다 "대비/여백/정렬" 우선.
- 동적 텍스트 색은 최소한의 규칙(밝은 배경/어두운 배경)으로 단순 유지.
- 동일 목적 스타일은 중복 정의하지 말고 함수/토큰으로 집약.
- 사용자 불만이 반복되는 영역(추천 섹션 배경, CTA 가독성)은 스크린샷 증빙과 함께 수정.

