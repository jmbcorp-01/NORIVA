"""소재 발굴·자동 채우기 흐름. 가짜 모델과 가짜 API 클라이언트를 써서 키나 비용이 들지 않아요."""

import os
import uuid
from types import SimpleNamespace

import psycopg
import pytest
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.handlers import Tools
from noriva_worker.llm import JSONResult, LLMResult, ResearchResult, TextModel
from noriva_worker.main import claim_from_message, process
from noriva_worker.scout import clean_candidate, run_scout, scout_task
from noriva_worker.store import Store

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")
R = LLMResult(text="", model="claude-opus-5-5", usage={"input_tokens": 100, "output_tokens": 50}, cost_usd=0.0014)
URL = "https://example.com/trend"


def cand(name, score=70, url=URL):
    return {
        "name": name, "category": "creature", "era": "조선 후기", "summary": "요약", "rules": ["규칙"],
        "visualNotes": "", "references": ["한국구비문학대계"], "caution": "", "overlapWorks": [],
        "whyNow": "오컬트 강세", "evidence": [{"claim": "오컬트 강세", "url": url}], "similarHits": ["작품 A"],
        "difference": "다름", "loglines": ["하나", "둘", "셋", "넷"], "combo": "도깨비 × 경성 × 로맨스",
        "genre": "로맨스 판타지", "globalAppeal": 150, "score": score, "factCheck": [],
    }


class FakeScout:
    def __init__(self, candidates=None, fill=None):
        self.candidates = candidates
        self.fill = fill
        self.tasks = []

    def research(self, system, task, max_searches=15, max_rounds=6):
        self.tasks.append(task)
        return ResearchResult(text="조사 글", links=[{"title": "트렌드", "url": URL}], searches=4, results=[R])

    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        if self.fill is not None:
            return JSONResult(data=self.fill, result=R)
        report = {"summary": "요약", "trends": [], "hits": [], "changes": "첫 리포트",
                  "links": [{"title": "가짜", "url": "https://made-up.example"}]}
        return JSONResult(data={"report": report, "candidates": self.candidates or []}, result=R)


def test_clean_candidate_drops_uncited_links_and_clamps():
    c = clean_candidate(cand("두억시니", url="https://not-cited.example"), {URL})
    assert c["evidence"] == []
    assert c["globalAppeal"] == 100
    assert len(c["loglines"]) == 3


def test_run_scout_sorts_skips_known_and_counts_search_cost():
    model = FakeScout([cand("어둑시니", 40), cand("바리공주", 90), cand("두억시니", 80)])
    report, cands, costs = run_scout({"existing_sources": ["바리공주"], "count": 8}, model)
    assert [c["name"] for c in cands] == ["두억시니", "어둑시니"]
    assert [l["url"] for l in report["links"]] == [URL]  # 지어낸 링크는 빠지고 인용 링크만
    search = [c for c in costs if c["model"] == "web_search"][0]
    assert search["units"]["searches"] == 4 and search["cost_usd"] == 0.04


def test_scout_task_mentions_focus_and_dismiss_reasons():
    t = scout_task({"focus": "근대 경성", "dismissed": [{"name": "구미호", "reason": "너무 흔함"}]})
    assert "근대 경성" in t and "구미호: 너무 흔함" in t


# ── research(): pause_turn 이어 보내기와 인용 모으기 ──


class _Stream:
    def __init__(self, msg):
        self.msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self.msg


def _msg(stop, blocks, searches):
    usage = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0,
                            cache_creation_input_tokens=0, server_tool_use=SimpleNamespace(web_search_requests=searches))
    return SimpleNamespace(stop_reason=stop, content=blocks, usage=usage, model="claude-opus-5-5")


def _text(t, url=None):
    cites = [SimpleNamespace(url=url, title="제목")] if url else None
    return SimpleNamespace(type="text", text=t, citations=cites)


def test_research_resumes_after_pause_turn():
    msgs = [_msg("pause_turn", [_text("앞부분 ", URL)], 3), _msg("end_turn", [_text("뒷부분", URL)], 2)]
    sent = []

    def stream(**kw):
        sent.append([m["role"] for m in kw["messages"]])
        return _Stream(msgs.pop(0))

    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    r = TextModel("claude-opus-5-5", "high", client=client).research("sys", "task")
    assert r.text == "앞부분 뒷부분"
    assert r.searches == 5 and r.links == [{"title": "제목", "url": URL}]
    assert sent == [["user"], ["user", "assistant"]]  # 이어 보낼 때 '계속' 같은 말을 덧붙이지 않아요


def test_json_retries_with_bigger_limit_when_truncated():
    msgs = [_msg("max_tokens", [_text('{"a": ')], 0), _msg("end_turn", [_text('{"a": 1}')], 0)]
    limits = []

    def stream(**kw):
        limits.append(kw["max_tokens"])
        return _Stream(msgs.pop(0))

    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    r = TextModel("claude-opus-5-5", "high", client=client).json("sys", "task", {"type": "object"}, max_tokens=4000)
    assert r.data == {"a": 1} and limits == [4000, 32000]
    assert r.result.usage["output_tokens"] == 10  # 잘린 첫 호출 비용도 합쳐 기록


# ── DB 흐름 ──


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def cfg():
    return Config(database_url=DB, sqs_queue_url="", aws_region="ap-northeast-2", model="claude-opus-5-5", effort="high",
                  max_attempts=3, poll_seconds=0, image_model="x", image_price=0, art_candidates=1, art_pass_score=80,
                  art_max_panels=10, art_parallel=1, idle_minutes=0, ecs_cluster="", ecs_service="")


def test_scout_job_saves_report_candidates_and_cost(store):
    name = f"후보-{uuid.uuid4().hex[:6]}"
    job = store.create_scout("manual", "근대 경성")
    store.conn.execute("update jobs set status='running', attempts=1 where id=%s", (job["id"],))
    job = store.conn.execute("select * from jobs where id=%s", (job["id"],)).fetchone()
    process(store, job, Tools(writer=FakeScout([cand(name)])), cfg())
    run = store.conn.execute("select * from scout_runs where job_id=%s", (job["id"],)).fetchone()
    assert run["status"] == "done" and run["report"]["changes"] == "첫 리포트"
    rows = store.conn.execute("select body from source_candidates where run_id=%s", (run["id"],)).fetchall()
    assert [r["body"]["name"] for r in rows] == [name]
    cost = store.conn.execute("select sum(cost_usd) s from cost_ledger where job_id=%s", (job["id"],)).fetchone()
    assert float(cost["s"]) > 0.04


def set_scout_auto(store, on: bool):
    if on:
        store.conn.execute(
            "insert into studio_settings (key, value) values ('scout_auto', 'on') on conflict (key) do update set value = 'on'"
        )
    else:
        store.conn.execute("delete from studio_settings where key = 'scout_auto'")


def test_weekly_message_skipped_when_auto_off(store):
    store.conn.execute("delete from scout_runs where trigger='weekly'")
    set_scout_auto(store, False)
    assert claim_from_message(store, '{"kind":"scout","trigger":"weekly"}', "w1") is None
    assert store.conn.execute("select 1 from scout_runs where trigger='weekly'").fetchone() is None
    # 직접 실행(웹이 넣은 jobId)은 토글과 상관없이 돌아요
    job = store.create_scout("manual", "")
    assert claim_from_message(store, '{"jobId":"%s"}' % job["id"], "w1")["status"] == "running"
    store.conn.execute("delete from scout_runs where job_id=%s", (job["id"],))
    store.conn.execute("delete from jobs where id=%s", (job["id"],))


def test_weekly_message_runs_once(store):
    store.conn.execute("delete from scout_runs where trigger='weekly'")
    set_scout_auto(store, True)
    first = claim_from_message(store, '{"kind":"scout","trigger":"weekly"}', "w1")
    assert first and first["status"] == "running"
    assert claim_from_message(store, '{"kind":"scout","trigger":"weekly"}', "w1") is None
    store.conn.execute("delete from scout_runs where trigger='weekly'")
    set_scout_auto(store, False)


def test_source_fill_only_fills_empty_fields(store):
    sid = store.conn.execute(
        "insert into sources (name, category, summary) values (%s, 'creature', '대표가 쓴 요약') returning id",
        (f"채움-{uuid.uuid4().hex[:6]}",),
    ).fetchone()["id"]
    job = store.conn.execute(
        "insert into jobs (type, status, attempts, payload) values ('source_fill', 'running', 1, %s) returning *",
        (Jsonb({"source_id": str(sid)}),),
    ).fetchone()
    fill = {"category": "folktale", "era": "조선", "summary": "AI 요약", "rules": ["금기"], "visualNotes": "도포",
            "references": ["실록"], "caution": "", "overlapWorks": []}
    process(store, job, Tools(writer=FakeScout(fill=fill)), cfg())
    s = store.conn.execute("select * from sources where id=%s", (sid,)).fetchone()
    assert s["summary"] == "대표가 쓴 요약" and s["era"] == "조선" and s["rules"] == ["금기"]
    assert s["category"] == "creature"
    assert store.conn.execute("select status from jobs where id=%s", (job["id"],)).fetchone()["status"] == "done"


class FakeMeta:
    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        assert "승인된 기획안" in task
        return JSONResult(data={"title": "소금과 향", "titleEn": "Salt & Incense", "logline": "소개", "loglineEn": "Intro",
                                "rootNote": "뿌리", "rootNoteEn": "Roots"}, result=R)


def test_series_meta_fills_empty_fields_only(store):
    c = store.conn
    sid = c.execute(
        "insert into series (slug, title, genre, brief, root_note) values (%s, '제목 미정', '오컬트·호러', %s, '대표가 쓴 뿌리') returning id",
        (f"m-{uuid.uuid4().hex[:8]}", Jsonb({"ageRating": "15"})),
    ).fetchone()["id"]
    c.execute("insert into artifacts (series_id, stage, status, body) values (%s, 'concept', 'approved', %s)", (sid, Jsonb({"markdown": "# 소금과 향"})))
    job = c.execute(
        "insert into jobs (type, series_id, status, attempts) values ('series_meta', %s, 'running', 1) returning *", (sid,)
    ).fetchone()
    process(store, job, Tools(writer=FakeMeta()), cfg())
    s = c.execute("select * from series where id=%s", (sid,)).fetchone()
    assert s["title"] == "소금과 향" and s["title_en"] == "Salt & Incense" and s["root_note"] == "대표가 쓴 뿌리"
    assert c.execute("select status from jobs where id=%s", (job["id"],)).fetchone()["status"] == "done"


class FakeEpisodeMeta:
    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        assert "찾을 회차: 1화" in task
        return JSONResult(data={"title": "묵향", "titleEn": "Ink Scent", "logline": "AI 요약"}, result=R)


def test_episode_meta_fills_empty_fields_only(store):
    c = store.conn
    sid = c.execute(
        "insert into series (slug, title, genre, brief) values (%s, '시험', '무협·액션', %s) returning id",
        (f"e-{uuid.uuid4().hex[:8]}", Jsonb({"ageRating": "15"})),
    ).fetchone()["id"]
    c.execute("insert into artifacts (series_id, stage, status, body) values (%s, 'story', 'approved', %s)", (sid, Jsonb({"markdown": "1화 묵향: ..."})))
    eid = c.execute("insert into episodes (series_id, number, logline) values (%s, 1, '대표 요약') returning id", (sid,)).fetchone()["id"]
    job = c.execute(
        "insert into jobs (type, series_id, episode_id, status, attempts) values ('episode_meta', %s, %s, 'running', 1) returning *",
        (sid, eid),
    ).fetchone()
    process(store, job, Tools(writer=FakeEpisodeMeta()), cfg())
    e = c.execute("select * from episodes where id=%s", (eid,)).fetchone()
    assert e["title"] == "묵향" and e["title_en"] == "Ink Scent" and e["logline"] == "대표 요약"


def test_progress_is_recorded_while_running_and_cleared_on_claim(store):
    c = store.conn
    job = c.execute("insert into jobs (type, status, progress) values ('scout', 'running', null) returning *").fetchone()
    store.set_progress(job["id"], "컷 그리는 중", 3, 71)
    p = c.execute("select progress from jobs where id=%s", (job["id"],)).fetchone()["progress"]
    assert p["step"] == "컷 그리는 중" and p["done"] == 3 and p["total"] == 71
    c.execute("update jobs set status='queued' where id=%s", (job["id"],))
    claimed = store.claim_by_id(str(job["id"]), "w")
    assert claimed["progress"] is None
