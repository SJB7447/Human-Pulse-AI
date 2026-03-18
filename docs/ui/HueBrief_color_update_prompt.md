# HueBrief 컬러 시스템 업데이트 — Codex 바이브코딩 프롬프트

---

## PROMPT — 전체 컬러 토큰 교체

```
HueBrief 서비스의 컬러 시스템 전체를 아래 기준으로 업데이트해줘.

---

## 1. 감정 카테고리 메인 컬러 (5가지)

아래 표를 기준으로 변경이 있는 항목만 교체해줘.
변수명/상수명은 그대로 유지하고, 색상값(hex)만 교체할 것.

| 카테고리 id | 기존 hex  | 새 hex   | 변경 여부 |
|------------|----------|----------|----------|
| immersion  | #f4606b  | #F4606B  | 동일 — 건드리지 말 것 |
| vibrance   | #ffd150  | #FFB052  | 변경 |
| serenity   | #88d84a  | #4FA86A  | 변경 |
| clarity    | #3f65ef  | #4275E5  | 변경 |
| gravity    | #bababa  | #898989  | 변경 |

---

## 2. 카테고리 컬러 스텝 (LOW / MID)

메인 컬러와 별도로, LOW/MID 스텝 컬러도 아래 값으로 모두 교체해줘.
immersion은 메인 컬러는 동일하지만 LOW/MID 스텝은 변경됨에 주의할 것.

| 카테고리   | 기존 LOW  | 새 LOW   | 기존 MID  | 새 MID   |
|-----------|----------|----------|----------|----------|
| immersion | #ffc7ce  | #F7DADE  | #ff97a9  | #F4A4A9  |
| vibrance  | #ffedc5  | #FFE7C0  | #ffe197  | #F9CE80  |
| serenity  | #caf2a7  | #C1EAD1  | #adef73  | #8ECBA0  |
| clarity   | #cad8ff  | #CBD8F4  | #8dabff  | #88A3EF  |
| gravity   | #e5e5e5  | #E0E0E0  | #d1d1d1  | #B5B5B5  |

---

## 3. 텍스트 컬러 규칙

### 필수 고정값 (이 값은 반드시 유지)
- 메인 텍스트: #232221
  → 서비스 전체의 기본 텍스트 컬러로 사용되는 모든 곳에 적용
  → 예: 기사 제목, 본문, 일반 UI 텍스트

### 나머지 텍스트 컬러 (가독성 우선 원칙)
메인 텍스트 외 모든 텍스트는 무채색 계열로, 배경 컬러에 따라 가독성을 최우선으로 결정해줘.

아래 원칙을 적용할 것:

**밝은 배경 (흰색, LOW 스텝 계열) 위의 텍스트:**
- 보조 텍스트(sub text): #999898
- 비활성 텍스트(disabled): #D6D6D6

**감정 메인 컬러 배경 위의 텍스트 — 컬러별 개별 지정:**
- immersion(#F4606B): 흰색 #FFFFFF
- serenity(#4FA86A): 흰색 #FFFFFF
- clarity(#4275E5): 흰색 #FFFFFF
- gravity(#898989): 흰색 #FFFFFF
- vibrance(#FFB052): 어두운 무채색 #3A3A3A
  ※ 오렌지/앰버 계열은 흰 텍스트 대비비가 낮으므로 반드시 어두운 색 사용

**LOW 스텝 배경 (연한 컬러) 위의 텍스트:**
- #3A3A3A 사용 (감정 컬러 그대로 쓰지 말 것)

**MID 스텝 배경 위의 텍스트:**
- WCAG AA 기준 (대비비 4.5:1 이상)을 충족하는 쪽으로 선택
- #FFFFFF 또는 #3A3A3A 중 대비비가 높은 쪽 적용

---

## 4. 기타 특수 컬러 (값 확인 후 없으면 추가)

| 변수명          | hex      | 용도                   |
|----------------|----------|------------------------|
| TEAL_LOGO      | #00ABAF  | 로고 및 브랜드 포인트   |
| VIOLET         | #A773F9  | 보조 강조 컬러          |
| SUB_COLOR      | #FC8D6B  | 서브 컬러 옵션          |

---

## 5. 수정 범위

아래 항목을 모두 찾아서 교체해줘:

1. 감정 카테고리 상수/토큰 정의 파일
   - color(메인), lightColor(LOW), midColor(MID) 등 hex값 전체

2. Tailwind config (tailwind.config.ts 또는 tailwind.config.js)
   - extend.colors 안의 감정 카테고리 컬러값

3. CSS 변수 정의 파일 (있다면)
   - :root 또는 [data-theme] 안의 감정 컬러 변수

4. 텍스트 컬러가 하드코딩된 컴포넌트
   - 감정 배경 위에 텍스트 컬러가 하드코딩된 경우 위 규칙에 맞게 수정

5. 기타 감정 컬러 hex값이 직접 사용된 모든 파일

---

## 주의사항

- DB 스키마, API 파라미터, 변수명(id)은 절대 변경하지 말 것
- 색상값(hex)과 텍스트 컬러만 교체
- immersion 메인 컬러(#F4606B)는 변경 없음 — LOW/MID 스텝만 교체
- 수정한 파일 목록과 변경된 항목을 마지막에 표로 정리해서 보여줄 것
```

---

## 완료 후 확인 체크리스트

### 메인 컬러
- [ ] immersion 메인 #F4606B — 변경 없이 유지되었는가
- [ ] vibrance 메인 → #FFB052 교체되었는가
- [ ] serenity 메인 → #4FA86A 교체되었는가
- [ ] clarity 메인 → #4275E5 교체되었는가
- [ ] gravity 메인 → #898989 교체되었는가

### LOW / MID 스텝
- [ ] immersion LOW → #F7DADE / MID → #F4A4A9 교체되었는가
- [ ] vibrance LOW → #FFE7C0 / MID → #F9CE80 교체되었는가
- [ ] serenity LOW → #C1EAD1 / MID → #8ECBA0 교체되었는가
- [ ] clarity LOW → #CBD8F4 / MID → #88A3EF 교체되었는가
- [ ] gravity LOW → #E0E0E0 / MID → #B5B5B5 교체되었는가

### 텍스트 컬러
- [ ] 메인 텍스트 #232221이 전체에 적용되었는가
- [ ] vibrance 배경 위 텍스트가 #3A3A3A로 설정되었는가
- [ ] 나머지 4개 감정 메인 배경 위 텍스트가 #FFFFFF인가

### 적용 범위
- [ ] Tailwind config에 반영되었는가
- [ ] CSS 변수 파일에 반영되었는가 (있는 경우)
- [ ] 수정 파일 목록이 정리되었는가

---

*HueBrief 컬러 시스템 업데이트 프롬프트 | Color Guide v2 기준*
