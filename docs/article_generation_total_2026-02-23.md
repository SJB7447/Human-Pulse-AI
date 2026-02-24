# HueBrief Article Generation Total Baseline (KR/EN) - 2026-02-23 (Revised)

본 문서는 아래 기준을 단일 실행 문서로 통합한 최신본입니다.  
This is the revised single-source baseline for implementation.

- Source 1: `docs/HueBrief_Emotion_Mapping_V3.md` (사용자 제공 원문 반영)
- Source 2: `docs/HueBrief_Unified_Spec.md`

---

## 0) Scope and Intent / 범위와 목적

### KR
- 감정 카테고리 기준, 프롬프트 작성 기준, 금지사항, 필수 제한조건, 품질/안전 게이트를 한 문서로 통합합니다.
- 감정 키는 기사 사실 관계를 바꾸지 않으며, 표현 전략(자극도/밀도/톤)만 조절합니다.

### EN
- This document unifies emotion policy, prompt rules, prohibitions, hard constraints, and gates.
- Emotion keys never alter facts; they only control presentation strategy (stimulation, density, tone).

---

## 1) Canonical Principles / 정식 원칙

1. Emotion key is a UX layer, not a news-topic limitation system.
2. Emotion key must not induce content bias in factual selection.
3. Emotion affects only expression strength, narrative density, and stimulation.
4. External references are context-only; no copy or structural mimicry.
5. `spectrum` is a balance mode, not an independent category.
6. AI generation is allowed only with valid crawled reference articles (URL/source required).

---

## 2) Emotion Mapping (V3 Updated Baseline, Canonical) / 감정 매핑 기준

HueBrief의 감정 컬러 시스템은 뉴스 주제를 제한하기 위한 분류 체계가 아니라,  
사용자의 정서적 수용 상태에 맞춰 정보의 자극도·설명 밀도·톤을 조절하는 UX 레이어이다.

Emotion keys do not control factual truth of articles.

## 2.1 immersion (Red - Immersion / Alertness)
- 감정 의미: 열정, 긴장, 주의 집중, 즉각적 관심
- Emotion meaning: passion, tension, focused attention, immediate engagement
- 제공 카테고리(권장): 정치, 속보/긴급 이슈, 사회 갈등/공적 논쟁, 노동/시위/정책 충돌
- Recommended categories: politics, breaking/urgent issues, social conflicts/public disputes, labor/protests/policy collisions
- 운영 원칙:
  - 과도한 선동/단정 표현 금지
  - 감정 자극 프레이밍 강화 금지

## 2.2 clarity (Blue - Clarity / Cognitive Stability)
- 감정 의미: 신뢰, 차분, 이성, 분석적 수용
- Emotion meaning: trust, calmness, reason, analytical reception
- 제공 카테고리(권장): 심층 분석/해설, 경제/정책 분석, 데이터 기반 리포트, 산업/기술 동향
- Recommended categories: deep analysis/explainers, economy/policy analysis, data-driven reports, industry/tech trends
- 운영 원칙:
  - 설명 중심 서술 구조
  - 과잉 감정 표현 최소화

## 2.3 serenity (Green - Serenity / Recovery)
- 감정 의미: 안정, 회복, 긴장 완화, 심리적 휴식
- Emotion meaning: stability, recovery, tension relief, psychological rest
- 제공 카테고리(권장): 환경/기후/자연, 건강/웰빙/생활 안정, 지역/커뮤니티/휴먼 스토리, 스트레스 완화형 정보
- Recommended categories: environment/climate/nature, health/wellbeing/life stability, local/community/human stories, stress-relief info
- 운영 원칙:
  - 자극적 사건 중심 서술 지양
  - 회복/균형 중심 톤 유지

## 2.4 vibrance (Yellow - Vibrance / Positive Activation)
- 감정 의미: 기쁨, 활력, 긍정 정서, 가벼운 몰입
- Emotion meaning: joy, vitality, positive affect, light engagement
- 제공 카테고리(권장): 미담/선행/긍정 뉴스, 연예/문화/콘텐츠 소식, 축제/행사/즐길거리, 라이프스타일/취미/여가, 스포츠 하이라이트(긍정 톤)
- Recommended categories: positive stories, entertainment/culture/content, festivals/events, lifestyle/hobby/leisure, sports highlights (positive tone)
- 운영 원칙:
  - 과장된 희망 서사 금지
  - 정보 왜곡형 긍정 프레이밍 금지

## 2.5 gravity (Gray - Gravity / Reflection)
- 감정 의미: 차분, 무게감, 성찰, 현실 인지 모드
- Emotion meaning: calm weight, reflection, reality-recognition mode
- 제공 카테고리(권장): 사건사고/재난, 범죄/수사/사회 안전, 심층 리포트/원인 분석
- Recommended categories: incidents/disasters, crime/investigation/public safety, deep reports/root-cause analysis
- 운영 원칙:
  - 선정적/공포 조장 표현 금지
  - 과다 소비 방지 UX 적용 가능

## 2.6 spectrum (Gradient - Spectrum / Balance Mode)
- 감정 의미: 중립, 다양성, 균형적 정보 탐색
- Emotion meaning: neutrality, diversity, balanced exploration
- 정의(중요): `spectrum`은 독립 카테고리가 아니다.
- 동작 방식:
  - immersion/clarity/serenity/vibrance/gravity 각 모드 대표 이슈 샘플링
  - 중복 제거 후 균형 재정렬
  - 최종 기사 리스트 구성
- 운영 원칙:
  - 특정 감정 카테고리 편중 금지
  - 다양성 유지가 핵심 목적

---

## 3) Emotion -> AI Tone Rules (Critical Layer) / 감정별 AI 기사 생성 톤 규칙

HueBrief AI는 감정 상태를 정보 왜곡에 사용하지 않으며, 표현 강도/서술 밀도/자극도만 조절한다.

## 3.1 immersion (Red)
- 단정적 표현 최소화
- 선동형 표현 금지
- 공포/분노 유도 문장 금지

## 3.2 clarity (Blue)
- 설명 중심 서술
- 비유/수사 최소화
- 감정적 강조 억제

## 3.3 serenity (Green)
- 자극 표현 억제
- 안정/회복 중심 톤
- 위협/불안 증폭 금지

## 3.4 vibrance (Yellow)
- 과장된 긍정 금지
- 가벼운 정보 톤 유지
- 광고/홍보 톤 금지

## 3.5 gravity (Gray)
- 선정적 표현 금지
- 팩트 중심 절제 톤
- 공포 조장 금지

설계 요약: Emotion Key는 기사 내용이 아니라 AI 표현 전략에만 영향을 준다.

---

## 4) Prompt Writing Baseline / 작성 프롬프트 기준

## 4.1 Required Prompt Blocks / 필수 블록
1. System invariants: fact-first, no-copy, JSON-only
2. Real-time issue grounding: latest issue context + evidence metadata
3. Emotion control profile: tone/density/stimulation only
4. Output schema contract: strict field contract
5. Safety/compliance block: exaggeration/defamation/unsupported-claim block

## 4.2 Emotion Prompt Parameter Profiles / 감정별 파라미터 프로필
- immersion: `temperature=low-mid`, `assertiveness=mid-high`, `stimulation_cap=medium`
- clarity: `temperature=low`, `assertiveness=high`, `rhetoric_penalty=high`
- serenity: `temperature=low`, `assertiveness=low-mid`, `alarmism_penalty=high`
- vibrance: `temperature=mid`, `assertiveness=mid`, `hype_penalty=high`
- gravity: `temperature=low`, `assertiveness=high`, `sensationalism_penalty=high`

---

## 5) Prohibited Items / 금지사항

1. 감정 키를 근거로 사실을 변경하는 지시 금지
2. 원문 기사 문장 흐름/문단 리듬 재현 금지
3. 선정적 공포/분노 유도 헤드라인 금지
4. 광고성/홍보성 톤, 과장형 단정 금지
5. 출처 없는 수치/주장 생성 금지
6. fallback 결과를 정상 생성물처럼 표기 금지

---

## 6) Mandatory Hard Constraints / 필수 제한 조건

1. Output format: strict JSON only
2. Required fields (minimum):
- `title`
- `content`
- `emotion`
- `sourceCitation[]` (title, source, url)
- `fallbackUsed`
- `reasonCode` (on fallback/block)
3. Gate order: `parse -> schema -> similarity -> compliance`
4. Gate fail must return actionable `issues[]` and `reasonCode`
5. Fallback/blocked 결과는 정상 기사로 저장 금지
6. `sourceCitation.url`은 반드시 수집된 레퍼런스 URL 집합 안에서만 허용
7. 레퍼런스(제목/요약) 문구를 제목/본문에 그대로 복붙하면 게이트 차단
8. 유효한 크롤링 레퍼런스가 없으면 생성 중단(`reference_unavailable`)

---

## 7) V2 Reform TODO / v2 개편 TODO

## 7.1 P0
1. `/api/ai/generate-news`에 `sourceCitation[]` 필수화
2. emotion-news 품질 게이트(duplication/evidence/density) 도입
3. gate 실패 시 명확한 block/fallback reason code 반환
4. UI 라벨 분리: `AI Generated (Verified)` / `Fallback Recovery`
5. fallback/blocked 저장 차단 회귀 테스트 추가

## 7.2 P1
1. 프롬프트 UTF-8 정상화 + KR/EN 템플릿 분리
2. 감정 프로필 레지스트리 단일 소스화
3. 실시간 이슈 수집 실패 진단코드 표준화
4. admin `aiNewsOps` 지표 확장

## 7.3 P2
1. 카테고리별 금지 프레이밍 매트릭스 도입
2. emotion-news 경로 compliance 서브게이트 강화
3. 7d/30d 품질 추세 대시보드 구축
4. 문서/프롬프트/테스트 동기화 자동 점검 스크립트

---

## 8) Execution Backlog / 실행 백로그

1. `server/routes.ts`: generate-news contract/gate response 강화
2. `server/services/articlePrompt.ts`: emotion profile registry + prompt blocks 정규화
3. `server/services/newsCron.ts`: real-time issue diagnostics 표준화
4. `client/src/services/gemini.ts`: `reasonCode/issues` 전달 일관화
5. `client/src/pages/emotion.tsx`: fallback/verified 라벨 및 저장 정책 UX 반영
6. `client/src/pages/admin.tsx`: aiNewsOps 지표 카드/추세 노출
7. `scripts/ai_news_regression.ts`: blocked/fallback/contract 회귀 케이스 추가
8. `docs/article_generation_contract_v1.md`: 필드/게이트 최신화
9. `docs/article_generation_tickets_v1.md`: P0~P2 작업항목 동기화

---

## 9) Acceptance Criteria / 수용 기준

1. 저장 가능한 모든 AI 기사에 `sourceCitation[]`가 존재한다.
2. gate 실패 결과는 저장되지 않고 원인 코드가 사용자/관리자에 노출된다.
3. 감정별 톤 차이는 유지되며 사실성/근거 품질은 감정과 무관하게 동일 기준을 만족한다.
4. fallback 비율, gate 차단율, parse 실패율을 관리자에서 확인 가능하다.
5. 생성 기사의 citation URL은 모두 크롤링 레퍼런스와 매칭된다.
6. 레퍼런스 복붙 탐지 시 결과는 차단되고 reason code가 반환된다.
