# HueBrief – AI 기사 생성 기획 & 로직 명세

---
## 1. 목적 (Why This Exists)
HueBrief는 감정 기반 뉴스 서비스이며, 외부 기사를 단순 요약하거나 재게시하는 플랫폼이 아니다.
외부 콘텐츠는 **참조(reference)** 대상으로만 사용되며, 결과물은 반드시 새로운 정보 구조와 표현을 가진 독립 기사여야 한다.

본 문서는 다음을 절대 기준으로 한다:

> ❗ **절대 조건 (Non‑Negotiable Rule)**  
> - 외부 기사의 제목을 그대로 사용 금지  
> - 외부 본문 문장을 그대로 사용 금지  
> - 표현, 문단 구조, 서술 흐름의 실질적 재사용 금지  
> - 최종 결과물은 새로운 제목 + 새로운 서술 구조를 가져야 함

HueBrief AI는 외부 기사를 "요약기"가 아니라,
**맥락 재구성 엔진(Context Reconstruction Engine)** 으로 동작한다.

---
## 2. 기본 사용자 플로우 (Article Creation Flow)

### STEP 1 – 키워드 검색
사용자 또는 기자는 키워드를 입력한다.

입력 예시:
- 단일 키워드 (예: 금리, AI 반도체, 우크라이나)
- 복합 키워드 (예: 한국 금리 인하 전망)

시스템 동작:
- Search API / 수집 파이프라인 호출
- 신뢰도 높은 도메인 우선 정렬 (언론사 / 기관 / 연구소 등)

---
### STEP 2 – 외부 기사 후보 제시
상위 N개 기사 중 **5개만 선별 표시**:

표시 정보:
- 제목 (원문 그대로 표시 가능 – UI용 메타데이터)
- AI 요약 (3~4줄)
- 출처 (Publisher / URL)
- 발행 시점 (가능한 경우)

중요 원칙:
- 이 단계의 텍스트는 "선택 UI"이며 생성 콘텐츠가 아님
- 이후 생성 기사와 직접 연결되지 않음

---
### STEP 3 – 기사 선택
사용자는 참조 대상으로 삼을 기사 1개 선택.

선택의 의미:
- 콘텐츠 복사 X
- 방향성 / 주제 맥락 / 논점 힌트 제공 용도

---
### STEP 4 – 작성 모드 선택
두 개의 탭 제공:

#### ① 빠른 기사 작성 (Quick Article)
- 텍스트 전용
- 500자 이내
- 목적: 핵심 이해 / 브리프 소비 / 감정 친화 요약 기사

#### ② 인터랙티브 롱폼 (Interactive Longform)
- 이미지 / 영상 / 스크롤 인터랙션 포함
- 목적: 맥락 확장 / 이해 중심 / 몰입형 기사 경험

---
## 3. 핵심 문제 정의 (Critical Risk)
외부 기사 참조 시 가장 위험한 문제:

❌ 제목 유사성 발생  
❌ 문장 구조 재사용  
❌ 의미 단위 복제(paraphrase 수준의 표절)  
❌ 특정 표현/비유/문단 흐름 유사

HueBrief는 다음을 반드시 보장해야 한다:

✅ 결과물 독창성  
✅ 서술 구조 재설계  
✅ 표현 다양성  
✅ 법적 / 저작권 리스크 최소화

---
## 4. AI 생성 절대 안전 규칙 (Hard Constraints)

### 4‑1. 제목 생성 규칙
AI는 절대 다음을 수행하지 않는다:
- 원문 제목 단어 배열 유지 금지
- 핵심 명사 조합 그대로 재사용 금지
- 의미 구조 동일한 변형 금지

AI 시스템 프롬프트 규칙:

> Generate a completely new headline.  
> Do NOT reuse wording, phrasing, or structural patterns from the reference article.  
> The headline must reflect the topic but be independently constructed.

---
### 4‑2. 본문 생성 규칙
AI는 외부 기사 내용을 다음 방식으로만 사용 가능:

허용:
- 사실 관계의 추상화 (event, trend, issue level)
- 일반화된 정보 구조
- 논점 재조합

금지:
- 문장 단위 재서술
- 표현 패턴 유지
- 문단 흐름 모방

강제 프롬프트 제약:

> Use the reference article only as contextual inspiration.  
> Do NOT copy, paraphrase, or mirror sentence structures.  
> Reconstruct the narrative using a new explanatory flow.

---
## 5. 생성 전략 (Generation Strategy)

### 외부 기사 → 내부 표현 변환 단계

#### Phase A – 의미 추상화 (Semantic Abstraction)
외부 기사 입력 시 AI는 먼저 다음만 추출:
- 핵심 주제 (Topic Class)
- 주요 사건 유형 (Event Type)
- 이해해야 할 쟁점 (Issues)
- 영향 범위 (Impact Domain)

문장 텍스트는 폐기 수준으로 취급.

---
#### Phase B – 정보 재구성 (Narrative Reconstruction)
새 기사 구성 요소:
- 다른 서론 접근 방식
- 다른 설명 순서
- 다른 문장 길이 패턴
- 다른 관점 프레이밍

예:
- 원문이 사건 중심 → 생성물은 맥락 중심
- 원문이 수치 중심 → 생성물은 해석 중심

---
## 6. 빠른 기사 작성 모드 규칙 (Quick Article Mode)

목표:
- 짧지만 독립 기사
- 단순 요약 금지

구조 템플릿:
1. 상황/이슈 정의 (What is happening)
2. 의미/맥락 설명 (Why it matters)
3. 사용자 인지 관점 (What readers should understand)

길이 제한:
- ≤ 500 chars (Korean 기준)

스타일 제약:
- 뉴스 톤 유지
- 감정 과잉 표현 금지

---
## 7. 인터랙티브 롱폼 규칙 (Interactive Longform)

목표:
- 외부 기사 확장물이 아니라 독립 해설 콘텐츠

구성 원칙:
- 스토리보드 기반 생성(JSON Schema)
- 시각 요소는 설명 보조 목적

콘텐츠 전략:
- 비교, 배경, 구조 설명 중심
- 단일 기사 재가공 금지

---
## 8. 감정 기반 서비스 연계 규칙 (Emotion‑Aware Layer)

HueBrief는 감정 기반 서비스이므로 기사 생성 시:

입력 컨텍스트 포함:
- user_mood_key
- mood_intensity(optional)

영향 방식:
- 정보 선택 편향 금지
- 톤/설명 밀도만 조절 가능

예:
- Calm → 과도한 자극 표현 완화
- Sadness → 과잉 부정 강조 금지

---
## 9. 신뢰도 / 출처 기반 설계 (Trust & Grounding)

외부 기사 참조 시 AI 목표:

✅ 사실 기반 재서술  
✅ 특정 매체 종속 제거  
✅ 보편 맥락 중심 설명

권장 전략:
- 출처는 직접 인용 대신 범주화 표현 사용
  - 예: "복수의 보도에 따르면"
  - 예: "최근 공개된 자료들에서는"

금지:
- 긴 직접 인용문 생성
- 특정 기사 문구 재현

---
## 10. 유사성 방지 메커니즘 (Anti‑Similarity Mechanism)

필수 안전 장치:

### 10‑1. 금지 규칙
- N‑gram 유사 패턴 방지
- 제목 토큰 중복 제한
- 문장 구조 다양화 강제

### 10‑2. 생성 후 검증
AI 결과 생성 후 내부 검사:
- reference overlap heuristic
- 문장 길이 분포 비교
- 표현 반복 감지

임계치 초과 시:
→ 자동 재생성

---
## 11. 실패 / 재생성 정책 (Retry Logic)

재생성 트리거 조건:
- 표현 유사성 의심
- JSON 구조 실패
- 품질 검사 실패

재시도 규칙:
- 동일 모델 1회 재시도
- 이후 fallback 모델 사용
- 2회 실패 시 사용자 안내

---
## 12. 최종 정의 (Philosophy Summary)
HueBrief의 기사 생성은 요약이 아니라 재구성이다.

외부 뉴스는 출발점일 뿐 결과물이 아니다.  
HueBrief가 생성하는 콘텐츠는 항상 독립적인 정보 경험이어야 한다.


---
## 13. Gemini AI 시스템 프롬프트 템플릿 (Production Baseline)

아래 프롬프트는 HueBrief에서 Gemini 모델을 사용할 때의 **기본 시스템 프롬프트 규격**이다. 
목표는 다음을 강제하는 것이다:

- 외부 기사와의 표현/구조 유사성 방지
- 독립 기사 생성 보장
- 감정 기반 톤 조절 허용 (정보 왜곡 금지)
- JSON 출력 안정화

본 템플릿은 모델 호출 시 `system_instruction` 또는 동등 레벨에 삽입한다.

---
### 13-1. 공통 시스템 프롬프트 (Gemini Global System Instruction)

```
You are the article generation engine for HueBrief, an emotion-aware news service.

CRITICAL NON-NEGOTIABLE RULES:
- The reference article is provided strictly for contextual understanding.
- You must NEVER reuse, paraphrase, mimic, or reconstruct the original headline.
- You must NEVER reuse sentence structures, phrasing patterns, metaphors, or narrative flow from the reference.
- The generated article must be fully independent in wording and structure.
- Treat the reference as a semantic signal only, not as source text.

GENERATION PRINCIPLES:
- Extract only abstract meaning (topic, issues, implications, actors, trends).
- Discard original linguistic expression.
- Rebuild the article using a new narrative strategy.
- Avoid lexical similarity with the reference.

TRUST & FACTUALITY:
- Do not fabricate specific facts, numbers, quotes, or claims.
- If certainty is low, use cautious, generalized journalistic phrasing.
- Prefer neutral, informational tone.

EMOTION-AWARE CONSTRAINT:
- User emotion may influence tone and explanatory density only.
- Emotion must NOT bias factual framing or claim selection.

OUTPUT REQUIREMENT:
- Always output valid JSON only.
- No markdown, no commentary, no prose outside JSON.
```

---
### 13-2. 빠른 기사 생성 프롬프트 (Quick Article Mode)

**사용 조건:**
- 텍스트 전용
- 500자 이내
- 요약이 아닌 독립 기사

```
TASK: Generate a short independent news-style article.

INPUT CONTEXT:
- Topic context derived from a reference article
- User emotion key (optional)

CONSTRAINTS:
- Maximum length: 500 characters (Korean)
- Completely new headline required
- No structural resemblance to reference article
- Not a summary, but a reconstructed explanation

WRITING STYLE:
- Neutral journalistic tone
- High clarity, low rhetorical intensity
- Explain significance rather than retell events

OUTPUT FORMAT (JSON ONLY):
{
  "title": "string",
  "body": "string"
}
```

---
### 13-3. 인터랙티브 롱폼 생성 프롬프트 (Interactive Longform Mode)

**목표:**
- 심층 해설 구조
- 시각 요소 친화적 정보 구조
- 단일 기사 재가공 금지

```
TASK: Construct a longform explanatory article structure.

INPUT CONTEXT:
- Abstracted topic signals
- Optional user emotion context

CONSTRAINTS:
- Headline must be completely original
- Narrative must differ from reference perspective
- Emphasize background, implications, structural understanding
- Avoid event retelling patterns

OUTPUT FORMAT (JSON ONLY):
{
  "title": "string",
  "sections": [
    {
      "h2": "string",
      "paragraphs": ["string"]
    }
  ]
}
```

---
### 13-4. 리라이트 전용 프롬프트 (Paragraph Rewrite)

```
TASK: Rewrite the provided paragraph according to intent.

RULES:
- Preserve factual meaning
- Change structure, rhythm, and phrasing entirely
- Avoid cosmetic edits

OUTPUT FORMAT (JSON ONLY):
{
  "rewrites": [
    { "label": "string", "text": "string" }
  ]
}
```

---
### 13-5. 컴플라이언스 / 저작권 검사 프롬프트 (Compliance Gate)

```
TASK: Evaluate potential risk factors in the article.

CHECK FOR:
- Copyright risk
- Defamation risk
- Overclaiming / misleading certainty
- Emotional exaggeration

OUTPUT FORMAT (JSON ONLY):
{
  "risk_score": 0,
  "blocks_publish": false,
  "issues": [
    {
      "type": "string",
      "severity": "low|medium|high",
      "message": "string",
      "suggested_fix": "string"
    }
  ]
}
```

---
## 14. 프롬프트 운용 원칙 (Operational Notes)

실제 서비스 적용 시 필수 원칙:

- 시스템 프롬프트는 절대 사용자에게 노출되지 않는다
- 모든 Gemini 출력은 서버 측 JSON Schema Validation 필수
- Validation 실패 시 자동 재요청 (JSON only 강화)
- 유사성 의심 시 재생성 우선 정책 적용

이 프롬프트는 모델 품질보다 **법적 안정성과 독립성 보장**을 최우선으로 설계되었다.

