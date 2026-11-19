# NORIVA 웹 (스튜디오 + 독자 앱)

Next.js 16 (App Router) + Tailwind 4 + Drizzle(PostgreSQL). 지금은 1단계로 **관리자 스튜디오**가 들어 있고, 독자 앱은 2단계에서 같은 앱에 더해져요.

## 로컬 실행

```bash
# PostgreSQL 16이 localhost:5432에 있다고 가정 (예: docker run -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16)
createdb -h localhost -U postgres noriva
cp .env.example .env.local
npm run hash-password -- '스튜디오비밀번호'   # 출력된 줄을 .env.local에 붙여 넣기
# SESSION_SECRET에 32자 이상 무작위 문자열 넣기
npm ci
npm run db:migrate
npm run db:seed        # 기본 지침 9종, 금지 표현, 소재 10개
npm run dev            # http://localhost:3000/studio
```

에이전트가 실제로 일하려면 `../worker`의 작업 실행기도 띄워요.

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/db/schema.ts` | DB 구조 (소재, 지침과 버전, 작품, 회차, 결과물, 작업, 비용·결정 원장) |
| `src/db/seed-data.ts` | docs/02~04번 지침을 에이전트별로 나눈 기본값 |
| `src/lib/pipeline.ts` | 단계 순서, 승인 게이트, 낡음 표시 규칙 (순수 함수, 테스트 있음) |
| `src/lib/studio.ts` | 단계 시작·승인·반려·직접 수정, 지침 버전 결정 |
| `src/lib/queue.ts` | 작업 큐 (로컬은 DB, AWS는 SQS) |
| `src/app/studio/` | 스튜디오 화면과 서버 액션 |
| `src/proxy.ts` | `/studio` 로그인 확인 (Next 16의 proxy = 예전 middleware) |

## 확인

```bash
npm test          # 파이프라인 규칙 테스트
npm run typecheck
npm run lint
npm run build
```
