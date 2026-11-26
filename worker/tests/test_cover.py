"""AI 표지: 그림 지시 쓰기, 후보 그리기, 다시 시작하면 이어 그리기, 실제 DB 흐름. 키나 비용이 들지 않아요."""

import io
import os
import uuid

import psycopg
import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from noriva_worker import ledger
from noriva_worker.config import Config
from noriva_worker.cover import cover_task, run_cover
from noriva_worker.handlers import Tools
from noriva_worker.images import ImageResult, NoImageError
from noriva_worker.llm import JSONResult, LLMResult
from noriva_worker.main import process
from noriva_worker.store import Store

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")
R = LLMResult(text="", model="claude-opus-5-5", usage={"input_tokens": 100, "output_tokens": 50}, cost_usd=0.01)


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (30, 40), (40, 50, 60)).save(out, "PNG")
    return out.getvalue()


class Writer:
    def __init__(self):
        self.calls = []

    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        self.calls.append(task)
        return JSONResult(data={"prompt": "A woman in hanbok at a salt field at dawn. No text.", "idea": "새벽 염전의 주인공"}, result=R)


class Painter:
    def __init__(self, fail_at=()):
        self.calls = []
        self.fail_at = set(fail_at)

    def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
        n = len(self.calls)
        self.calls.append({"seed": seed, "refs": references, "ratio": aspect_ratio})
        if n in self.fail_at:
            raise NoImageError("안 나옴")
        return ImageResult(data=png(), model="fal-ai/nano-banana-pro", cost_usd=0.15)


class Media:
    def __init__(self):
        self.files = {}

    def put(self, key, data, content_type="image/png"):
        self.files[key] = (data, content_type)
        return key

    def get(self, key):
        return self.files.get(key, (None,))[0]


def ctx(**kw):
    base = {
        "series": {"id": "s1", "title": "소금 길", "genre": "오컬트·호러", "format": "novel", "brief": {"ageRating": "15"}},
        "sources": [{"name": "향 싣는 배", "summary": "서해 설화"}],
        "inputs": [("기획안", "# 기획")],
        "job_id": "abcdef12-0000",
        "seed": 7,
    }
    return {**base, **kw}


def test_cover_task_mentions_format_direction_and_reference():
    t = cover_task(ctx(direction="붉은 등불", has_reference=True))
    assert "웹소설" in t and "붉은 등불" in t and "인물 시트" in t


def test_run_cover_saves_each_image_right_away():
    saves = []
    w, p, m = Writer(), Painter(), Media()
    state, costs = run_cover(ctx(), w, p, m, {}, lambda s: saves.append(list(s["images"])))
    assert len(state["images"]) == 3 and len(p.calls) == 3
    assert saves == [[], [state["images"][0]], state["images"][:2], state["images"]]  # 지시 저장 + 그림마다 저장
    assert all(m.files[k][1] == "image/jpeg" for k in state["images"])
    assert len(costs) == 4 and {p["ratio"] for p in p.calls} == {"3:4"}


def test_resume_reuses_prompt_and_drawn_images():
    """끊긴 뒤 다시 시작하면 지시를 다시 쓰지 않고, 그린 장은 다시 그리지 않아요 (CLAUDE.md 1-1, 1-7)."""
    w, p = Writer(), Painter()
    saved = {"prompt": "saved prompt", "idea": "i", "images": ["series/s1/cover/ai-abcdef12-1.jpg"]}
    state, costs = run_cover(ctx(), w, p, Media(), saved, lambda s: None)
    assert w.calls == [] and len(p.calls) == 2
    assert state["images"][0] == "series/s1/cover/ai-abcdef12-1.jpg" and len(state["images"]) == 3


def test_one_failed_image_is_skipped_all_failed_stops():
    state, _ = run_cover(ctx(), Writer(), Painter(fail_at={1}), Media(), {}, lambda s: None)
    assert len(state["images"]) == 2 and state["failed"] == 1
    with pytest.raises(NoImageError):
        run_cover(ctx(), Writer(), Painter(fail_at={0, 1, 2}), Media(), {}, lambda s: None)


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def test_cover_job_on_db(store):
    c = store.conn
    sid = c.execute(
        "insert into series (slug, title, genre, brief, format) values (%s, '표지 시험', '오컬트·호러', %s, 'novel') returning id",
        (f"c-{uuid.uuid4().hex[:8]}", Jsonb({"tone": "", "ageRating": "15", "audience": "", "memo": ""})),
    ).fetchone()["id"]
    c.execute("insert into artifacts (series_id, stage, status, body) values (%s, 'concept', 'approved', %s)", (sid, Jsonb({"markdown": "# 기획"})))
    jid = c.execute("insert into jobs (type, series_id, payload) values ('cover', %s, %s) returning id", (sid, Jsonb({"direction": "밤바다"}))).fetchone()["id"]
    w, p, m = Writer(), Painter(), Media()
    process(store, store.claim_by_id(str(jid), "test"), Tools(writer=w, media=m, image_factory=lambda: p), Config.from_env())
    job = c.execute("select status, error from jobs where id=%s", (jid,)).fetchone()
    assert job["status"] == "done", job["error"]
    ai = c.execute("select brief->'coverAI' as a from series where id=%s", (sid,)).fetchone()["a"]
    assert ai["jobId"] == str(jid) and ai["done"] and len(ai["images"]) == 3 and ai["direction"] == "밤바다"
    assert "밤바다" in w.calls[0]
    n = c.execute("select count(*) n, sum(cost_usd) s from cost_ledger where job_id=%s", (jid,)).fetchone()
    assert n["n"] == 4 and float(n["s"]) == pytest.approx(0.46, abs=0.001)  # 지시 1번 + 그림 3장, 바로 기록
