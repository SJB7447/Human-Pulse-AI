# HueBrief – Emotion-Aware News & AI Generation Specification (Unified Edition)

---
## 1. Philosophy of HueBrief

HueBrief는 뉴스 카테고리 서비스가 아니다.  
HueBrief는 **감정 기반 인지 경험 시스템(Emotion-Aware Cognitive Interface)** 이다.

감정 컬러 시스템의 목적:

- 뉴스 주제 편향 ❌
- 정보 소비 속도 조절 ✅
- 자극도 / 설명 밀도 최적화 ✅
- 둠스크롤 완화 ✅
- 심리적 균형 유지 ✅

Emotion Key는 콘텐츠 필터가 아니라 **UX / 표현 전략 레이어**로 정의된다.

---
## 2. Emotion Mapping (V3 Stable Baseline)

### 🔴 immersion (Red – Alertness / Attention Activation)

감정 의미  
열정, 긴장, 즉각적 주의, 관심 집중

권장 카테고리  
- 정치 / 정책 충돌
- 속보 / 긴급 이슈
- 사회 갈등 / 논쟁
- 공적 충돌 이슈

핵심 UX 의도  
→ 중요도 높은 정보에 대한 인지 각성 유도

---

### 🔵 clarity (Blue – Cognitive Stability / Analytical Mode)

감정 의미  
차분, 신뢰, 분석 수용 상태

권장 카테고리  
- 심층 분석 / 해설
- 경제 / 정책 분석
- 데이터 기반 리포트
- 산업 / 기술 동향

핵심 UX 의도  
→ 이해 중심 정보 처리 모드

---

### 🟢 serenity (Green – Recovery / Low-Stimulation Mode)

감정 의미  
안정, 회복, 긴장 완화

권장 카테고리  
- 환경 / 자연 / 기후
- 건강 / 웰빙 / 생활 안정
- 지역 / 커뮤니티
- 회복 친화 정보

핵심 UX 의도  
→ 인지 피로 완화 / 감정 환기

---

### 🟡 vibrance (Yellow – Positive Activation / Light Engagement)

감정 의미  
기쁨, 활력, 가벼운 몰입

권장 카테고리  
- 미담 / 선행 / 긍정 뉴스
- 연예 / 문화 / 콘텐츠
- 축제 / 행사 / 즐길거리
- 라이프스타일 / 취미 / 스포츠 하이라이트

핵심 UX 의도  
→ 긍정 정서 확장 / 가벼운 소비 경험

---

### ⚪ gravity (Gray – Reflection / Emotional Weight Mode)

감정 의미  
차분, 무게감, 성찰 상태

권장 카테고리  
- 사건사고 / 재난
- 범죄 / 사회 안전
- 심층 리포트 / 구조 분석

핵심 UX 의도  
→ 자극 억제 + 현실 인지 모드

---

### 🌈 spectrum (Gradient – Balance / Diversity Mode)

정의 (중요)  
`spectrum`은 독립 카테고리가 아니다.

동작 방식  
- 5가지 감정 모드에서 균형 샘플링
- 중복 제거
- 다양성 유지 재정렬

핵심 UX 의도  
→ 편향 없는 균형적 정보 탐색

---
## 3. Emotion → AI 기사 생성 톤 규칙

Emotion은 사실이 아니라 **표현 전략에만 영향**을 준다.

### immersion (Red)
- 단정적 표현 제한
- 선동형 어휘 금지
- 공포/분노 유도 문장 금지

### clarity (Blue)
- 설명 중심 구조
- 비유/수사 최소화
- 감정 강조 억제

### serenity (Green)
- 자극 표현 최소화
- 안정/회복 톤 유지
- 위협 프레이밍 금지

### vibrance (Yellow)
- 과장된 긍정 금지
- 광고/홍보 톤 금지
- 경쾌하지만 뉴스 톤 유지

### gravity (Gray)
- 선정적 표현 금지
- 공포 조장 금지
- 팩트 중심 절제 톤

---
## 4. Emotion → Prompt Parameter Strategy (Model Control Layer)

Emotion Key는 모델 파라미터 조절에 사용 가능.

| Emotion | Temperature | Verbosity | Lexical Variation | Assertiveness |
|--------|-------------|-----------|-------------------|---------------|
| immersion | 낮음~중간 | 중간 | 높음 | 낮음 |
| clarity   | 낮음 | 높음 | 중간 | 매우 낮음 |
| serenity  | 낮음 | 중간 | 중간 | 매우 낮음 |
| vibrance  | 중간 | 낮음~중간 | 높음 | 낮음 |
| gravity   | 낮음 | 중간 | 중간 | 매우 낮음 |

설계 원칙:

- 높은 감정 ≠ 높은 temperature
- 감정 UX 안정성 우선

---
## 5. External Article Reference Policy (Critical Safety)

외부 기사는 참조(reference) 대상일 뿐 생성 소스가 아니다.

절대 규칙:

- 동일 제목 생성 금지
- 문장 구조 재사용 금지
- 의미 단위 복제 금지
- 표현 패턴 유사성 금지

AI는 의미 추상화 → 서술 재구성만 수행한다.

---
## 6. Article Generation Modes

### Quick Article
- 텍스트 전용
- ≤ 500자
- 요약 금지 / 독립 기사 구조 유지

구조:
1. 이슈 정의
2. 맥락 설명
3. 이해 포인트

---

### Interactive Longform
- 독립 해설 구조
- 시각 요소 친화 설계
- 단일 기사 재가공 금지

구조:
- 배경 / 구조 / 영향 중심

---
## 7. Spectrum Mode Logic

Spectrum은 새 카테고리 생성 없이 구현 가능.

권장 로직:

1. 각 감정 모드에서 대표 이슈 선택
2. diversity constraint 적용
3. 중복 제거
4. 균형 재정렬

---
## 8. Risk & Compliance Gate

모든 AI 생성 콘텐츠는 검수 대상.

검사 항목:

- 저작권 유사성 위험
- 명예훼손 가능성
- 과도 단정 표현
- 감정 과잉 프레이밍

임계치 초과 시 → 재생성

---
## 9. Final Definition

HueBrief의 감정 시스템은 정보 왜곡 장치가 아니다.  
HueBrief의 감정 시스템은 **인지 부하 조절 인터페이스**이다.

Emotion → Tone / Density / Stimulation Control  
Emotion → Fact Selection Control ❌
