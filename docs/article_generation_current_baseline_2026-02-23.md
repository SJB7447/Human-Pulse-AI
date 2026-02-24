# Article Generation Baseline + V2 Plan (KR/EN), 2026-02-23

이 문서는 현재 코드 기준 기사 생성 정책과 v2 개편 계획을 한 파일로 통합한 운영 문서입니다.  
This document consolidates the current article-generation baseline and the v2 reform plan in one file.

---

## 1) Scope / 범위

### 1.1 Emotion AI News / 감정 페이지 AI 뉴스
- `POST /api/ai/generate-news`
- `POST /api/ai/search-keyword-news`

### 1.2 Journalist Draft Pipeline / 기자 포털 초안 파이프라인
- `POST /api/ai/analyze-keyword`
- `POST /api/ai/generate-outline`
- `POST /api/ai/generate-draft`
- `POST /api/ai/compliance-check`

### 1.3 Interactive Spec / 인터랙티브 스펙
- `POST /api/ai/generate/interactive-article`

---

## 2) Current Baseline: Emotion AI News / 현재 기준: 감정 AI 뉴스

### 2.1 Access Control / 권한
- KR: `generate-news`는 `x-actor-role`이 `journalist | admin`일 때만 허용.
- EN: `generate-news` is allowed only when `x-actor-role` is `journalist | admin`.
- Error: `403`, code `AI_NEWS_FORBIDDEN`.

### 2.2 Emotion Mapping / 감정 매핑
- `vibrance`
  - KR: 경제/창업/문화
  - EN: economy/startup/culture
  - keywords: `청년 창업`, `스타트업 투자`, `문화 산업 트렌드`
- `immersion`
  - KR: 정치/사회 이슈
  - EN: politics/social
  - keywords: `정책 논쟁`, `사회 갈등`, `노동 이슈`
- `clarity`
  - KR: 테크/산업 분석
  - EN: tech/industry analysis
  - keywords: `AI 산업`, `반도체 시장`, `디지털 정책`
- `gravity`
  - KR: 안전/리스크
  - EN: safety/risk
  - keywords: `금융 리스크`, `보건 정책`, `기후 재난`
- `serenity`
  - KR: 생활/웰빙
  - EN: life/wellbeing
  - keywords: `헬스케어 트렌드`, `생활 물가`, `지역 복지`
- `spectrum`
  - KR: 종합 시사
  - EN: general current affairs
  - keywords: `국내 시사`, `국제 뉴스`, `산업 정책`

### 2.3 Real-time Issue Fetch Rule / 실시간 이슈 수집 규칙
- KR: 감정별 키워드(최대 3개)로 Google News RSS 검색 후, 중복 제거(url+title), 상위 3개 이슈를 사용.
- EN: For up to 3 keywords per emotion, fetch Google News RSS, deduplicate by `url+title`, and use top 3 issues.
- KR: RSS 실패/파싱 실패 시 fallback 이슈를 사용.
- EN: On RSS failure/parse-empty, fallback issue list is used.

### 2.4 Prompt Contract (`/api/ai/generate-news`) / 프롬프트 계약
- KR: 역할은 뉴스 에디터, 한국어 기사 3건을 JSON only로 생성.
- EN: Role is news editor, generate 3 Korean article items in JSON-only format.
- Required context:
  - `emotion`
  - `category`
  - `realtimeIssues` (title, summary, source, url)
- Required output schema:
  - `items[].title`
  - `items[].summary`
  - `items[].content`
  - `items[].source`
  - `items[].imagePrompt`
- Constraints / 제한:
  - KR: 사실형 문체, 과장/선동 금지.
  - EN: Fact-based tone, no sensational/agitative wording.
  - title target: 18-58 chars
  - summary target: 60-170 chars
  - content target: 3-4 paragraphs
  - imagePrompt in English; no text/watermark overlay intent
  - 3 items should avoid duplication in issue focus

### 2.5 Forbidden / 금지사항
- KR: 실시간 이슈와 무관한 임의 주제 생성 금지.
- EN: No unrelated topics outside provided real-time issue context.
- KR: 근거 없는 사실 단정 금지.
- EN: No unsupported factual claims.
- KR: JSON 외 형식 혼합 금지.
- EN: No non-JSON output format.

### 2.6 Fallback Policy / fallback 정책
- Fallback item must include:
  - `fallbackUsed: true`
  - `reasonCode: string`
- Current reason codes:
  - `AI_NEWS_MODEL_EMPTY`
  - `AI_NEWS_PARSE_FALLBACK`
  - `AI_NEWS_RUNTIME_FALLBACK`
  - `AI_NEWS_REALTIME_FALLBACK`
- Normal generation:
  - `fallbackUsed: false`
  - `reasonCode` omitted

### 2.7 Client Save Rule / 클라이언트 저장 규칙
- KR: `fallbackUsed=true` 항목은 저장하지 않음.
- EN: Items with `fallbackUsed=true` are not saved.
- KR: 전량 fallback이면 저장 중단 + 실패 토스트.
- EN: If all are fallback, save is blocked with failure toast.
- KR: 부분 fallback이면 정상 생성분만 저장 + 안내 토스트.
- EN: If partial fallback, only normal items are saved with partial-result toast.

---

## 3) Current Baseline: Keyword Search / 현재 기준: 키워드 뉴스 검색

### 3.1 Input/Output
- input: `keyword`
- output:
  - `keyword`
  - `articles[]` (`title`, `summary`, `url`, `source`, `publishedAt`)
  - `fallbackUsed`
  - `diagnostics` (on fallback)

### 3.2 Fetch Constraints / 수집 제한
- RSS timeout: 7s
- Request headers: User-Agent, Accept, Accept-Language, Cache-Control
- Failure path: fallback recommendation list

### 3.3 Diagnostics
- `stage`: `external_fetch | rss_parse | unknown`
- `reason`: string
- `status`: optional HTTP status

---

## 4) Current Baseline: Draft Pipeline / 현재 기준: 초안 파이프라인

### 4.1 Input Contract
- `keyword: string`
- `mode: "draft" | "interactive-longform"`
- `selectedArticle: { title, summary, url, source }` (optional)

### 4.2 Output Contract
- `title`
- `content`
- `sections: { core, deepDive, conclusion }`
- `mediaSlots[]`
- `sourceCitation`
- `compliance`
- `fallbackUsed`

### 4.3 Prompt Policy / 프롬프트 정책
- KR: 참고 기사 복사 금지, 맥락만 사용.
- EN: Reference article is context-only, never copy target.
- KR: 한국어 우선, JSON only.
- EN: Korean-first, JSON-only output.
- KR: 모드별 분량/구조 제약 준수.
- EN: Mode-specific length/structure constraints enforced.

### 4.4 Validation Gates
- Parse Gate
- Schema Gate (mode-aware)
- Similarity Gate (headline + lead lexical/structure)
- Compliance Gate (high-risk block)

### 4.5 Draft Error Codes
- `AI_DRAFT_MODEL_EMPTY`
- `AI_DRAFT_PARSE_BLOCKED`
- `AI_DRAFT_EMPTY_BLOCKED`
- `AI_DRAFT_SCHEMA_INVALID`
- `AI_DRAFT_SIMILARITY_BLOCKED`
- `AI_DRAFT_COMPLIANCE_BLOCKED`
- `AI_DRAFT_GENERATION_FAILED`

### 4.6 Configurable Thresholds
- Source: env defaults + admin override
- Admin API: `GET/PUT /api/admin/ai-draft/settings`
- Fields:
  - `titleMaxLength`
  - `draftTargetChars`, `draftMaxChars`
  - `draftMediaSlotsMin`, `draftMediaSlotsMax`
  - `longformMinSentences`
  - `longformMediaSlotsMin`, `longformMediaSlotsMax`
  - `similarityTitleOverlapThreshold`
  - `similarityLexicalOverlapThreshold`
  - `similarityStructureOverlapThreshold`
  - `similarityCombinedThreshold`

---

## 5) Current Baseline: Interactive Spec / 현재 기준: 인터랙티브 스펙

### 5.1 Required
- `keywords` must be non-empty array
- Story Spec JSON must pass validation

### 5.2 Forbidden
- Raw HTML bypass keys blocked: `html`, `rawHtml`, `storyHtml`, `renderedHtml`
- Violation: `400`, `INTERACTIVE_STORY_SPEC_ONLY`

### 5.3 Fallback
- On parse/validation failure, fallback spec + `validationReport` is returned

---

## 6) Prompt Governance / 프롬프트 거버넌스

### 6.1 Text Model
- `GEMINI_TEXT_MODEL` env
- default: `gemini-2.5-flash`

### 6.2 Image Model
- fixed: `gemini-2.5-flash-image`

### 6.3 Key Dependency
- KR: `GEMINI_API_KEY` 없으면 텍스트 생성 경로가 `null`로 떨어져 fallback 확률 증가.
- EN: Without `GEMINI_API_KEY`, text generation returns `null`, increasing fallback probability.

### 6.4 JSON-only Rule
- KR: 모델 응답은 JSON만 허용.
- EN: Model output must be JSON-only.

---

## 7) Ops Baseline / 운영 기준

### 7.1 Draft Telemetry
- `aiDraftOps`:
  - requests, success, retries, fallbackRecoveries
  - parseFailures, schemaBlocks, similarityBlocks, complianceBlocks, modelEmpty
- available at `/api/admin/stats`

### 7.2 News Pipeline Runtime
- `POST /api/admin/news/fetch` (role required)
- `GET /api/cron` (with optional `CRON_SECRET` validation)

---

## 8) V2 Reform TODO / v2 개편 TODO

### 8.1 Generation Quality (P0)
- KR: fallback 텍스트를 템플릿형 문장으로 내리지 않도록, fallback 자체도 이슈별 구조 다양화.
- EN: Make fallback less template-like with issue-specific structure variation.
- KR: 생성 품질 게이트 신설(문장 중복률, 정보량, 근거 문장 비율).
- EN: Add quality gates (duplication ratio, information density, evidence ratio).

### 8.2 Trust and Source (P0)
- KR: 기사별 `sourceCitation[]` 필드 강제(최소 1개 URL+출처).
- EN: Enforce `sourceCitation[]` per article (at least 1 URL + source).
- KR: source가 `HueBrief AI`일 경우에도 근거 이슈 URL 연결.
- EN: Even when source is `HueBrief AI`, attach issue URL evidence.

### 8.3 UX Clarity (P0)
- KR: 카드/상세에서 `AI Generated`와 `Fallback Recovery` 라벨 분리.
- EN: Split labels in UI: `AI Generated` vs `Fallback Recovery`.
- KR: fallback 저장 차단 사유를 코드+가이드로 노출.
- EN: Show fallback block reason with code + guidance.

### 8.4 Prompt Stability (P1)
- KR: `server/services/articlePrompt.ts` 인코딩 노이즈 정리 및 KR/EN 병기 버전 관리.
- EN: Clean encoding noise in `server/services/articlePrompt.ts` and version KR/EN prompt blocks.
- KR: 프롬프트 버전 문자열, 문서, 회귀노트를 동시에 갱신하는 체크리스트화.
- EN: Enforce prompt-change checklist (version string + docs + regression notes).

### 8.5 Pipeline Reliability (P1)
- KR: RSS fetch 캐시(짧은 TTL) 도입으로 외부 실패율 완화.
- EN: Add short-TTL RSS cache to reduce upstream failure sensitivity.
- KR: 뉴스 파이프라인 성공률 지표(`aiNewsOps`)를 admin stats에 포함.
- EN: Add `aiNewsOps` telemetry to admin stats.

### 8.6 Governance and Policy (P2)
- KR: 카테고리별 금지 프레이밍(선정성/과잉 단정/무근거 예측) 룰 테이블화.
- EN: Build category-level forbidden framing rule table.
- KR: 배포 전 자동 정책 검사 스크립트 추가.
- EN: Add pre-release policy regression script.

---

## 9) Execution Backlog / 실행 백로그

## 9.1 P0 (Immediate)
1. Add `sourceCitation[]` to `/api/ai/generate-news` response contract.
2. Add server-side quality gate for generated emotion news.
3. Block persistence when quality gate fails (not only fallback flag).
4. UI label split: normal generation vs fallback recovery.
5. Extend `test:ai-news` to cover quality-gate blocked case.

## 9.2 P1 (Next)
1. Refactor `articlePrompt.ts` into encoding-safe KR/EN prompt templates.
2. Introduce RSS short cache and retry strategy with per-keyword diagnostics.
3. Add `aiNewsOps` counters:
   - requests, success, fallback, qualityBlocks, rssFallbacks, modelEmpty, parseFailures
4. Surface `aiNewsOps` in `/api/admin/stats` and admin page cards.
5. Add pipeline canary endpoint for synthetic health checks.

## 9.3 P2 (Hardening)
1. Create category-specific policy matrix (forbidden claims, allowed framing).
2. Add compliance sub-gate for emotion news generation path.
3. Add 7-day/30-day trend dashboard for news generation reliability.
4. Add release checklist automation (prompt/version/docs/test sync).

## 9.4 Suggested Owners / 권장 담당
- PM: acceptance criteria, release gate definition
- UX: fallback visibility, user messaging, state labels
- Builder: API contract, generation gate, telemetry implementation
- QA: regression matrix, failure injection, release verification

---

## 9.5 2026-02-24 Policy Update / 정책 업데이트
- KR:
  - 모든 AI 생성 뉴스/기사는 유효한 크롤링 레퍼런스(URL/출처) 없이는 생성 금지.
  - `sourceCitation.url`은 제공된 레퍼런스 URL 집합 내 값만 허용.
  - 레퍼런스 제목/요약 복붙(제목/본문) 탐지 시 생성 차단.
- EN:
  - AI generation is blocked when valid crawled references are unavailable.
  - `sourceCitation.url` must stay within the provided reference URL set.
  - Title/body verbatim reuse from reference title/summary is blocked by gate.

---

## 10) References / 참고 코드
- `server/routes.ts`
- `server/services/articlePrompt.ts`
- `server/services/newsCron.ts`
- `client/src/pages/emotion.tsx`
- `client/src/services/gemini.ts`
- `docs/article_generation_contract_v1.md`
- `docs/article_generation_tickets_v1.md`
