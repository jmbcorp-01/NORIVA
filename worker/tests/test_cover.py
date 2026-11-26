"""AI 표지 만들기. 가짜 모델·가짜 그림 생성기를 써서 키나 비용이 들지 않아요.

지키는 것 (CLAUDE.md 1-1, 1-2, 1-7): 도중에 끊긴 뒤 다시 시작하면 그린 장과 그림 지시를 다시 만들지 않고,
안전 필터에 걸린 장은 그 장만 빼고 계속해요.
"""

import io
import os
import uuid

import psycopg
import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.cover import run_cover
from noriva_worker.handlers import Tools
from noriva_worker.images import ImageResult, NoImageError
from noriva_worker.llm import JSONResult, LLMResult
from noriva_worker.main import process
from noriva_worker.media import LocalMedia
from noriva_worker.store import Store

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")


def png():
    out = io.BytesIO()
    Image.new("RGB", (30, 40), (90, 60, 120)).save(out, "PNG")
    return out.getvalue()


class FakeWriter:
    def __init__(self):
        self.tasks = []

    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        self.tasks.append(task)
        r = LLMResult(text="", model="claude-opus-5-5", usage={"input_tokens": 100, "output_tokens": 50}, cost_usd=0.01)
        return JSONResult(data={"prompt": "a lone heroine under a blue moon", "summary": "푸른 달 아래 주인공"}, result=r)


class FakeImages:
    """fail: 몇 번째 호출(0부터)에 어떤 예외를 낼지"""

    def __init__(self, fail=None):
        self.fail = fail or {}
        self.calls = []

    def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
        n = len(self.calls)
        self.calls.append({"prompt": prompt, "aspect": aspect_ratio, "model": model})
        if n in self.fail:
            raise self.fail[n]
        return ImageResult(data=png(), model=model or "fake/img", cost_usd=0.15)


def _ctx(**kw):
    series = {"id": str(uuid.uuid4()), "title": "달의 궁", "genre": "궁중 로맨스", "format": "novel", "logline": "", "brief": {}}
    return {"series": series, "sources": [], "inputs": [("기획안", "궁중 로맨스 기획")], "instruction": "", "count": 2, "saved": {}, **kw}


def _saver(saved):
    def save(part):
        saved.update(part)

    return save


def test_run_cover_draws_portrait_without_text_and_saves_each_image(tmp_path):
    writer, images, saved = FakeWriter(), FakeImages(), {}
    result, costs = run_cover(_ctx(instruction="밤의 궁궐"), writer, images, LocalMedia(str(tmp_path)), _saver(saved))
    assert len(result["keys"]) == 2 and all(k.startswith("series/") and "/cover/ai-" in k for k in result["keys"])
    assert all(c["aspect"] == "3:4" for c in images.calls)
    assert "no text" in images.calls[0]["prompt"]  # 제목 글자를 그리지 않게
    assert "밤의 궁궐" in writer.tasks[0]  # 대표의 요청이 그림 지시에 들어가요
    assert saved["prompt"] and saved["keys"] == result["keys"]  # 그린 장은 바로 작업 기록에
    assert [c["provider"] for c in costs] == ["anthropic", "fal", "fal"]
    assert all((tmp_path / k).exists() for k in result["keys"])


def test_run_cover_resumes_without_redrawing(tmp_path):
    writer, images = FakeWriter(), FakeImages()
    saved = {"prompt": "saved prompt", "summary": "요약", "keys": ["series/x/cover/ai-old.png"]}
    result, costs = run_cover(_ctx(saved=dict(saved)), writer, images, LocalMedia(str(tmp_path)), _saver({}))
    assert writer.tasks == []  # 그림 지시를 다시 쓰지 않아요
    assert len(images.calls) == 1 and images.calls[0]["prompt"] == "saved prompt"  # 남은 한 장만
    assert result["keys"][0] == "series/x/cover/ai-old.png" and len(result["keys"]) == 2
    assert [c["provider"] for c in costs] == ["fal"]


def test_run_cover_skips_filtered_image_and_fails_only_when_none(tmp_path):
    images = FakeImages({0: NoImageError("필터")})
    result, _ = run_cover(_ctx(), FakeWriter(), images, LocalMedia(str(tmp_path)), _saver({}))
    assert len(images.calls) == 2 and len(result["keys"]) == 1 and result["skipped"] == 1

    images = FakeImages({0: NoImageError("필터"), 1: NoImageError("필터")})
    with pytest.raises(NoImageError):
        run_cover(_ctx(), FakeWriter(), images, LocalMedia(str(tmp_path)), _saver({}))


# ── DB로 작업 전체 흐름 ──


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def _series(c, cover=""):
    sid = c.execute(
        "insert into series (slug, title, genre, brief, cover_url, format) values (%s, '달의 궁', '궁중 로맨스', %s, %s, 'novel') returning id",
        (f"t-{uuid.uuid4().hex[:8]}", Jsonb({}), cover),
    ).fetchone()["id"]
    c.execute(
        "insert into artifacts (series_id, stage, status, body) values (%s, 'concept', 'approved', %s)",
        (sid, Jsonb({"markdown": "궁중 로맨스 기획"})),
    )
    return sid


def _job(c, sid, count=2):
    return c.execute(
        "insert into jobs (type, series_id, payload) values ('cover', %s, %s) returning id", (sid, Jsonb({"count": count, "instruction": ""}))
    ).fetchone()["id"]


def test_cover_job_sets_cover_when_empty_and_records_costs(store, tmp_path):
    c = store.conn
    sid = _series(c)
    jid = _job(c, sid)
    tools = Tools(writer=FakeWriter(), media=LocalMedia(str(tmp_path)), image_factory=lambda: FakeImages())
    process(store, store.claim_by_id(jid, "test"), tools, Config.from_env())
    assert c.execute("select status from jobs where id=%s", (jid,)).fetchone()["status"] == "done"
    s = c.execute("select cover_url, brief from series where id=%s", (sid,)).fetchone()
    assert len(s["brief"]["aiCovers"]) == 2 and s["cover_url"] == s["brief"]["aiCovers"][0]
    costs = c.execute("select provider, cost_usd from cost_ledger where job_id=%s order by provider", (jid,)).fetchall()
    assert [r["provider"] for r in costs] == ["anthropic", "fal", "fal"]  # 호출마다 바로 한 줄씩, 끝나고 다시 적지 않음
    log = c.execute("select action, actor from decision_ledger where series_id=%s", (sid,)).fetchall()
    assert [(r["action"], r["actor"]) for r in log] == [("cover_ai", "NORIVA AI")]

    # 표지가 이미 있으면 바꾸지 않고 후보만 앞에 더해요
    jid2 = _job(c, sid, count=1)
    process(store, store.claim_by_id(jid2, "test"), tools, Config.from_env())
    s2 = c.execute("select cover_url, brief from series where id=%s", (sid,)).fetchone()
    assert s2["cover_url"] == s["cover_url"]
    assert len(s2["brief"]["aiCovers"]) == 3 and s2["brief"]["aiCovers"][1:] == s["brief"]["aiCovers"]


def test_cover_job_interrupted_resumes_only_remaining(store, tmp_path):
    import httpx

    c = store.conn
    sid = _series(c)
    jid = _job(c, sid)
    resp = httpx.Response(503, request=httpx.Request("POST", "https://fal.run/x"), text="busy")
    first_images, writer = FakeImages({1: httpx.HTTPStatusError("busy", request=resp.request, response=resp)}), FakeWriter()
    tools = Tools(writer=writer, media=LocalMedia(str(tmp_path)), image_factory=lambda: first_images)
    process(store, store.claim_by_id(jid, "test"), tools, Config.from_env())
    job = c.execute("select status, payload from jobs where id=%s", (jid,)).fetchone()
    assert job["status"] == "queued"  # 일시적 오류라 다시 대기열에
    assert len(job["payload"]["saved"]["keys"]) == 1 and job["payload"]["saved"]["prompt"]
    spent = c.execute("select count(*) n from cost_ledger where job_id=%s", (jid,)).fetchone()["n"]
    assert spent == 2  # 실패해도 쓴 돈(지시 1 + 그림 1)은 장부에

    c.execute("update jobs set run_after = now() where id=%s", (jid,))
    again = FakeImages()
    tools = Tools(writer=writer, media=LocalMedia(str(tmp_path)), image_factory=lambda: again)
    process(store, store.claim_by_id(jid, "test"), tools, Config.from_env())
    assert c.execute("select status from jobs where id=%s", (jid,)).fetchone()["status"] == "done"
    assert len(again.calls) == 1 and len(writer.tasks) == 1  # 남은 한 장만, 지시는 다시 쓰지 않음
    s = c.execute("select brief from series where id=%s", (sid,)).fetchone()
    assert s["brief"]["aiCovers"][0] == job["payload"]["saved"]["keys"][0]
