# Human Pulse AI 현재 서비스 문서

기준 일자: 2026-03-12

이 문서는 현재 저장소에 구현되어 있는 기능을 기준으로 서비스 구조와 사용자 흐름을 정리한 운영 문서다. 기획 의도나 향후 확장안이 아니라, `client/`, `server/`, `shared/`에 실제 반영된 상태만 요약한다.

## 1. 서비스 한 줄 설명

Human Pulse AI는 감정 기반 뉴스 탐색, AI 기사 작성, 독자 인사이트 저장, 커뮤니티 공유, 관리자 운영을 하나의 흐름으로 묶은 인터랙티브 뉴스 서비스다.

핵심 구성은 다음 5개 축으로 정리된다.

1. 홈 3D 감정 진입 경험
2. 감정별 뉴스 탐색과 상세 읽기
3. 기자용 AI 작성/발행 워크플로
4. 독자용 인사이트 저장, 의견 기사 작성, 커뮤니티 공유
5. 관리자용 운영/검수/알림/내보내기 대시보드

## 2. 정보 구조

### 공개 사용자 영역

- `/`
  - 3D 감정 구체를 통해 감정 카테고리로 진입
- `/emotion/:type`
  - 감정별 뉴스 목록, 필터/정렬, 상세 모달, 관련 기사 추천
- `/community`
  - 사용자 의견 게시, 임시저장, 댓글/공감, 게시글 수정
- `/pricing`
  - 구독 상태 및 프리미엄 안내
- `/login`
  - 로그인, 회원가입, OTP 기반 보조 인증, 계정 찾기/비밀번호 재설정

### 로그인 사용자 영역

- `/mypage`
  - 저장 기사, 인사이트 기록, 내가 쓴 기사, SNS 연결 목업
- `/settings`
  - 보호 라우트, 로그인 필요

### 역할 기반 영역

- `/journalist`, `/reporter`
  - 기자/관리자 전용 작성 도구
- `/admin`
  - 관리자 전용 운영 대시보드

## 3. 사용자 경험 흐름

### 3.1 홈

- React Three Fiber 기반 `Scene`이 감정 구체와 파티클을 렌더링한다.
- 사용자는 감정 구체를 선택해 감정 뉴스 페이지로 이동한다.
- 전역 보조 UI로 `HueBot`이 관리자/기자 화면을 제외한 일반 화면에 지연 로드된다.

### 3.2 감정 뉴스 페이지

- 감정 타입은 `vibrance`, `immersion`, `clarity`, `gravity`, `serenity`, `spectrum` 6종이다.
- 뉴스 카드에서 검색, 출처 필터, 정렬, 무한 스크롤이 제공된다.
- 카드 클릭 시 상세 모달이 열리고 저장/공유/AI 변형/연관 기사 탐색 흐름이 이어진다.
- 특정 감정을 오래 소비하면 peripheral nudge가 동작해 다른 감정 기사나 HueBot 탐색을 유도한다.
- 게스트도 입장 가능하며, 입장 시 guest session이 생성되고 일부 행동이 analytics로 기록된다.

### 3.3 마이페이지

- 저장 기사 탭은 현재 목업 데이터 기반이다.
- 인사이트 탭은 기사에 남긴 감정 태그/코멘트를 불러와 통계 차트와 함께 보여준다.
- 내가 쓴 기사 탭은 독자 의견 기반 AI 생성 기사 저장본을 보여주며 수정/삭제/재승인 요청이 가능하다.
- 설정 탭은 프로필/SNS 연결 UI를 제공하며 SNS 연결은 현재 목업 성격이 강하다.

### 3.4 커뮤니티

- 로그인 사용자는 감정과 짧은 의견을 게시할 수 있다.
- 게스트는 게시 대신 임시저장까지만 가능하다.
- 게시글 상세에서 댓글 등록, 수정, 삭제, 공감 기능을 사용할 수 있다.
- 작성자 본인 또는 관리자는 게시글과 댓글을 수정할 수 있다.
- 공유는 Web Share API 또는 클립보드 복사 방식으로 처리된다.

### 3.5 로그인/회원가입

- Supabase Auth 기반 이메일/비밀번호 로그인/회원가입이 구현되어 있다.
- 회원가입 시 역할 선택, 휴대폰 OTP 데모 인증, 필수 약관 동의가 포함된다.
- OAuth 버튼은 Google/Kakao/Naver 진입점을 제공한다.
- 데모 로그인으로 일반/기자/관리자 역할을 빠르게 체험할 수 있다.
- 계정 찾기와 비밀번호 재설정은 OTP 데모 플로우를 통해 처리된다.

### 3.6 기자 포털

- 키워드 검색 -> 관련 기사 탐색 -> 개요/초안 생성 -> 다듬기 -> 미디어 배치 -> 발행 순서의 작성 플로우가 구현되어 있다.
- AI 기능 예시는 다음과 같다.
  - 키워드 분석
  - 관련 뉴스 검색
  - 아웃라인 생성
  - 초안 생성
  - 섹션/문단 재생성
  - 문법 점검
  - 제목 최적화
  - 해시태그 생성
  - 컴플라이언스 체크
  - 감정 분석
  - 번역
  - 이미지 생성
  - 영상 스크립트 생성 및 영상 생성
- 발행 플랫폼은 interactive, instagram, youtube, threads를 기준으로 구성되어 있다.
- 기사 저장, 수정, 목록 조회, 일괄 삭제 등의 기사 관리 UI가 포함된다.
- 기사 미디어는 로컬 업로드 또는 AI 생성 후 `api/media/upload`를 통해 Supabase Storage로 올릴 수 있다.

### 3.7 관리자

- 운영 탭
  - 전체 통계
  - AI 뉴스/AI 초안 상태
  - 알림 요약
  - 내보내기 이력 및 스케줄
  - AI 타임아웃 설정
- 기사 탭
  - 기사 목록/검색/페이지네이션
  - 기사 공개/숨김/삭제
  - 감정/카테고리 재분류
  - 본문/요약/출처/이미지 수정
  - AI 이미지 재생성
  - 자동 진단 이슈 확인
  - 검수 이슈/메모 관리
- 독자 작성 기사 승인/반려와 리포트 관리 기능도 포함된다.

## 4. 백엔드 구조

### 런타임

- Express 서버: `server/`
- Vercel serverless 진입점: `api/`
- 개발 서버는 `npm run dev`로 `server/index.ts`를 실행한다.

### 주요 API 그룹

#### 콘텐츠/뉴스

- `GET /api/news`
- `GET /api/news/:emotion`
- `GET /api/articles`
- `POST /api/articles`
- `PUT /api/articles/:id`
- `DELETE /api/articles/:id`
- `POST /api/interact/view/:id`
- `POST /api/interact/save/:id`

#### 커뮤니티/독자 활동

- `GET /api/community`
- `POST /api/community`
- `GET /api/community/:id/comments`
- `POST /api/community/:id/comments`
- `PUT /api/community/:id/comments/:commentId`
- `DELETE /api/community/:id/comments/:commentId`
- `POST /api/community/:id/comments/:commentId/like`
- `PUT /api/community/:id`
- `GET /api/mypage/insights`
- `POST /api/mypage/insights`
- `GET /api/mypage/composed-articles`
- `POST /api/mypage/composed-articles`
- `PUT /api/mypage/composed-articles/:id`
- `POST /api/mypage/composed-articles/:id/resubmit`

#### 인증/세션/권한

- `POST /api/guest/start`
- `GET /api/session/mood`
- `POST /api/emotion/checkin`
- `POST /api/auth/phone/resend`
- `POST /api/auth/phone/verify`
- `POST /api/auth/consent`
- `POST /api/auth/find-id`
- `POST /api/auth/reset-password/request`
- `POST /api/auth/reset-password/confirm`
- `POST /api/auth/change-password`
- `GET /api/role-requests`
- `POST /api/role-requests`
- `POST /api/role-requests/:id/decision`

#### AI 기능

- `POST /api/ai/generate-news`
- `POST /api/ai/summarize-article`
- `POST /api/ai/recommend-related`
- `POST /api/ai/generate/interactive-article`
- `POST /api/ai/chat`
- `POST /api/ai/analyze-keyword`
- `POST /api/ai/search-keyword-news`
- `POST /api/ai/generate-outline`
- `POST /api/ai/generate-draft`
- `POST /api/ai/regenerate-draft-section`
- `POST /api/ai/regenerate-draft-paragraph`
- `POST /api/ai/check-grammar`
- `POST /api/ai/share-keyword-pack`
- `POST /api/ai/generate-hashtags`
- `POST /api/ai/optimize-titles`
- `POST /api/ai/compliance-check`
- `POST /api/ai/analyze-sentiment`
- `POST /api/ai/translate`
- `POST /api/ai/generate-image`
- `POST /api/ai/generate-video-script`
- `POST /api/ai/generate-video`

#### 운영/관리

- `GET /api/admin/stats`
- `GET /api/admin/ai/news-health`
- `GET/PUT /api/admin/ai/news/settings`
- `GET/PUT /api/admin/ai-draft/settings`
- `GET/POST /api/admin/reports`
- `PUT /api/admin/reports/:reportId/status`
- `GET /api/admin/reviews`
- `PUT /api/admin/reviews/:articleId`
- `POST /api/admin/reviews/:articleId/issues`
- `GET /api/admin/action-logs`
- `GET /api/admin/alerts`
- `GET /api/admin/alerts/summary`
- `POST /api/admin/alerts/test`
- `GET /api/admin/exports/history`
- `GET/PUT /api/admin/exports/schedule`
- `POST /api/admin/exports/run`
- `POST /api/admin/news/fetch`
- `GET /api/cron`

#### 공유/미디어

- `POST /api/share/short-links`
- `POST /api/media/upload`
- `GET /api/media/object`

## 5. 데이터 모델 요약

`shared/schema.ts` 기준 핵심 테이블은 아래와 같다.

- `news_items`
  - 기사 본문, 감정, 강도, 공개 상태, 작성자, 조회/저장 수
- `reports`
  - 기사 신고 및 제재 상태
- `article_reviews`
  - 관리자 검수 완료 여부, 이슈, 메모
- `user_consents`
  - 약관/개인정보 동의 이력
- `admin_action_logs`
  - 관리자 액션 로그
- `user_insights`
  - 독자 인사이트, 코멘트, 태그
- `user_composed_articles`
  - 독자 의견 기반 생성 기사 및 승인 상태
- `guest_sessions`
  - 게스트 식별과 마지막 감정 상태
- `emotion_logs`, `guest_emotion_logs`
  - 감정 체크인 로그
- `analytics_events`
  - 행동 이벤트 로그

## 6. AI 및 렌더링 원칙

- 기사 인터랙션 렌더링은 raw HTML보다 Story Spec JSON 우선 원칙을 따른다.
- `schemas/story_spec_v1.json`, `shared/interactiveArticle.ts`, `client/src/components/StoryRenderer.tsx`가 관련 축이다.
- 서버는 AI 초안/AI 뉴스 운영 메트릭을 파일 및 관리자 로그로 축적한다.
- 이미지/영상 생성 결과는 기사 메타 블록 또는 미디어 스토리지 경로와 함께 저장된다.

## 7. 현재 구현에서 주의할 점

### 실서비스 수준으로 구현된 영역

- 감정별 뉴스 열람
- 기자 포털의 AI 작성/발행 플로우
- 관리자 운영/검수/알림 UI
- 독자 인사이트/커뮤니티 CRUD
- Supabase Auth 연동

### 목업 또는 하이브리드 저장이 섞인 영역

- 마이페이지의 저장 기사 탭은 목업 데이터가 남아 있다.
- 일부 사용자 데이터는 서버 실패 시 `localStorage` fallback을 사용한다.
- SNS 연결은 현재 저장/복원 중심의 목업 단계다.
- 프리미엄/과금은 API와 화면은 존재하지만 실제 결제 연동 문맥은 제한적이다.
- OTP는 데모 플로우 성격이 강하다.

## 8. 개발 및 검증 기준

### 기본 실행

```bash
npm run dev
```

### 기본 검증

```bash
npm run lint
npm test
```

현재 `lint`와 `test`는 모두 TypeScript 타입 검사를 기준으로 연결되어 있다.

### 추가 회귀 스크립트

- `npm run test:encoding`
- `npm run test:ai-safety`
- `npm run test:ai-draft`
- `npm run test:ai-news`
- `npm run test:recommendation-mix`
- `npm run test:article-sync`
- `npm run test:ops-admin`
- `npm run test:ops-alert`

## 9. 문서 활용 권장 방식

- 서비스 소개서가 필요하면 이 문서를 기준으로 사용자/운영자용 문서를 분리한다.
- API 명세가 필요하면 이 문서를 출발점으로 엔드포인트별 request/response 문서를 별도 작성한다.
- QA/UAT 문서와 연결할 때는 `docs/` 내 회귀 체크리스트 문서를 보조 근거로 사용한다.
