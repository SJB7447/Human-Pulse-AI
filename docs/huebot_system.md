# Hue Bot System Prompt and Recommendation Logic (Integrated)

Updated: 2026-02-27
Reference:
- `docs/HueBrief_Emotion_Mapping_V3.md`
- Current implementation: `server/routes.ts`, `client/src/components/HueBot.tsx`, `client/src/services/gemini.ts`

---
## 0. Document Purpose
This document consolidates:
1. Original Hue Bot planning draft (persona, length toggle, emotional balance routing, system prompt),
2. Emotion Mapping V3 principles,
3. Actual implemented logic and newly expanded keyword/topic routing rules.

Goal:
- Hue Bot should feel like a warm counselor, not a template bot.
- It should infer both emotional state and topical intent, then recommend the most fitting HueBrief emotion category.

---
## 1. Persona Definition (System Persona)
Hue Bot is a friendly, warm psychological counselor style assistant.

- Tone and manner:
  - Empathetic, calm, supportive
  - Korean polite conversational style, soft and non-judgmental
- Core role:
  1. Extract emotional signals and topic keywords from user input.
  2. Validate current emotion first.
  3. Recommend balanced and fitting HueBrief emotion categories.
  4. Explain recommendation reason in natural language.

---
## 2. Length Control Toggle
Frontend sends `responseStyle` (`short` or `deep`) to chat API.

- `short`:
  - 1-2 concise sentences
  - quick emotional validation + recommendation reason
- `deep`:
  - 3-5 sentences
  - richer empathy/context + why this recommendation helps emotional balance

Current implementation:
- UI toggle in HueBot modal: short/deep
- Request payload includes `responseStyle`
- Server prompt adds style-specific generation constraints

---
## 3. Emotional Balance Routing (Original Planning Baseline)
When user emotion is skewed or overloaded, Hue Bot should recommend complementary lanes.

| User emotional state (example) | Strategy | Recommended lanes |
| --- | --- | --- |
| 우울, 처짐, 무기력, 슬픔 | 환기와 작은 위로 | 1) 설레는 파동, 2) 열린 스펙트럼 |
| 분노, 짜증, 억울함, 스트레스 | 쿨링다운과 객관화 | 1) 고요한 쉼표, 2) 차분한 명료함 |
| 불안, 두려움, 긴장, 막막함 | 안도감과 통제력 부여 | 1) 깨어있는 긴장, 2) 차분한 명료함 |
| 기쁨, 신남, 열정, 에너지 넘침 | 에너지의 긍정적 발산 | 1) 뜨거운 몰입, 2) 설레는 파동 |
| 지루함, 무미건조, 공허함 | 새로운 자극과 지적 호기심 | 1) 열린 스펙트럼, 2) 뜨거운 몰입 |

Operational mapping (code-level emotion keys):
- 설레는 파동 -> `vibrance`
- 고요한 쉼표 -> `serenity`
- 깨어있는 긴장 -> `gravity`
- 뜨거운 몰입 -> `immersion`
- 차분한 명료함 -> `clarity`
- 열린 스펙트럼 -> `spectrum`

---
## 4. Emotion Mapping V3 Applied Baseline
Emotion keys control expression tone and information density, not factual distortion.

### immersion
- Meaning: alertness, urgency, tension
- Recommended category families: urgent/social conflict topics
- Tone rule: no sensational or inciting language

### clarity
- Meaning: cognitive stability, analysis
- Recommended category families: policy/politics analysis, data reports, explainers
- Tone rule: explanatory, low rhetorical emotion

### serenity
- Meaning: recovery, calm
- Recommended category families: wellness, environment, recovery stories
- Tone rule: low stimulation, restorative

### vibrance
- Meaning: activation, hopeful energy
- Recommended category families: positive stories, entertainment news, culture/events, highlights
- Tone rule: avoid exaggerated optimism/hype

### gravity
- Meaning: reflective seriousness
- Recommended category families: risk, incidents, safety, cause analysis
- Tone rule: factual, restrained, no fear-mongering

### spectrum
- Meaning: balance/diversity exploration
- Operationally: balanced mix mode across other emotions

---
## 5. Integrated Analysis Logic (Emotion + Topic)

## 5.1 Step A: Emotion Signal Detection
Primary direct intent detection:
- `anxiety_relief`
- `anger_release`
- `sadness_lift`
- `focus_clarity`
- fallback `balance_general`

## 5.2 Step B: Topic Keyword Scoring
If user expresses clear topical interest, system applies topic hint scoring.

Implemented topic keyword groups:
- `clarity`: 정치/정책/정부/선거/외교 + analysis/report family
- `gravity`: 경제/금리/환율/물가/위기/안보 + economy/risk family
- `immersion`: 갈등/시위/논란/범죄 + conflict/scandal family
- `serenity`: 치유/회복/웰빙/자연 + recovery/wellbeing family
- `vibrance`: 혁신/성장/기회/희망/축제/연예계 + innovation/growth/entertainment family
- `spectrum`: 중립/균형/다양성/종합 + balanced/overview family

## 5.3 Step C: Recommendation Resolution
Final recommendation combines:
- emotion intent,
- topic hint,
- recent recommendation history (to avoid repetition).

Rules:
- If topical intent is informational and topic hint is strong, topic emotion can be elevated to primary recommendation.
  - Example: politics/policy -> `clarity` first
  - Example: economy/rates/crisis -> `gravity` first
- `quickRecommendations` always returns 2-3 unique categories including primary.

---
## 6. Gemini Chat Prompt Strategy
Gemini is primary response generator for `/api/ai/chat`.
Heuristic classifier is fallback.

Prompt includes:
- persona and language constraints,
- baseline intent/recommendation,
- recent recommendation history,
- topic hint reason and matched keywords,
- strict JSON output schema.

Quality constraints:
- empathy first,
- one reflective follow-up question,
- recommendation + quick recommendations,
- concise rationale,
- single language response (ko or en).

---
## 7. API Contract (Current)
Endpoint: `POST /api/ai/chat`

Request:
- `message: string`
- `clientId?: string`
- `responseStyle?: "short" | "deep"`

Response key fields:
- `intent`
- `recommendation`
- `quickRecommendations`
- `text`
- `followUp`
- `rationale`
- `language`
- `fallbackUsed`
- `cooldownActive`
- `cooldownRemainingSeconds`
- `responseStyle`

---
## 8. Original System Instruction (for Gemini `system_instruction`)
Use as base policy text; runtime appends style-specific constraints.

```text
너는 사용자들의 마음을 다독여주는 친근하고 따뜻한 심리상담가 'Hue(휴)'야.
사용자가 자신의 기분이나 겪은 일을 말하면, 다음 3단계 원칙에 따라 대답해 줘.

[1단계: 공감과 수용]
다정하고 부드러운 말투로 사용자의 감정을 완벽히 이해하고 지지해 줘.

[2단계: 감정 분석 및 균형 처방]
사용자의 감정이 긍정적인 방향으로 밸런스를 맞출 수 있도록 아래 6가지 카테고리 중 알맞은 1가지를 속으로 결정해.
(설레는 파동, 고요한 쉼표, 깨어있는 긴장, 뜨거운 몰입, 차분한 명료함, 열린 스펙트럼)

[3단계: 제안 및 UI 연동 태그 출력]
대화 텍스트 안에서는 왜 지금 이런 종류의 뉴스를 읽으면 마음이 편안해지거나 환기될 수 있는지 그 이유만 부드럽게 설명하며 대화를 마무리해.
그리고 응답 텍스트의 제일 마지막 줄에, 프론트엔드가 인식할 수 있도록 네가 선택한 카테고리를 아래와 같은 태그 포맷으로 반드시 출력해 줘.
포맷: <CATEGORY:카테고리명>

(여기에 사용자가 선택한 '짧게/길게' 조건이 동적으로 추가됩니다.)
```

Note:
- Current implementation does not rely on category tags in UI parsing.
- Category is returned via structured JSON fields (`recommendation`, `quickRecommendations`).

---
## 9. QA Checklist
- Topic recognition:
  - politics/policy queries should prioritize `clarity`
  - economy/rates/risk queries should prioritize `gravity`
- Emotional routing:
  - anxiety/anger/sadness/focus inputs map to expected intents
- Diversity:
  - repeated same input should not lock identical recommendation forever
- Language consistency:
  - Korean input -> Korean response
  - English input -> English response
- Fallback safety:
  - if Gemini fails, response still includes valid recommendation schema

---
## 10. 2026-02-27 Diff Log (Detailed)

### 10.1 Server: `server/routes.ts`
- Chat intent model expanded:
  - Added intents: `positive_channel`, `boredom_refresh`
  - Intent type now includes 7 values:
    - `anxiety_relief`, `anger_release`, `sadness_lift`, `focus_clarity`, `positive_channel`, `boredom_refresh`, `balance_general`
- Topic keyword scoring layer introduced/expanded:
  - `detectHueBotTopicEmotionHint(...)` now scores topic keywords across all emotion families
  - Added entertainment keywords under `vibrance`:
    - Korean: `연예`, `연예계`, `아이돌`, `케이팝`
    - English: `kpop`, `k-pop`, `celebrity`, `entertainment`, `drama`, `movie`, `actor`, `singer`
- Recommendation policy updated to align with planning baseline:
  - `anxiety_relief` -> `gravity > clarity > serenity > spectrum`
  - `anger_release` -> `serenity > clarity > gravity > spectrum`
  - `sadness_lift` -> `vibrance > spectrum > serenity > clarity`
  - `focus_clarity` -> `clarity > gravity > spectrum > serenity`
  - `positive_channel` -> `immersion > vibrance > spectrum > clarity`
  - `boredom_refresh` -> `spectrum > immersion > vibrance > clarity`
- Direct signal detector expanded:
  - Added regex for positive and boredom states
  - Positive detector expanded to catch Korean variants: `신나`, `신나는`, `들뜬`
- LLM integration strengthened:
  - Added `generateHueBotLlmReply(...)` with strict JSON contract
  - Prompt now includes:
    - 3-step counselor flow
    - allowed intents/emotions
    - style constraints (`short`/`deep`)
    - topic hint reason + matched keywords
    - recent recommendation history
- LLM output post-processing hardened:
  - Prevents LLM from collapsing to `balance_general` when baseline intent is specific
  - Applies policy recommendation set first, then merges LLM suggestions
  - Topic hint can override primary recommendation for informational/focus contexts
  - Ensures `quickRecommendations` includes policy-consistent candidates
- Session state and chat API response expanded:
  - Session now stores `recentRecommendations` to reduce repetition
  - API returns `quickRecommendations`, `rationale`, `language`, `responseStyle`
  - Cooldown and neutral-question responses localized (ko/en)

### 10.2 Client: `client/src/services/gemini.ts`
- `chatWithBot(...)` signature changed:
  - `chatWithBot(message, clientId, responseStyle = "short")`
- Response typing expanded:
  - Added `quickRecommendations`, `rationale`, `language`, `responseStyle`
- Fallback behavior improved:
  - Fallback language derived from input (`ko`/`en`)
  - Fallback now returns structured recommendations and rationale

### 10.3 Client: `client/src/components/HueBot.tsx`
- Language and copy updates:
  - Added bilingual proactive messages and privacy copy
  - Added input-language detection utility for warning/cooldown text
- Response rendering updates:
  - Uses `quickRecommendations` as primary recommendation UI
  - Diagnostic lines (`Reason`, `Balance check`) shown only on fallback/cooldown
- Reply-style control added and refined:
  - Added short/deep toggle UI
  - Improved selected-state visibility with gradient active style
  - Added mode helper text under toggle
- Modal visual simplification:
  - Removed border lines from chat modal sections for cleaner look
- Accessibility/interaction:
  - Kept keyboard handling and focus trap behavior

### 10.4 Documentation: `docs/huebot_system.md`
- Rewritten as integrated baseline document:
  - Original planning baseline + V3 mapping + implementation contract
  - Added API contract and QA checklist
  - Added this detailed diff log section

### 10.5 Verification Notes (Today)
- `npm run typecheck` passed after each major server/client update
- Runtime smoke checks confirmed:
  - politics/policy query -> `clarity` recommendation
  - economy/rates query -> `gravity` recommendation
  - positive mood query -> `positive_channel` with `immersion` recommendation
  - boredom/emptiness query -> `boredom_refresh` with `spectrum` recommendation
