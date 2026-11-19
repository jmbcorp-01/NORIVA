# NORIVA 제작 서버 (작업 실행기)

스튜디오가 큐에 넣은 작업을 꺼내 에이전트를 실행하고, 결과를 "검토 대기"로 돌려놓아요.

- 로컬: `jobs` 테이블을 몇 초마다 확인
- AWS: SQS에서 작업 id를 받아 같은 행을 잠그고 실행 (`SQS_QUEUE_URL`)

모든 단계가 연결돼 있어요. 지침은 실행 시점에 DB에서 읽고, 결과물마다 쓴 지침 버전과 비용이 남아요.

| 단계 | 하는 일 |
| --- | --- |
| ①~⑥ 글 단계 | 기획안, 스토리, 인물, 화풍 카드, 대본, 콘티를 Claude로 써요 (마크다운) |
| ⑦ 작화 | 승인된 콘티를 컷 목록으로 정리 → 인물 시트를 한 번 그려 저장(외모·화풍이 같으면 재사용) → 컷마다 시트를 참조로 후보를 그림 → 테두리 정리 → Claude가 그림을 보고 AI-01~14·고증 결함과 점수를 매김 → 합격 후보가 나오면 멈추고, 아니면 점수가 가장 높은 후보를 남김. 대표가 고른 컷만 다시 그릴 수도 있어요 |
| ⑧ 말풍선 | 한국어 대사를 미국식 영어로 다시 쓰고(영어 대사 지침), 컷마다 그림을 보고 말풍선·꼬리·효과음 위치를 정해요. 글자는 그림에 굽지 않고 레이어 데이터로 남아서 두 언어가 같은 위치를 써요 |
| ⑨ 검수 | 금지 표현·그림 점수 미달·말풍선 과다를 자동으로 찾고, Claude가 Q-1~Q-8 고정 채점표로 채점해요. 80점 이상, AI 티 없음 16점 이상, 치명 결함 0개일 때 합격 |

그림 생성과 정리는 시제품 `production/`(PR #1)의 FalImage, trim_border를 옮겨 왔어요. 그림 파일은 로컬에서는 저장소의 `.media/`, AWS에서는 S3 `media/` 아래에 저장되고, 스튜디오는 `/media/<키>`로 보여줘요.

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
export ANTHROPIC_API_KEY=...            # 실제 생성에 필요
export FAL_KEY=...                      # 작화 단계에 필요
.venv/bin/noriva-worker
.venv/bin/pytest                         # 가짜 모델로 흐름 확인 (로컬 Postgres 필요, 비용 없음)
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` 또는 `DB_HOST` 등 | 로컬 | DB 연결 |
| `NORIVA_TEXT_MODEL` | `claude-opus-5-5` | 글 단계 모델 |
| `NORIVA_TEXT_EFFORT` | `high` | 생각 깊이 |
| `NORIVA_MAX_ATTEMPTS` | `3` | 일시적 오류 재시도 횟수 |
| `NORIVA_IMAGE_MODEL` | `fal-ai/nano-banana` | 그림 모델 (fal 주소, 참조 그림용 `/edit` 경로가 있어야 해요) |
| `NORIVA_IMAGE_PRICE` | `0.04` | 그림 한 장 값(달러), 제작비 기록용 |
| `NORIVA_ART_CANDIDATES` | `2` | 컷마다 그려 볼 후보 수 |
| `NORIVA_ART_PASS_SCORE` | `80` | 컷 합격 점수 |
| `NORIVA_ART_MAX_PANELS` | `60` | 한 회차 최대 컷 수 |
| `NORIVA_ART_PARALLEL` | `4` | 동시에 그리는 컷 수 |
| `MEDIA_DIR` | 저장소의 `.media` | 로컬 그림 저장 폴더 (`ASSETS_BUCKET`이 있으면 S3 사용) |
