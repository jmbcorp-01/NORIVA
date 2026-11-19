# NORIVA 제작 서버 (작업 실행기)

스튜디오가 큐에 넣은 작업을 꺼내 에이전트를 실행하고, 결과를 "검토 대기"로 돌려놓아요.

- 로컬: `jobs` 테이블을 몇 초마다 확인
- AWS: SQS에서 작업 id를 받아 같은 행을 잠그고 실행 (`SQS_QUEUE_URL`)

지금 연결된 단계는 글 단계(기획안, 스토리, 인물, 화풍 카드, 대본, 콘티)예요. 지침은 실행 시점에 DB에서 읽고, 결과물마다 쓴 지침 버전과 비용이 남아요. 작화·말풍선·검수는 기존 `production/` 파이프라인을 옮겨 다음 작업에서 연결해요.

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
export ANTHROPIC_API_KEY=...            # 실제 생성에 필요
.venv/bin/noriva-worker
.venv/bin/pytest                         # 가짜 모델로 흐름 확인 (로컬 Postgres 필요, 비용 없음)
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` 또는 `DB_HOST` 등 | 로컬 | DB 연결 |
| `NORIVA_TEXT_MODEL` | `claude-opus-5-5` | 글 단계 모델 |
| `NORIVA_TEXT_EFFORT` | `high` | 생각 깊이 |
| `NORIVA_MAX_ATTEMPTS` | `3` | 일시적 오류 재시도 횟수 |
