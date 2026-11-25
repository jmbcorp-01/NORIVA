"""웹소설 단계(docs/07): 분량 세기, 분량 고쳐 쓰기, 퇴고·교정, 실제 DB로 집필 → 퇴고 흐름. 키나 비용이 들지 않아요."""

import os
import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from noriva_worker.config import Config
from noriva_worker.handlers import Tools
from noriva_worker.llm import JSONResult, LLMResult
from noriva_worker.main import process
from noriva_worker.novel import char_count, run_copyedit, run_manuscript, stats
from noriva_worker.prompts import render_guidelines, render_task
from noriva_worker.store import Store

DB = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:5432/noriva")


def text_of(n: int, title: str = "# 1화 소금") -> str:
    para = "가" * 99 + "."  # 100자 문단
    body = "\n\n".join([para] * (n // 100))
    return f"{title}\n\n{body}"


def res(text: str) -> LLMResult:
    return LLMResult(text=text, model="claude-opus-5-5", usage={"input_tokens": 100, "output_tokens": 100}, cost_usd=0.01)


class Writer:
    """write는 순서대로 준비한 원고를, json은 점검(통과)이나 교정 결과를 돌려줘요."""

    def __init__(self, drafts, copyedit=None):
        self.drafts = list(drafts)
        self.copyedit = copyedit
        self.writes = []
        self.jsons = []

    def write(self, system, task):
        self.writes.append((system, task))
        return res(self.drafts.pop(0))

    def json(self, system, task, schema, effort=None, max_tokens=32000):
        self.jsons.append((system, task))
        if "revised" in schema["properties"]:
            return JSONResult(data=self.copyedit, result=res(""))
        return JSONResult(data={"items": [{"code": "N-2", "ok": True, "severity": "major", "note": "ok"}], "summary": "통과"}, result=res(""))


def ctx(**kw):
    c = {"guidelines": [{"scope": "global", "version": 1, "body": {"role": "웹소설", "rules": [{"code": "N-2", "text": "분량"}], "banned": []}}], "inputs": []}
    c.update(kw)
    return c


def test_char_count_ignores_title_and_breaks():
    t = "# 1화 제목\n\n가 나 다\n\n* * *\n\n라마"
    assert char_count(t) == len("가 나 다") + len("라마")
    assert stats(text_of(5200))["in_range"] is True
    assert stats(text_of(3000))["in_range"] is False


def test_manuscript_in_range_is_not_rewritten():
    w = Writer([text_of(5200)])
    body, costs = run_manuscript(ctx(), w, "sys", "task")
    assert len(w.writes) == 1
    assert body["stats"]["chars"] == 5200 and body["length_fixed"] is False
    assert len(costs) == 2  # 초안 + 점검


def test_short_manuscript_gets_one_length_fix():
    w = Writer([text_of(3000), text_of(5300)])
    body, costs = run_manuscript(ctx(), w, "sys", "task")
    assert len(w.writes) == 2
    assert "3000자" in w.writes[1][1] and "늘려라" in w.writes[1][1]
    assert body["length_fixed"] is True and body["stats"]["chars"] == 5300


def test_length_fix_kept_only_if_closer():
    w = Writer([text_of(8000), text_of(9000)])
    body, _ = run_manuscript(ctx(), w, "sys", "task")
    assert body["length_fixed"] is False and body["stats"]["chars"] == 8000


def test_copyedit_keeps_original_and_flags_length():
    draft = text_of(5200)
    ce = {"revised": text_of(4000), "changes": [{"before": "가", "after": "나", "reason": "맞춤법", "kind": "spelling"}], "warnings": [], "summary": "고쳤어요"}
    w = Writer([], copyedit=ce)
    body, costs = run_copyedit(ctx(input_bodies={"manuscript": {"markdown": draft}}, banned_terms=[{"kind": "dialogue_ko", "term": "모든 것이 바뀌었다"}]), w, "sys")
    assert body["original"] == draft and body["markdown"] == ce["revised"]
    assert body["stats_before"]["chars"] == 5200
    assert any(x["kind"] == "length" for x in body["warnings"])
    assert "모든 것이 바뀌었다" in w.jsons[0][1]
    assert len(costs) == 1


def test_copyedit_without_manuscript_stops_before_paying():
    from noriva_worker.visual import StageInputError

    w = Writer([], copyedit={})
    with pytest.raises(StageInputError):
        run_copyedit(ctx(input_bodies={}), w, "sys")
    assert w.jsons == []


def test_novel_prompts_drop_webtoon_wording():
    c = {"series": {"title": "t", "genre": "g", "format": "novel", "brief": {}}, "sources": [], "inputs": []}
    assert "말풍선" not in render_task("plot", c)
    assert "본문은 쓰지 않는다" in render_task("plot", c)
    assert "웹소설" in render_guidelines([], "novel")
    assert "말풍선 하나에 40자" in render_task("plot", {**c, "series": {**c["series"], "format": "webtoon"}})


@pytest.fixture
def store():
    try:
        s = Store(DB)
    except psycopg.OperationalError:
        pytest.skip("로컬 Postgres가 없어요")
    yield s


def _artifact(c, sid, eid, stage, status, body, inputs=()):
    return c.execute(
        "insert into artifacts (series_id, episode_id, stage, status, body, input_artifact_ids) values (%s,%s,%s,%s,%s,%s) returning id",
        (sid, eid, stage, status, Jsonb(body), Jsonb([str(i) for i in inputs])),
    ).fetchone()["id"]


def test_novel_episode_flow_on_db(store):
    c = store.conn
    sid = c.execute(
        "insert into series (slug, title, genre, brief, format) values (%s, '시험 웹소설', '오컬트·호러', %s, 'novel') returning id",
        (f"n-{uuid.uuid4().hex[:8]}", Jsonb({"tone": "", "ageRating": "15", "audience": "", "memo": ""})),
    ).fetchone()["id"]
    e1 = c.execute("insert into episodes (series_id, number) values (%s, 1) returning id", (sid,)).fetchone()["id"]
    e2 = c.execute("insert into episodes (series_id, number) values (%s, 2) returning id", (sid,)).fetchone()["id"]
    _artifact(c, sid, e1, "copyedit", "approved", {"markdown": text_of(5000) + "\n\n지난 회 마지막 문장."})
    plot = _artifact(c, sid, e2, "plot", "approved", {"markdown": "# 2화 플롯"})
    chars = _artifact(c, sid, None, "characters", "approved", {"markdown": "# 인물"})
    research = _artifact(c, sid, None, "research", "approved", {"markdown": "# 고증"})

    # ⑥ 집필
    aid = _artifact(c, sid, e2, "manuscript", "generating", {}, (plot, chars, research))
    jid = c.execute("insert into jobs (type, series_id, episode_id, artifact_id) values ('manuscript', %s, %s, %s) returning id", (sid, e2, aid)).fetchone()["id"]
    w = Writer([text_of(5200, "# 2화")])
    process(store, store.claim_by_id(str(jid), "test"), Tools(writer=w), Config.from_env())
    a = c.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review" and a["body"]["stats"]["chars"] == 5200
    assert "지난 회 마지막 문장." in w.writes[0][1]  # 지난 회 끝부분이 들어감
    assert "웹소설" in w.writes[0][0]
    c.execute("update artifacts set status='approved' where id=%s", (aid,))

    # ⑦ 퇴고·교정
    cid = _artifact(c, sid, e2, "copyedit", "generating", {}, (aid,))
    jid = c.execute("insert into jobs (type, series_id, episode_id, artifact_id) values ('copyedit', %s, %s, %s) returning id", (sid, e2, cid)).fetchone()["id"]
    ce = {"revised": text_of(5200, "# 2화 고침"), "changes": [], "warnings": [{"kind": "banned", "quote": "x", "note": "확인 필요"}], "summary": "s"}
    w2 = Writer([], copyedit=ce)
    process(store, store.claim_by_id(str(jid), "test"), Tools(writer=w2), Config.from_env())
    b = c.execute("select status, body from artifacts where id=%s", (cid,)).fetchone()
    assert b["status"] == "pending_review"
    assert b["body"]["original"].startswith("# 2화\n") and b["body"]["markdown"].startswith("# 2화 고침")
    assert b["body"]["warnings"][0]["kind"] == "banned"
    cost = c.execute("select count(*) n from cost_ledger where series_id=%s", (sid,)).fetchone()
    assert cost["n"] >= 3  # 집필 초안 + 점검 + 교정, 호출마다 바로 기록
