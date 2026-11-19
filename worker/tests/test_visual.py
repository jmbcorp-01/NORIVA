"""작화 → 말풍선 → 검수를 실제 Postgres와 가짜 모델·가짜 그림 생성기로 확인해요. 키나 비용이 들지 않아요."""

import io
import os
import uuid

import psycopg
import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.handlers import Tools
from noriva_worker.images import ImageResult, trim_border
from noriva_worker.llm import JSONResult, LLMResult
from noriva_worker.main import process
from noriva_worker.media import LocalMedia
from noriva_worker.store import Store
from noriva_worker.visual import ArtSettings

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")


def png(color=(120, 90, 60), size=(60, 80), border=0):
    img = Image.new("RGB", size, (250, 250, 250) if border else color)
    if border:
        img.paste(Image.new("RGB", (size[0] - 2 * border, size[1] - 2 * border), color), (border, border))
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def _r():
    return LLMResult(text="", model="claude-opus-5-5", usage={"input_tokens": 100, "output_tokens": 50}, cost_usd=0.001)


class FakeModel:
    """스키마 모양을 보고 정해진 답을 돌려줘요. 그림 검사는 첫 후보를 불합격, 둘째를 합격시켜요."""

    def __init__(self):
        self.calls = []
        self.checks = 0

    def write(self, system, task):
        return _r()

    def json(self, system, task, schema, images=None, effort=None, max_tokens=32000):
        props = schema["properties"]
        self.calls.append((list(props), task, len(images or [])))
        if "panels" in props:
            data = {
                "style_prompt": "ink line, muted hanji palette",
                "characters": [{"id": "hana", "name": "하나", "appearance": "girl, 17, black bob hair, white jeogori"}],
                "panels": [
                    {"index": 9, "shot": "wide", "height": "long", "gap_before": "long", "description": "village at night", "character_ids": [], "dialogue": [{"speaker": "narration", "text": "그날 밤, 소금이 녹지 않았다."}], "sfx": "", "avoid": ""},
                    {"index": 9, "shot": "close-up", "height": "normal", "gap_before": "none", "description": "Hana stares at salt", "character_ids": ["hana"], "dialogue": [{"speaker": "hana", "text": "이게 왜 안 녹아?"}], "sfx": "사각", "avoid": "torii"},
                ],
            }
        elif "people_count" in props:
            self.checks += 1
            ok = self.checks % 2 == 0
            data = {"score": 88 if ok else 60, "people_count": 1, "defects": [] if ok else [{"code": "AI-03", "severity": "major", "note": "과한 광택"}]}
        elif "glossary" in props:
            data = {"lines": [{"id": "1-0", "en": "That night, the salt would not melt.", "note": ""}, {"id": "2-0", "en": "Why won't this melt?", "note": ""}], "sfx": [{"panel": 2, "en": "skritch"}], "glossary": []}
        elif "bubbles" in props:
            data = {"bubbles": [{"line": 0, "shape": "speech", "x": 10, "y": 5, "w": 40, "h": 12, "has_tail": True, "tail_x": 50, "tail_y": 40}], "sfx": {"present": True, "x": 70, "y": 20, "size": 12, "angle": -10}}
        elif "items" in props:
            data = {
                "items": [{"code": c, "score": s, "evidence": "근거"} for c, s in [("Q-1", 14), ("Q-2", 9), ("Q-3", 14), ("Q-4", 13), ("Q-5", 18), ("Q-6", 9), ("Q-7", 9), ("Q-8", 5)]],
                "defects": [],
                "fixes": ["2컷 표정을 더 굳게"],
                "summary": "연재 가능한 수준이에요.",
            }
        else:
            raise AssertionError(f"모르는 스키마 {list(props)}")
        return JSONResult(data=data, result=_r())


class FakeImages:
    def __init__(self):
        self.prompts = []

    def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4"):
        self.prompts.append((prompt, len(references or [])))
        return ImageResult(data=png(border=4), model="fake/img", cost_usd=0.04)


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def _series(c):
    sid = c.execute(
        "insert into series (slug, title, genre, brief) values (%s, '시험 작품', '오컬트·호러', %s) returning id",
        (f"t-{uuid.uuid4().hex[:8]}", Jsonb({})),
    ).fetchone()["id"]
    eid = c.execute("insert into episodes (series_id, number) values (%s, 1) returning id", (sid,)).fetchone()["id"]
    return sid, eid


def _approved(c, sid, eid, stage, body):
    return c.execute(
        "insert into artifacts (series_id, episode_id, stage, status, body) values (%s, %s, %s, 'approved', %s) returning id",
        (sid, eid, stage, Jsonb(body)),
    ).fetchone()["id"]


def _run(store, tools, sid, eid, stage, inputs, payload=None, attempt=1):
    c = store.conn
    aid = c.execute(
        "insert into artifacts (series_id, episode_id, stage, status, attempt, input_artifact_ids) values (%s, %s, %s, 'generating', %s, %s) returning id",
        (sid, eid, stage, attempt, Jsonb([str(i) for i in inputs])),
    ).fetchone()["id"]
    jid = c.execute(
        "insert into jobs (type, series_id, episode_id, artifact_id, payload) values (%s, %s, %s, %s, %s) returning id",
        (stage, sid, eid, aid, Jsonb(payload or {})),
    ).fetchone()["id"]
    job = store.claim_by_id(jid, "test")
    process(store, job, tools, Config.from_env())
    a = c.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review", a["body"]
    return aid, a["body"]


def test_art_lettering_review_flow(store, tmp_path):
    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=2, parallel=1))

    inputs = [
        _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"}),
        _approved(c, sid, None, "style", {"markdown": "먹선, 한지색"}),
        _approved(c, sid, None, "characters", {"markdown": "하나: 17세"}),
    ]
    art_id, art = _run(store, tools, sid, eid, "art", inputs)

    assert art["kind"] == "art"
    assert [p["index"] for p in art["panels"]] == [1, 2]  # 번호를 1부터 다시 매김
    # 인물 시트 1장 + 컷 2개 x 후보 최대 2장. 첫 후보 불합격 → 둘째 합격
    assert len(images.prompts) == 1 + 4
    assert images.prompts[0][0].startswith("Character design sheet")
    p2 = art["panels"][1]
    assert p2["passed"] and p2["score"] == 88 and len(p2["candidates"]) == 2
    assert images.prompts[-1][1] == 1  # 인물 시트를 참조로 넘김
    assert "torii" in images.prompts[-1][0]
    assert (tmp_path / p2["image"]).exists()
    assert art["characters"][0]["sheet"].startswith(f"series/{sid}/refs/")
    cost = c.execute("select provider, units, cost_usd from cost_ledger where series_id=%s order by provider", (sid,)).fetchall()
    assert {r["provider"] for r in cost} == {"anthropic", "fal"}
    fal = next(r for r in cost if r["provider"] == "fal")
    assert fal["units"]["calls"] == 5 and float(fal["cost_usd"]) == 0.2

    # 2컷만 다시 그리기: 1컷은 그대로, 인물 시트는 다시 그리지 않음
    images.prompts.clear()
    c.execute("update artifacts set status='approved' where id=%s", (art_id,))
    _, art2 = _run(store, tools, sid, eid, "art", inputs, payload={"panels": [2], "base_artifact_id": str(art_id), "instruction": "더 어둡게"}, attempt=2)
    assert len(images.prompts) == 2 and "더 어둡게" in images.prompts[0][0]
    assert art2["panels"][0]["image"] == art["panels"][0]["image"]
    assert art2["panels"][1]["image"] != art["panels"][1]["image"]
    assert art2["redrawn"] == [2]

    plot = _approved(c, sid, eid, "plot", {"markdown": "대본"})
    let_id, let = _run(store, tools, sid, eid, "lettering", [art_id, plot])
    b = let["panels"][1]["bubbles"][0]
    assert b["text"] == {"ko": "이게 왜 안 녹아?", "en": "Why won't this melt?"}
    assert b["tail"] == {"x": 50.0, "y": 40.0}
    assert let["panels"][0]["bubbles"][0]["shape"] == "narration"
    assert let["panels"][1]["sfx"]["text"] == {"ko": "사각", "en": "skritch"}

    c.execute("update artifacts set status='approved' where id=%s", (let_id,))
    c.execute("insert into banned_terms (kind, term) values ('dialogue_en', 'won''t this')")
    try:
        _, rev = _run(store, tools, sid, eid, "review", [let_id])
    finally:
        c.execute("delete from banned_terms where term = 'won''t this'")
    assert rev["total"] == 91 and rev["passed"] is True
    assert rev["auto_checks"]["banned_terms"][0]["panel"] == 2
    assert "합격 (91/100)" in rev["markdown"]


def test_review_fails_on_low_ai_score(store, tmp_path):
    from noriva_worker.visual import run_review

    model = FakeModel()
    orig = model.json

    def low(system, task, schema, images=None, effort=None, max_tokens=32000):
        r = orig(system, task, schema, images, effort, max_tokens)
        for it in r.data.get("items", []):
            if it["code"] == "Q-5":
                it["score"] = 15
        return r

    model.json = low
    ctx = {
        "guidelines": [],
        "instruction": "",
        "input_bodies": {"lettering": {"kind": "lettered", "panels": [{"index": 1, "height": "normal", "description": "", "score": 90, "defects": [], "bubbles": []}]}},
    }
    body, _ = run_review(ctx, model, ArtSettings())
    assert body["total"] == 88 and body["passed"] is False  # 총점은 넘어도 AI 티 항목이 16점 미만이면 불합격


def test_trim_border_removes_flat_frame():
    out = Image.open(io.BytesIO(trim_border(png(size=(200, 260), border=10))))
    assert out.size[0] < 200 and out.size[1] < 260
