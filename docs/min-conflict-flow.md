# 충돌 최소화 브랜치 플로우 (고정 템플릿)

이 문서는 Human Pulse AI에서 반복 충돌을 줄이기 위한 **기본 협업 규칙**입니다.

## 1) 브랜치 시작 규칙
- 항상 `main` 최신 동기화 후 작업 시작

```bash
git checkout main
git fetch origin
git pull --ff-only origin main
```

- 작업 브랜치 생성 (한 브랜치 = 한 목표)

```bash
git checkout -b feat/<scope>-<short-topic>
```

예시:
- `feat/emotion-modal-scroll-lock`
- `fix/admin-login-redirect`
- `chore/vercel-cron-schedule`

---

## 2) PR 분할 기준 (작게, 명확하게)
한 PR에는 아래 중 **1개 목표만** 포함합니다.

- 기능 추가 1개
- 버그 수정 1개
- UI/UX 개선 1개
- 리팩터링 1개

### 금지
- UI + 서버 로직 + 인프라 설정을 한 PR에 혼합
- unrelated 파일 대량 변경

---

## 3) Rebase 타이밍 (작업 전/머지 전 2회)

### A. 작업 시작 전
```bash
git fetch origin
git rebase origin/main
```

### B. PR 머지 직전(또는 리뷰 반영 후)
```bash
git fetch origin
git rebase origin/main
```

충돌 발생 시:
1. GitHub `Accept both changes` 대신 로컬에서 수동 편집
2. 충돌 파일 확인 후 테스트
3. 이어서 rebase 완료

```bash
git status
# 충돌 파일 수동 수정
git add <resolved-files>
git rebase --continue
```

---

## 4) 충돌 해결 원칙
- 웹 에디터 자동해결(`Accept both`) 지양
- 아래 파일은 특히 로컬에서 검증 후 해결
  - `vercel.json`
  - `package.json`
  - `client/src/pages/*.tsx`
  - `server/routes.ts`

---

## 5) 푸시 전 필수 검증
```bash
npm run build
```

권장:
```bash
npm run dev
```

`lint`/`test` 스크립트가 없는 경우, 스크립트 부재 사실을 PR 본문에 명시합니다.

---

## 6) PR 머지 방식
가능하면 **Rebase and merge**를 우선 사용합니다.

- 히스토리 단순화
- merge commit 난립 방지
- 원인 추적 용이

---

## 7) 권장 PR 제목 포맷
`<type>: <scope> <summary>`

예시:
- `fix: admin redirect unauthenticated users to login`
- `feat: emotion add centered balance-navigation cards`
- `chore: align vercel cron schedule`

---

## 8) 5단계 빠른 체크리스트
1. feature 브랜치 생성
2. 작업 전 `fetch + rebase`
3. 작업 완료 후 `fetch + rebase`
4. `npm run build` 통과
5. PR은 `Rebase and merge`
