"""실제 Postgres(로컬)에 대고 가짜 모델로 흐름을 확인해요. 키나 비용이 들지 않아요."""

import os
import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.llm import LLMResult, cost_of
from noriva_worker.handlers import Tools
from noriva_worker.images import ImageNotConfiguredError
from noriva_worker.main import process
from noriva_worker.prompts import render_guidelines
from noriva_worker.store import Store

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")


class FakeWriter:
    def __init__(self):
        self.calls = []

    def write(self, system, task):
        self.calls.append((system, task))
        return LLMResult(text="# 기획안\n가짜 결과", model="claude-opus-5-5", usage={"input_tokens": 1000, "output_tokens": 500}, cost_usd=0.014)


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def make_job(store: Store, stage="concept"):
    c = store.conn
    sid = c.execute(
        "insert into series (slug, title, genre, brief) values (%s, '시험 작품', '오컬트·호러', %s) returning id",
        (f"t-{uuid.uuid4().hex[:8]}", Jsonb({"tone": "정적인 공포", "ageRating": "15", "audience": "", "memo": "메모"})),
    ).fetchone()["id"]
    src = c.execute("select id from sources limit 1").fetchone()
    if src:
        c.execute("insert into series_sources (series_id, source_id) values (%s, %s)", (sid, src["id"]))
    gv = c.execute(
        "select v.id from guideline_versions v join guidelines g on g.id=v.guideline_id where g.agent='planner' limit 1"
    ).fetchone()
    aid = c.execute(
        "insert into artifacts (series_id, stage, status, guideline_version_ids) values (%s, %s, 'generating', %s) returning id",
        (sid, stage, Jsonb([str(gv["id"])] if gv else [])),
    ).fetchone()["id"]
    c.execute(
        "insert into jobs (type, series_id, artifact_id, payload) values (%s, %s, %s, %s)",
        (stage, sid, aid, Jsonb({"instruction": "로맨스는 빼 주세요"})),
    )
    return sid, aid


def test_text_stage_moves_to_review_and_records_cost(store):
    sid, aid = make_job(store)
    job = store.claim_next("test")
    while job and job["series_id"] != sid:  # 다른 테스트 데이터가 있으면 건너뜀
        store.conn.execute("update jobs set status='canceled' where id=%s", (job["id"],))
        job = store.claim_next("test")
    writer = FakeWriter()
    process(store, job, Tools(writer=writer), Config.from_env())
    a = store.conn.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review"
    assert "가짜 결과" in a["body"]["markdown"]
    system, task = writer.calls[0]
    assert "로맨스는 빼 주세요" in task  # 대표 지시가 들어감
    assert "R-1" in system  # DB의 지침이 들어감
    cost = store.conn.execute("select cost_usd from cost_ledger where series_id=%s", (sid,)).fetchone()
    assert float(cost["cost_usd"]) == 0.014


def test_art_without_image_key_fails_without_retry(store):
    sid, aid = make_job(store, stage="art")
    job = store.claim_by_id(
        store.conn.execute("select id from jobs where artifact_id=%s", (aid,)).fetchone()["id"], "test"
    )
    def no_key():
        raise ImageNotConfiguredError("FAL_KEY가 설정되지 않아")

    process(store, job, Tools(writer=FakeWriter(), image_factory=no_key), Config.from_env())
    a = store.conn.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert "FAL_KEY" in a["body"]["error"]
    j = store.conn.execute("select status from jobs where artifact_id=%s", (aid,)).fetchone()
    assert a["status"] == "failed" and j["status"] == "failed"


def test_cost_includes_cache():
    assert cost_of("claude-opus-5-5", {"input_tokens": 1_000_000}) == 4.0
    assert cost_of("claude-opus-5-5", {"cache_read_input_tokens": 1_000_000}) == 0.2


def test_guidelines_narrower_scope_last():
    text = render_guidelines(
        [
            {"scope": "global", "version": 1, "body": {"role": "전체", "rules": [{"code": "R-1", "text": "뿌리"}], "banned": []}},
            {"scope": "series", "version": 2, "body": {"role": "작품", "rules": [], "banned": ["도리이"]}},
        ]
    )
    assert text.index("전체 지침") < text.index("작품 지침")
    assert "- 도리이" in text


def test_idle_timer_expires_only_after_limit():
    from noriva_worker.main import IdleTimer

    now = [0.0]
    t = IdleTimer(15, clock=lambda: now[0])
    now[0] = 14 * 60
    assert not t.expired()
    t.worked()
    now[0] = 28 * 60
    assert not t.expired()
    now[0] = 29 * 60
    assert t.expired()
    assert not IdleTimer(0, clock=lambda: 10**9).expired()


def test_has_pending_sees_queued_and_ignores_stale_running(store):
    c = store.conn
    c.execute("delete from jobs")
    assert not store.has_pending()
    _, aid = make_job(store)
    assert store.has_pending()
    c.execute("update jobs set status = 'running', updated_at = now() - interval '3 hours' where artifact_id = %s", (aid,))
    assert not store.has_pending()
    c.execute("update jobs set updated_at = now() where artifact_id = %s", (aid,))
    assert store.has_pending()


def test_text_stage_checks_rules_and_revises_once():
    from noriva_worker.llm import JSONResult
    from noriva_worker.textcheck import write_checked

    class CheckingWriter(FakeWriter):
        def __init__(self):
            super().__init__()
            self.checks = 0

        def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
            self.checks += 1
            bad = self.checks == 1
            items = [
                {"code": "S-1", "ok": not bad, "severity": "major", "note": "첫 컷 훅이 약함" if bad else "훅 있음"},
                {"code": "D-2", "ok": False, "severity": "minor", "note": "말투가 비슷함"},
            ]
            return JSONResult(data={"items": items, "summary": "요약"}, result=LLMResult("", "claude-opus-5-5", {}, 0.01))

    w = CheckingWriter()
    body, costs = write_checked("plot", {"guidelines": [{"scope": "global"}]}, w, "SYS", "TASK")
    assert len(w.calls) == 2 and "S-1: 첫 컷 훅이 약함" in w.calls[1][1]  # 걸린 주요 규칙만 고쳐 쓰기
    assert "D-2" not in w.calls[1][1]  # 경미한 건 고쳐 쓰기 대상이 아님
    assert body["checks"]["revised"] is True and body["checks"]["first_failed"] == ["S-1"]
    assert [i["ok"] for i in body["checks"]["items"]] == [True, False]
    assert len(costs) == 4  # 초안, 점검, 고쳐 쓰기, 다시 점검
