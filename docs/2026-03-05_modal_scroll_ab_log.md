# 2026-03-05 상세 모달 스크롤 후반부 점검 로그 (TODO 2)

## 목적
- 상세 모달 하단 추천 섹션 진입 시점의 지연 재현 케이스를 3종으로 고정 기록한다.
- `IntersectionObserver threshold`를 `0.15 ~ 0.35` 범위에서 A/B 점검한다.

## 실행 설정
- 기본 threshold: `0.25`
- 쿼리 파라미터 오버라이드: `?ioThreshold=0.15` / `?ioThreshold=0.35`
- 로컬스토리지 오버라이드: `localStorage.setItem('huebrief:io-threshold', '0.35')`
- DEV 콘솔 로그 키: `[NewsDetailModal][IO-AB]`

## 재현 케이스 3종 (기록 템플릿)
1. PC 데스크톱 1440px: 본문 끝까지 1회 연속 스크롤
2. 모바일 390px: 빠른 플릭 3회 + 멈춤 반복
3. 모바일 390px: 추천 카드 클릭으로 기사 전환 후 즉시 하단 재스크롤

## 기록 양식
| Case | Device/Viewport | Threshold | elapsedMs | ratio | Result | Notes |
|---|---|---:|---:|---:|---|---|
| C1 | PC 1440x900 | 0.15 | TBD | TBD | Pending | 첫 진입 측정 |
| C1 | PC 1440x900 | 0.25 | TBD | TBD | Pending | 기본값 비교 |
| C1 | PC 1440x900 | 0.35 | TBD | TBD | Pending | 민감도 비교 |
| C2 | Mobile 390x844 | 0.15 | TBD | TBD | Pending | 플릭 스크롤 |
| C2 | Mobile 390x844 | 0.25 | TBD | TBD | Pending | 기본값 비교 |
| C2 | Mobile 390x844 | 0.35 | TBD | TBD | Pending | 민감도 비교 |
| C3 | Mobile 390x844 | 0.15 | TBD | TBD | Pending | 기사 전환 후 재진입 |
| C3 | Mobile 390x844 | 0.25 | TBD | TBD | Pending | 기본값 비교 |
| C3 | Mobile 390x844 | 0.35 | TBD | TBD | Pending | 민감도 비교 |

## 판정 기준
- 동일 케이스에서 `elapsedMs`가 가장 낮고, 오탐(너무 이른 진입) 없이 안정적인 threshold를 채택.
- 기본 운영값은 `0.25` 유지, 필요 시 `0.15` 또는 `0.35`로 변경.
