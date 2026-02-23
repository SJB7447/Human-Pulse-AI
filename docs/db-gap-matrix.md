# DB Gap Matrix (Draft)

기준: 기능정의서 DB-01~DB-17 vs 현재 `shared/schema.ts` + `migrations/*.sql` + 서버 사용 테이블

| 정의서 ID | 정의 테이블/영역 | 현재 상태 | 근거 | 갭 | 조치안 |
|---|---|---|---|---|---|
| DB-01 | Auth + RBAC | 부분구현 | `users`, `profiles` 사용, role request API 존재 | auth 세부정책(OTP/락아웃/세션복구) 미흡 | AUTH API/테이블 확장 |
| DB-02 | profiles | 부분구현 | server에서 `profiles` 조회/업서트 사용 | 스키마 파일에 직접 정의 없음 | shared schema 정합화 |
| DB-03 | guest_sessions | 미구현 | 정의/마이그레이션 없음 | 게스트 세션 보관 정책 미구현 | 신규 migration + API |
| DB-04 | articles(news_items) | 구현 | `shared/schema.ts` newsItems, `migrations/001` | 세부 인덱스/제약 보강 필요 | 인덱스/검증 보강 |
| DB-05 | interactive_contents | 미구현/부분 | 인터랙티브 JSON 생성 API는 존재 | 저장 테이블 없음 | 테이블+저장 API 추가 |
| DB-06 | emotion_logs | 부분구현 | interactions/emotion 기반 데이터 존재 | 분리 로그 모델 미흡 | 이벤트 스키마 정규화 |
| DB-07 | guest_emotion_logs | 미구현 | 테이블 정의 없음 | 개인정보 보관정책 미구현 | 신규 테이블/정리잡 |
| DB-08 | analytics_events | 미구현 | 표준 이벤트 저장 테이블 없음 | 이벤트 적재 불가 | 공통 analytics_events 도입 |
| DB-09 | feedback | 미구현 | 전용 테이블 없음 | 피드백 루프 부재 | feedback 테이블 추가 |
| DB-10 | saves | 부분구현 | `saves` 카운트 필드 존재 | 사용자별 save 이력 없음 | junction 테이블 추가 |
| DB-11 | insights | 부분구현 | Add Insight 기능/커뮤니티 포스트 존재 | 전용 insight 도메인 모델 약함 | insights 스키마 분리 |
| DB-12 | mypage_cards | 미구현 | mypage는 있으나 카드 모델 불명확 | 개인화 정합성 낮음 | mypage_cards 도입 |
| DB-13 | pipeline_jobs | 미구현 | Journalist 파이프라인 상태 전용 테이블 없음 | 재시도/추적 취약 | jobs 테이블 추가 |
| DB-14 | quality_reports | 미구현/부분 | admin report는 있으나 품질 리포트 분리 부족 | 품질지표 정규화 필요 | quality_reports 추가 |
| DB-15 | distribution_logs | 미구현 | 배포 결과 로그 전용 테이블 없음 | 멀티플랫폼 추적 약함 | distribution_logs 추가 |
| DB-16 | reports | 구현 | `shared/schema.ts` reports | report 유형 확장 필요 | enum/type 보강 |
| DB-17 | assets | 미구현 | 업로드/생성 결과 저장 표준 없음 | 미디어 자산 추적 부족 | assets 테이블 추가 |

## 즉시 우선순위
1. `guest_sessions`, `analytics_events`, `pipeline_jobs`
2. `saves` 사용자별 이력, `insights` 정규화
3. `quality_reports`, `distribution_logs`, `assets`
