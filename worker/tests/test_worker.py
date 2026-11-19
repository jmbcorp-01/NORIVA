"""실제 Postgres(로컬)에 대고 가짜 모델로 흐름을 확인해요. 키나 비용이 들지 않아요."""

import os
import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.llm import LLMResult, cost_of
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
    process(store, job, writer, Config.from_env())
    a = store.conn.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review"
    assert "가짜 결과" in a["body"]["markdown"]
    system, task = writer.calls[0]
    assert "로맨스는 빼 주세요" in task  # 대표 지시가 들어감
    assert "R-1" in system  # DB의 지침이 들어감
    cost = store.conn.execute("select cost_usd from cost_ledger where series_id=%s", (sid,)).fetchone()
    assert float(cost["cost_usd"]) == 0.014


def test_unconnected_stage_fails_without_retry(store):
    sid, aid = make_job(store, stage="art")
    job = store.claim_by_id(
        store.conn.execute("select id from jobs where artifact_id=%s", (aid,)).fetchone()["id"], "test"
    )
    process(store, job, FakeWriter(), Config.from_env())
    a = store.conn.execute("select status from artifacts where id=%s", (aid,)).fetchone()
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
