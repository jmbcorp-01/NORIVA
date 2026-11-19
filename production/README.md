# NORIVA 제작 서버 (시제품)

AI 에이전트가 웹툰 1화를 기획부터 그림, 음성까지 만드는 파이프라인이에요. 지금은 명령줄로 돌리고, 나중에 관리자 페이지가 같은 함수를 불러요.

## 흐름

1. `plan`: 대본 작가가 영어 대본을 쓰고, 콘티 에이전트가 콘티 3안을 만들고, 대사 에이전트가 미국식 표현을 다듬어요. 여기서 멈춰요.
2. `decide`: 대표가 콘티 하나를 고르고 대사를 고쳐요. 이 선택과 수정은 `ledger.jsonl`에 기록돼요(저작권 증거).
3. `produce`: 회차 품질검수를 통과하면 컷마다 그림을 그리고 이미지 품질검수를 해요. 불합격이면 최대 3번 다시 그리고, 그래도 안 되면 대표에게 넘겨요. 그 뒤 캐릭터별 음성을 만들어요.

말풍선 글자는 그림에 넣지 않고 `episode.json`에 데이터로 저장해요. 그래서 나중에 언어를 추가해도 그림을 다시 그릴 필요가 없어요.

## 준비

```bash
cd production
pip install -e ".[dev]"
```

필요한 환경 변수 (키는 저장소에 넣지 않아요):

| 변수 | 용도 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API: 대본, 콘티, 대사, 품질검수 |
| `FAL_KEY` | fal.ai: 그림 |
| `ELEVENLABS_API_KEY` | ElevenLabs: AI 성우 |
| `NORIVA_VOICE_MAP` | 캐릭터별 음성 ID, 예: `hana=abc,fox=def,jun=ghi,narration=xyz` |

## 실행

```bash
python -m noriva plan    --bible ../series/occult/bible.json --episode 1
python -m noriva decide  --run runs/salt-and-incense/ep001 --variant 1 --edits edits.json
python -m noriva produce --bible ../series/occult/bible.json --run runs/salt-and-incense/ep001
python -m noriva cost    --run runs/salt-and-incense/ep001
```

## 테스트

```bash
pytest
```

테스트는 가짜 제공자로 돌아서 키나 비용이 들지 않아요. 흐름이 맞는지만 확인하고, 품질은 실제 실행으로 확인해요.
