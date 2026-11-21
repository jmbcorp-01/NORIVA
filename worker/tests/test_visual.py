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

    def research(self, system, task, max_searches=15, max_rounds=6):
        from noriva_worker.llm import ResearchResult

        self.calls.append((["research"], task, 0))
        return ResearchResult(
            text="조사. 공식 주소 https://comic.naver.com/webtoon/list?titleId=7",
            links=[{"title": "공식", "url": "https://comic.example/1"}, {"title": "링크 없음 리뷰", "url": "https://review.example/9"}],
            searches=2,
            results=[_r()],
        )

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
        elif "candidates" in props and "scenes" in props:
            data = {
                "candidates": [{"name": f"후보{i}", "medium": ["cel", "ink", "bogus"][i - 1], "card": f"카드 {i}", "style_prompt": f"style {i}"} for i in range(1, 4)],
                "scenes": [{"title": f"장면{i}", "prompt": f"scene {i}"} for i in range(1, 4)],
            }
        elif "works" in props:
            traits = {"line": "가는 선", "coloring": "셀", "shading_steps": 3, "palette": "저채도", "proportions": "8등신",
                      "faces": "눈 작게", "backgrounds": "실사풍", "effects": "역광", "panel_rhythm": "와이드 많음", "avoid": "과한 광택"}
            data = {"works": [
                {"title": "참고작", "platform": "네이버웹툰", "author": "작가", "url": "https://comic.example/1", "why": "시대극", "traits": traits},
                {"title": "링크없음", "platform": "카카오", "author": "", "url": "https://made.up/x", "why": "", "traits": traits},
                {"title": "공식작", "platform": "네이버웹툰", "author": "", "url": "https://comic.naver.com/webtoon/list?titleId=99", "why": "", "traits": traits},
            ]}
        elif "is_artwork" in props:
            w = Image.open(io.BytesIO(images[0])).size[0]
            data = {"is_artwork": w >= 20, "line": "측정 선", "coloring": "셀", "shading_steps": 2, "palette": "", "proportions": "",
                    "faces": "", "backgrounds": "", "effects": "집중선", "panel_rhythm": "", "avoid": ""}
        elif "shading_steps" in props:
            data = {"line": "굵은 외곽선", "coloring": "셀", "shading_steps": 2, "palette": "고채도", "proportions": "8등신",
                    "faces": "눈 중간", "backgrounds": "색면", "effects": "집중선", "panel_rhythm": "클로즈업 많음", "avoid": "수채"}
        elif list(props) == ["era", "items"]:
            data = {"era": "통일신라 8세기", "items": [
                {"id": "sword", "category": "weapon", "name": "환두대도", "who": ["순정"], "description": "straight sword with a gold ring pommel",
                 "mistakes": ["코등이 있는 일본도"], "search": ["ring pommel sword"], "certainty": "high"},
                {"id": "dragon", "category": "creature", "name": "동해 용", "who": [], "description": "seal-like sea dragon", "mistakes": [], "search": [], "certainty": "low"},
                {"id": "hair", "category": "hair", "name": "머리 모양", "who": ["모든 인물"], "description": "small topknot covered by a plain cloth cap",
                 "mistakes": ["이마 띠"], "search": [], "certainty": "medium"},
            ]}
        elif "photos" in props and "matches:" in task:
            data = {"photos": [{"index": 0, "matches": True, "real_photo": True, "note": "실물"}]}
        elif "scenes" in props and "candidates" not in props:
            data = {"scenes": [{"title": f"장면{i}", "prompt": f"reviewed scene {i}. Avoid: katana, tsuba", "changes": "칼을 뺐어요" if i == 2 else ""} for i in range(1, 4)]}
        elif "issues" in props:
            # 화풍 샘플 시대 검사: 첫 샘플만 걸려서 한 번 더 그림
            self.sample_checks = getattr(self, "sample_checks", 0) + 1
            data = {"issues": [{"item": "망건", "severity": "critical", "fix": "Hair in a low knot with a cloth tie."}] if self.sample_checks == 1 else []}
        elif "그리기 전 명세 글 검사" in task:
            self.lint_tasks = getattr(self, "lint_tasks", []) + [task]
            data = {"characters": [{"id": "Sun Jeong", "appearance": "", "period_notes": "", "never": ["curved katana", "tsuba"], "changes": "금지 목록을 줄였어요"}], "props": []}
        elif list(props) in (["characters"], ["characters", "props"], ["characters", "props", "attire"]):
            data = {"characters": [
                {"id": "Sun Jeong", "name": "순정", "kind": "person", "role": "main", "appearance": "man, 30, topknot, dark navy durumagi",
                 "period_notes": "straight ring-pommel sword, no guard", "hair": "small topknot tied with a thin cord, bare forehead", "never": ["curved katana", "tsuba"]},
                {"id": "cow", "name": "누렁소", "kind": "animal", "role": "minor", "appearance": "yellow ox", "period_notes": "", "hair": "", "never": []},
            ], "props": [{"id": "sword", "name": "환두대도", "owners": ["Sun Jeong", "nobody"], "description": "straight sword with a gold ring pommel", "search": ["ring pommel sword"]}],
               "attire": [{"id": "silla_man", "name": "신라 남자 옷차림", "owners": ["Sun Jeong", "cow"], "description": "short jacket closed with a belt, wide trousers", "search": ["Silla clay figurine"]}]}
        elif "photos" in props:
            data = {"photos": [{"index": 0, "prop_ids": ["sword"], "real_photo": True, "note": "실물"}]}
        elif "violations" in props:
            # 원본 마스터에는 소의 긴 뿔이 있고, 한 번 지우면 없어져요
            self.screens = getattr(self, "screens", 0) + 1
            data = {"violations": [{"item": "긴 뿔", "character_ids": ["cow"], "note": "마스터의 소가 긴 뿔"}] if self.screens % 2 == 1 else []}
        elif "updates" in props:
            self.fix_tasks = getattr(self, "fix_tasks", []) + [task]
            data = {"updates": [{"id": "cow", "appearance": "yellow ox with short horns", "period_notes": "", "never": ["long horns"],
                                 "edit": "Make both horns short."}], "rules": ["누렁소의 뿔은 짧다.", " "]}
        elif list(props) == ["variants", "recommended"]:
            # 부품 후보: 두 번째 후보에 코등이가 보인다고 표시하고 첫 번째를 권함
            data = {"variants": [{"index": 1, "issues": [{"item": "코등이", "severity": "critical"}]}], "recommended": 0}
        elif list(props) == ["parts", "defects"]:
            # 인물 시트: 첫 시트는 잠긴 칼과 달라 불합격, 고쳐 그린 둘째는 합격 (인물별로 셈)
            key = task.split('"id": "')[1].split('"')[0]
            self.sheet_seen = getattr(self, "sheet_seen", {})
            self.sheet_seen[key] = self.sheet_seen.get(key, 0) + 1
            ok = self.sheet_seen[key] % 2 == 0
            self.sheet_tasks = getattr(self, "sheet_tasks", []) + [task]
            data = {"parts": [] if ok or key != "sunjeong" else [{"id": "sword", "matches": False, "note": "코등이가 있음"}],
                    "defects": [{"code": "K-1", "severity": "minor", "note": "작은 차이"}] if ok else ([] if key == "sunjeong" else [{"code": "GA-3", "severity": "critical", "note": "일본도"}])}
        elif list(props) == ["defects"]:
            # 인물마다 첫 시트는 불합격, 둘째는 합격 (병렬로 돌아도 인물별로 셈)
            key = task.split('"id": "')[1].split('"')[0]
            self.sheet_seen = getattr(self, "sheet_seen", {})
            self.sheet_seen[key] = self.sheet_seen.get(key, 0) + 1
            ok = self.sheet_seen[key] % 2 == 0
            data = {"defects": [{"code": "K-1", "severity": "minor", "note": "작은 차이"}] if ok else [{"code": "GA-3", "severity": "critical", "note": "일본도"}]}
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
        self.calls = []

    def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
        self.prompts.append((prompt, len(references or [])))
        self.calls.append({"aspect": aspect_ratio, "model": model})
        return ImageResult(data=png(border=4), model=model or "fake/img", cost_usd=0.04)


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
    assert "Character turnaround sheet" in images.prompts[0][0]
    assert [c["aspect"] for c in images.calls[1:]][:1] == ["9:16"]  # 긴 컷은 세로로 길게
    p2 = art["panels"][1]
    assert p2["passed"] and p2["score"] == 88 and len(p2["candidates"]) == 2
    assert images.prompts[-1][1] == 1  # 인물 시트를 참조로 넘김
    assert "torii" not in images.prompts[-1][0]  # 금지 단어는 검사에서만 써요
    assert "Dynamic cinematic webtoon composition" in images.prompts[-1][0]
    assert (tmp_path / p2["image"]).exists()
    assert art["characters"][0]["sheet"].startswith(f"series/{sid}/refs/")
    cost = c.execute("select provider, units, cost_usd from cost_ledger where series_id=%s order by provider", (sid,)).fetchall()
    assert {r["provider"] for r in cost} == {"anthropic", "fal"}
    fal = [r for r in cost if r["provider"] == "fal"]
    # 그림 값은 그릴 때마다 바로 한 줄씩 적혀요 (CLAUDE.md 1-3)
    assert sum(r["units"]["calls"] for r in fal) == 5 and round(sum(float(r["cost_usd"]) for r in fal), 4) == 0.2

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
    review_call = [x for x in model.calls if "items" in x[0]][-1]
    assert review_call[2] == 2 and "첨부 그림은 순서대로 1컷, 2컷" in review_call[1]  # 검수가 컷 그림을 직접 봄


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


def test_art_test_panels_compare_and_adopt(store, tmp_path):
    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=1))
    inputs = [
        _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"}),
        _approved(c, sid, None, "style", {"markdown": "먹선"}),
        _approved(c, sid, None, "characters", {"markdown": "하나: 17세"}),
    ]
    # 처음 작화: 시험 컷 1장만 그리고 나머지는 대기
    art_id, art = _run(store, tools, sid, eid, "art", inputs)
    assert art["pending"] == [2] and art["test_panels"] == [1] and art["summary"]["drawn"] == 1

    # 같은 시험 컷을 두 모델로 비교
    c.execute("update artifacts set status='pending_review' where id=%s", (art_id,))
    models = ["fal-ai/nano-banana", "fal-ai/nano-banana-pro"]
    cmp_id, cmp = _run(store, tools, sid, eid, "art", inputs, payload={"panels": [1], "base_artifact_id": str(art_id), "compare_models": models}, attempt=2)
    v = cmp["panels"][0]["variants"]
    assert [x["model"] for x in v] == models and all(x["image"] for x in v)
    assert cmp["pending"] == [2]

    # Pro로 정하고 나머지 그리기: 시험 컷은 Pro 그림을 쓰고, 2컷은 Pro로 그림
    images.calls.clear()
    _, done = _run(store, tools, sid, eid, "art", inputs, payload={"panels": [2], "base_artifact_id": str(cmp_id), "adopt_model": models[1]}, attempt=3)
    assert done["pending"] == [] and done["panels"][0]["image"] == v[1]["image"]
    assert "variants" not in done["panels"][0]
    assert images.calls[-1]["model"] == models[1]


def test_style_samples_criteria_and_masters_feed_art(store, tmp_path):
    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    media.put("_private/refs/a.png", png())
    c.execute("update series set brief = %s where id = %s", (Jsonb({"styleRefs": ["refs/a.png"]}), sid))
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=0))
    concept = _approved(c, sid, None, "concept", {"markdown": "기획"})
    chars = _approved(c, sid, None, "characters", {"markdown": "하나: 17세"})

    style_id, style = _run(store, tools, sid, None, "style", [concept, chars])
    assert style["kind"] == "style" and style["criteria"]["shading_steps"] == 2
    assert len(style["candidates"]) == 3 and all(len(cd["samples"]) == 3 and all(cd["samples"]) for cd in style["candidates"])
    assert len(images.prompts) == 10 and "기준 값" in style["markdown"]
    # 시대 검사에 걸린 샘플은 고칠 점을 넣어 한 번 더 그리고, 통과하면 표시가 남지 않음
    assert sum("Draw these details correctly: Hair in a low knot" in p for p, _ in images.prompts) == 1
    assert all(all(x == [] for x in cd["sample_issues"]) for cd in style["candidates"])
    # 그리기 전에 장면 지시를 고증 점검으로 다시 쓰고, 금지 단어 목록은 지움
    assert all("reviewed scene" in p and "Avoid" not in p and "katana" not in p for p, _ in images.prompts)
    assert [s.get("changes") for s in style["scenes"]] == ["", "칼을 뺐어요", ""]
    crit_call = next(call for call in model.calls if "shading_steps" in call[0])
    assert crit_call[2] == 1  # 참고 캡처는 기준 값 분석에만 쓰여요
    assert all(n == 0 for _, n in images.prompts)  # 그림 모델에는 참고 캡처를 보내지 않아요

    # 대표가 후보 2와 그림 두 장을 고른 상태로 승인 → 작화가 그 화풍 문구와 마스터를 참조로 씀
    masters = [style["candidates"][1]["samples"][0], style["candidates"][1]["samples"][1]]
    c.execute("update artifacts set body = body || %s, status='approved' where id=%s", (Jsonb({"chosen": 1, "style_masters": masters}), style_id))
    images.prompts.clear()
    inputs = [_approved(c, sid, eid, "storyboard", {"markdown": "| 1 |"}), style_id, chars]
    _, art = _run(store, tools, sid, eid, "art", inputs)
    assert art["style_prompt"] == "style 2"
    assert [cd["medium"] for cd in style["candidates"]] == ["cel", "ink", "cel"]
    assert "ink-wash" in images.prompts[0][0] and "flat cel shading" not in images.prompts[-1][0]  # 고른 후보의 바탕으로 그림
    assert images.prompts[0][1] == 2  # 인물 시트도 마스터 2장을 보고 그림
    assert images.prompts[-1][1] == 3 and "style masters" in images.prompts[-1][0]  # 마스터 2 + 인물 시트 1


def test_style_scout_suggestions_feed_style_without_names(store, tmp_path, monkeypatch):
    import noriva_worker.style_scout as ss

    fetched = []
    monkeypatch.setattr(ss, "fetch_cover", lambda url: fetched.append(url) or (None if "comic.example" in url else png()))
    looked = []

    def lookup(title, author, platform):
        looked.append(title)
        return ("https://comic.naver.com/webtoon/list?titleId=5", ["https://cdn/logo.png", "https://cdn/x.jpg"]) if title == "링크없음" else ("", [])

    monkeypatch.setattr(ss, "lookup_platform", lookup)
    # 첫 그림은 작은 로고 → 웹툰 그림이 아니라고 판정되고, 다음 그림으로 재요
    monkeypatch.setattr(ss, "fetch_image", lambda url: png(size=(10, 10)) if "logo" in url else png())
    c = store.conn
    sid, _ = _series(c)
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=LocalMedia(str(tmp_path)), image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=0))
    concept = _approved(c, sid, None, "concept", {"markdown": "조선 기획"})
    c.execute("update series set brief = %s where id = %s", (Jsonb({"styleChoice": [4]}), sid))
    jid = c.execute("insert into jobs (type, series_id) values ('style_scout', %s) returning id", (sid,)).fetchone()["id"]
    process(store, store.claim_by_id(jid, "test"), tools, Config.from_env())
    assert c.execute("select status from jobs where id=%s", (jid,)).fetchone()["status"] == "done"
    brief = c.execute("select brief from series where id=%s", (sid,)).fetchone()["brief"]
    works = brief["styleSuggestions"]["works"]
    assert [w["title"] for w in works] == ["참고작", "링크없음", "공식작"]
    assert looked == ["참고작", "링크없음", "공식작"]
    assert works[1]["url"] == "https://comic.naver.com/webtoon/list?titleId=5"  # 지어낸 주소 대신 플랫폼 검색 주소
    assert works[2]["url"].startswith("https://comic.naver.com/")  # 공식 플랫폼 주소는 인용 없어도 받아요
    assert "styleChoice" not in brief  # 새로 찾으면 전에 고른 건 풀어요
    # 링크가 있는 작품은 공식 대표 이미지를 보고 다시 재요 (글로 추정한 값 대신)
    # 플랫폼 검색 그림이 있으면 그걸로, 없으면 작품 주소의 대표 이미지로 재요
    assert fetched == ["https://comic.example/1", "https://comic.naver.com/webtoon/list?titleId=99"]
    assert not works[0]["measured"] and works[1]["measured"] and works[2]["measured"]
    assert works[0]["traits"]["shading_steps"] == 3 and works[1]["traits"]["line"] == "측정 선" and "is_artwork" not in works[1]["traits"]
    measures = [call for call in model.calls if "is_artwork" in call[0]]
    assert len(measures) == 3  # 링크없음: 로고 1 + 그림 1, 공식작: 그림 1

    c.execute("update series set brief = brief || %s where id = %s", (Jsonb({"styleChoice": [1]}), sid))
    model.calls.clear()
    _, style = _run(store, tools, sid, None, "style", [concept])
    plan = next(call for call in model.calls if "candidates" in call[0])
    assert "참고 화풍 A" in plan[1] and "집중선" in plan[1] and "링크없음" not in plan[1]  # 특징만, 이름은 빼고
    assert style["picked"] == ["링크없음 (카카오)"] and "링크없음" not in style["markdown"]
    assert all("링크없음" not in p for p, _ in images.prompts)


# ── 시험 컷, 모델 요청 모양 (DB 없이) ──

from noriva_worker.images import request_for  # noqa: E402
from noriva_worker.visual import choose_test_panels  # noqa: E402


def test_choose_test_panels_keeps_first_last_and_people():
    panels = [{"index": i, "character_ids": ["a"] if i % 3 == 0 else []} for i in range(1, 41)]
    picked = choose_test_panels(panels, 5)
    assert picked[0] == 1 and picked[-1] == 40 and len(picked) == 5
    assert all(i % 3 == 0 for i in picked[1:-1])
    assert choose_test_panels(panels[:3], 5) == [1, 2, 3]


def test_request_for_maps_models():
    ep, body = request_for("fal-ai/bytedance/seedream/v4", "p", "9:16", None)
    assert ep.endswith("/text-to-image") and body["image_size"] == {"width": 1152, "height": 2048} and "aspect_ratio" not in body
    ep, body = request_for("fal-ai/nano-banana-pro", "p", "4:3", [b"x"])
    assert ep == "fal-ai/nano-banana-pro/edit" and body["resolution"] == "2K" and body["aspect_ratio"] == "4:3" and len(body["image_urls"]) == 1


def test_panel_prompt_refs_all_cast_and_counts_people_only():
    from noriva_worker.visual import _panel_prompt

    cast = [
        {"id": "a", "name": "A", "kind": "person", "appearance": "x"},
        {"id": "b", "name": "B", "kind": "person", "appearance": "y"},
        {"id": "c", "name": "C", "appearance": "z"},
        {"id": "cow", "name": "Cow", "kind": "animal", "appearance": "yellow cow"},
    ]
    p = _panel_prompt("st", {"shot": "wide", "description": "d"}, cast, cast, "", 1)
    assert "Reference image 5 is the design sheet for Cow" in p
    assert "Exactly 3 visible person(s)." in p
    assert "Also visible: Cow." in p


def test_kind_of_guesses_for_old_plans():
    from noriva_worker.visual import kind_of

    assert kind_of({"id": "cow", "name": "누렁소 (The Cow)", "appearance": "a yellow ox"}) == "animal"
    assert kind_of({"id": "oldman", "name": "노인", "appearance": "old man in his 70s, leading a cow"}) == "person"
    assert kind_of({"id": "x", "name": "y", "kind": "creature", "appearance": "z"}) == "creature"


def test_commons_license_filter():
    from noriva_worker.commons import license_ok

    assert license_ok("CC BY-SA 4.0") and license_ok("Public domain") and license_ok("CC0") and license_ok("KOGL Type 1")
    assert not license_ok("CC BY-NC-SA 2.0") and not license_ok("CC BY-ND 4.0") and not license_ok("") and not license_ok("Fair use")


def test_sheets_stage_then_art_uses_fixed_sheets(store, tmp_path, monkeypatch):
    from noriva_worker import commons

    searched = []
    monkeypatch.setattr(commons, "search_commons", lambda q, limit=6: searched.append(q) or [
        {"title": "Ring sword.jpg", "url": "https://x/r.jpg", "page": "https://commons/r", "license": "CC BY-SA 4.0", "artist": "Museum"}])
    monkeypatch.setattr(commons, "fetch", lambda url: png())
    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=0))
    master = media.put(f"series/{sid}/style/m.png", png())
    style = _approved(c, sid, None, "style", {"kind": "style", "markdown": "먹선", "chosen": 0, "style_masters": [master],
                                              "candidates": [{"name": "먹선", "medium": "ink", "card": "", "style_prompt": "ink wash style", "samples": [master]}]})
    chars = _approved(c, sid, None, "characters", {"markdown": "순정: 신라 화랑"})

    # 1. 부품 단계: 소품·옷차림·주인공 머리 모양을 싼 모델로 4장씩 그리고, 인물 시트는 아직 그리지 않아요
    parts_art, pb = _run(store, tools, sid, None, "sheets", [chars, style])
    assert pb["phase"] == "parts" and [x["id"] for x in pb["characters"]] == ["sunjeong", "cow"]
    assert [(p["id"], p["kind"]) for p in pb["parts"]] == [("sword", "object"), ("silla_man", "attire"), ("sunjeong_hair", "hair")]
    assert all(len(p["variants"]) == 4 and p["locked"] is None for p in pb["parts"])
    assert len(images.prompts) == 12 and all(call["model"] == "fal-ai/nano-banana" for call in images.calls)
    assert not any("turnaround sheet" in p for p, _ in images.prompts)
    sword = pb["parts"][0]
    assert sword["variants"][1]["issues"][0]["item"] == "코등이" and sword["recommended"] == 0 and sword["photos"] == 1
    hair = pb["parts"][2]
    assert hair["owners"] == ["sunjeong"] and "Hairstyle and headwear reference sheet" in [p for p, _ in images.prompts if "bare forehead" in p][0]
    # 공용 사진은 소품·옷만 찾고(머리 모양은 고증 자료 사진만), 맞지 않는 사진은 쓰지 않고 기록에 남김
    assert searched == [["ring pommel sword"], ["Silla clay figurine"]]
    assert [(x["prop"], x["accepted"]) for x in pb["search_log"]] == [("sword", 1), ("silla_man", 0)]
    assert pb["found_photos"][0]["image"].endswith("ref-sword-1.jpg")

    # 2. 관문: 잠그지 않은 부품이 있으면 인물 시트를 그리지 않아요
    images.prompts.clear()
    aid = c.execute("insert into artifacts (series_id, stage, status, attempt, input_artifact_ids) values (%s, 'sheets', 'generating', 2, %s) returning id",
                    (sid, Jsonb([str(chars), str(style)]))).fetchone()["id"]
    jid = c.execute("insert into jobs (type, series_id, artifact_id, payload) values ('sheets', %s, %s, %s) returning id",
                    (sid, aid, Jsonb({"mode": "compose", "base_artifact_id": str(parts_art)}))).fetchone()["id"]
    process(store, store.claim_by_id(jid, "test"), tools, Config.from_env())
    assert "잠그지 않은 부품" in c.execute("select error from jobs where id=%s", (jid,)).fetchone()["error"] and not images.prompts

    # 3. 대표가 부품마다 후보를 골라 잠그면, 잠근 부품만 참고해서 인물 시트를 그려요
    for p in pb["parts"]:
        p["locked"] = p["variants"][0]["image"]
    c.execute("update artifacts set body=%s where id=%s", (Jsonb(pb), parts_art))
    sid_art, sheets = _run(store, tools, sid, None, "sheets", [chars, style], payload={"mode": "compose", "base_artifact_id": str(parts_art)}, attempt=3)
    assert sheets["phase"] == "sheets" and not any("Prop design sheet" in p or "reference sheet" in p for p, _ in images.prompts)
    sj = sheets["characters"][0]
    # 첫 시트는 잠긴 칼과 달라(P-1) 불합격 → 그 부분만 고쳐 그려 합격
    assert len(sj["candidates"]) == 2 and sj["passed"] and sj["score"] == 97
    assert sj["candidates"][0]["defects"][0]["code"] == "P-1" and sj["part_checks"] == [
        {"id": "sunjeong_hair", "name": "순정 머리 모양", "matches": True, "note": ""},
        {"id": "silla_man", "name": "신라 남자 옷차림", "matches": True, "note": ""},
        {"id": "sword", "name": "환두대도", "matches": True, "note": ""}]
    sheet_prompts = [(p, n) for p, n in images.prompts if "turnaround sheet" in p]
    # 순정: 화풍 마스터 + 잠긴 머리·옷·칼 = 4장, 고쳐 그릴 때는 첫 시트 + 잠긴 부품 3장
    assert [n for p, n in sheet_prompts if "approved hairstyle and headwear" in p] == [4, 4]
    # 잠긴 부품과 다른 곳은 금지어 없이 '그 참고 그림과 똑같이'로 고쳐요
    assert any(p.startswith("Edit reference image 1, a character design turnaround sheet")
               and "Make this object's shape, size and fittings wherever it appears identical to reference image 4." in p
               and "P-1" not in p for p, _ in sheet_prompts)
    # 옷차림 그림 속 인물의 머리는 따라 그리지 않고, 전신 그림의 머리는 클로즈업과 같게
    first = sheet_prompts[0][0]
    assert "ignore the face, hair and headwear of the figure" in first and "small heads of the full-body views" in first
    assert "잠근 부품 그림" in model.sheet_tasks[0]
    assert not any("katana" in p for p, _ in sheet_prompts) and all("no view labels" in p for p, _ in sheet_prompts)
    assert sheets["summary"] == {"characters": 2, "passed": 2, "parts": 3, "parts_locked": 3}
    assert [p["locked"] for p in sheets["parts"]] == [p["locked"] for p in pb["parts"]]
    # 원본 마스터에 금지 소품이 있으면 지운 깨끗한 마스터를 씀
    assert images.prompts[0][0].startswith("Edit reference image 1. Remove these things completely: 긴 뿔")
    assert sheets["clean_masters"] and sheets["master_warnings"] == []

    # 4. 고른 인물만 다시 그리기: 잠근 부품 그대로, 지시는 그 인물에게만
    images.prompts.clear()
    c.execute("update artifacts set status='approved' where id=%s", (sid_art,))
    _, again = _run(store, tools, sid, None, "sheets", [chars, style], payload={"chars": ["cow"], "base_artifact_id": str(sid_art), "instruction": "뿔을 짧게"}, attempt=4)
    assert "뿔을 짧게" in model.fix_tasks[-1]
    # 첫 번째는 이전 시트 한 장을 참조로 고칠 곳만 편집, 두 번째는 새 명세로 새로 그림
    assert images.prompts[0][0].startswith("Edit reference image 1") and "Make both horns short." in images.prompts[0][0] and images.prompts[0][1] == 1
    assert "yellow ox with short horns" in images.prompts[1][0] and "뿔을 짧게" in images.prompts[1][0]
    assert again["characters"][0]["sheet"] == sj["sheet"] and again["redrawn"] == ["cow"]
    cow = again["characters"][1]
    assert cow["appearance"] == "yellow ox with short horns" and cow["never"] == ["long horns"]
    assert again["rule_suggestions"] == ["누렁소의 뿔은 짧다."]

    # 5. 부품 하나만 후보 다시 그리기: 그 부품만 새로 4장, 다른 부품의 잠금은 그대로
    images.prompts.clear()
    _, redo = _run(store, tools, sid, None, "sheets", [chars, style], payload={"mode": "parts", "parts": ["sword"], "base_artifact_id": str(parts_art), "instruction": "고리를 크게"}, attempt=5)
    assert len(images.prompts) == 4 and all("Director's note: 고리를 크게" in p for p, _ in images.prompts)
    assert redo["parts"][0]["locked"] is None and redo["parts"][1]["locked"] == pb["parts"][1]["locked"] and redo["redrawn_parts"] == ["sword"]

    # ⑦ 작화는 승인된 시트와 명세를 그대로 써요 (시트를 새로 그리지 않음)
    images.prompts.clear()
    board = _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"})
    _, art = _run(store, tools, sid, eid, "art", [board, style, chars, sid_art])
    assert not any("Character turnaround sheet" in p for p, _ in images.prompts)
    assert [x["id"] for x in art["characters"]] == ["sunjeong", "cow"]
    assert art["characters"][0]["sheet"] == sj["sheet"]
    # 그림 지시는 화풍 기본 문장으로 시작해요 (저장 경로가 끼어들면 안 돼요)
    assert images.prompts and not any(p.startswith("series/") for p, _ in images.prompts)
    check_tasks = [t for props, t, _ in model.calls if "people_count" in props]
    assert check_tasks and "먹선의 굵기 변화" in check_tasks[0]  # 먹선 화풍이면 잉크 질감을 결함으로 보지 않음


def test_panel_prompt_adds_locked_part_refs():
    from noriva_worker.visual import _panel_prompt

    cast = [{"id": "sunjeong", "name": "순정", "kind": "person", "appearance": "young hwarang"}]
    parts = [{"name": "환두대도", "owner_name": "순정", "data": b""}]
    p = _panel_prompt("st", {"shot": "wide", "description": "d"}, cast, cast, "", 1, "BASE.", parts)
    assert p.startswith("BASE.")
    assert "Reference image 2 is the design sheet for 순정" in p
    assert "Reference image 3 is the approved, period-accurate design of 환두대도 (순정)" in p
    assert "Do not add these objects if the panel does not call for them." in p
    assert "period-accurate design" not in _panel_prompt("st", {"shot": "wide", "description": "d"}, cast, cast, "", 1)


def test_part_variants_survive_no_output_errors(store, tmp_path, monkeypatch):
    """그림 모델이 422 '그림 없음'을 내도 작업 전체가 멈추지 않아요: 사진 없이 다시 그려 보고, 안 되면 그 후보만 빼요."""
    from noriva_worker import commons
    from noriva_worker.images import NoImageError

    monkeypatch.setattr(commons, "search_commons", lambda q, limit=6: [
        {"title": "Ring sword.jpg", "url": "https://x/r.jpg", "page": "https://commons/r", "license": "CC BY-SA 4.0", "artist": "Museum"}])
    monkeypatch.setattr(commons, "fetch", lambda url: png())
    c = store.conn
    sid, _ = _series(c)
    media = LocalMedia(str(tmp_path))
    model = FakeModel()

    class Flaky(FakeImages):
        def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
            if "short jacket closed with a belt" in prompt:  # 옷차림은 늘 실패
                raise NoImageError("no output")
            if references and seed is not None and seed % 2:  # 사진을 넣은 홀수 씨앗은 실패
                raise NoImageError("no output")
            return super().generate(prompt, seed, references, aspect_ratio, model)

    images = Flaky()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=0))
    master = media.put(f"series/{sid}/style/m.png", png())
    style = _approved(c, sid, None, "style", {"kind": "style", "markdown": "먹선", "chosen": 0, "style_masters": [master],
                                              "candidates": [{"name": "먹선", "medium": "ink", "card": "", "style_prompt": "ink wash style", "samples": [master]}]})
    chars = _approved(c, sid, None, "characters", {"markdown": "순정: 신라 화랑"})
    _, pb = _run(store, tools, sid, None, "sheets", [chars, style])
    by = {p["id"]: p for p in pb["parts"]}
    assert len(by["sword"]["variants"]) == 4 and "error" not in by["sword"]  # 사진 없이 다시 그려서 4장
    assert by["silla_man"]["variants"] == [] and "다시 그려" in by["silla_man"]["error"]
    assert len(by["sunjeong_hair"]["variants"]) == 4 and pb["phase"] == "parts"


def test_commons_queries_are_shortened():
    from noriva_worker.commons import _queries

    assert _queries(['"Gyeongju National Museum iron sword"', "환두대도", "", "ring pommel sword"]) == [
        "Gyeongju National Museum iron sword", "Gyeongju National Museum", "환두대도", "ring pommel sword"]


def test_research_stage_feeds_style_and_sheets(store, tmp_path, monkeypatch):
    """③+ 고증 자료: 항목과 확인된 실물 사진을 정리하고, ④ 화풍 장면 점검과 ④+ 소품 시트가 같은 자료를 써요."""
    from noriva_worker import commons

    searched = []
    monkeypatch.setattr(commons, "search_commons", lambda q, limit=6: searched.append(q) or [
        {"title": "Sword.jpg", "url": "https://x/s.jpg", "page": "https://commons/s", "license": "CC0", "artist": "Museum"}])
    monkeypatch.setattr(commons, "fetch", lambda url: png())
    c = store.conn
    sid, _ = _series(c)
    media = LocalMedia(str(tmp_path))
    model, images = FakeModel(), FakeImages()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=1, parallel=1, test_panels=0))
    chars = _approved(c, sid, None, "characters", {"markdown": "순정: 신라 화랑"})

    rid, research = _run(store, tools, sid, None, "research", [chars])
    assert research["kind"] == "research" and research["era"] == "통일신라 8세기"
    sword, story_dragon, hair = research["items"]
    assert sword["id"] == "sword" and sword["photos"][0]["license"] == "CC0" and sword["photos"][0]["image"].endswith("sword-1.jpg")
    assert story_dragon["photos"] == [] and searched == [["ring pommel sword"]]  # 설화 속 존재는 사진을 찾지 않아요
    assert "생김새: straight sword" in research["markdown"] and not images.prompts  # 그림은 그리지 않아요

    # ④ 화풍: 장면 점검과 샘플 검사가 고증 자료를 기준으로 봐요
    _, style = _run(store, tools, sid, None, "style", [chars, rid])
    review = [t for props, t, _ in model.calls if list(props) == ["scenes"]][-1]
    assert "③+ 고증 자료" in review and "straight sword with a gold ring pommel" in review

    # ④+: 고증 자료의 사진을 소품 시트에 쓰고 공용을 다시 찾지 않아요
    searched.clear()
    master = media.put(f"series/{sid}/style/m.png", png())
    style_ok = _approved(c, sid, None, "style", {"kind": "style", "markdown": "셀", "chosen": 0, "style_masters": [master],
                                                 "candidates": [{"name": "셀", "medium": "cel", "card": "", "style_prompt": "cel style", "samples": [master]}]})
    parts_art, sheets = _run(store, tools, sid, None, "sheets", [chars, style_ok, rid])
    assert sheets["found_photos"][0]["image"] == sword["photos"][0]["image"]
    assert searched == [["Silla clay figurine"]]  # 의상은 고증 자료에 사진이 없어서 공용에서 찾음
    spec_task = [t for props, t, _ in model.calls if list(props) == ["characters", "props", "attire"]][-1]
    assert "고증 자료" in spec_task
    # 그리기 전에 명세 글을 고증 자료와 맞춰 보고, 고친 것을 남겨요
    assert "③+ 고증 자료" in model.lint_tasks[-1] and "small topknot" in model.lint_tasks[-1]
    assert sheets["spec_fixes"] and sheets["spec_fixes"][0]["changes"] == "금지 목록을 줄였어요"
    # 부품 후보 검사도 고증 자료를 기준으로 봐요
    review_tasks = [t for props, t, _ in model.calls if list(props) == ["variants", "recommended"]]
    assert review_tasks and all("straight sword with a gold ring pommel" in t for t in review_tasks)
    # 잠근 뒤 조합: 마스터는 문제가 있을 때만 고쳐 그리고(원본을 먼저 검사), 어떤 그림에서 만들었는지 남겨요
    for p in sheets["parts"]:
        p["locked"] = p["variants"][0]["image"]
    c.execute("update artifacts set body=%s where id=%s", (Jsonb(sheets), parts_art))
    _, composed = _run(store, tools, sid, None, "sheets", [chars, style_ok, rid], payload={"mode": "compose", "base_artifact_id": str(parts_art)}, attempt=2)
    assert composed["clean_from"] == [master] and composed["phase"] == "sheets"
    master_screen = [t for props, t, _ in model.calls if "violations" in props][-1]
    assert "people" in master_screen and "③+ 고증 자료" in master_screen


def test_rhythm_warnings_find_repeated_shots_and_flat_angles():
    from noriva_worker.visual import rhythm_warnings

    ps = [{"index": i + 1, "shot": s, "camera": c} for i, (s, c) in enumerate(
        [("wide", "high angle"), ("close-up", "eye level"), ("close-up", "eye level"), ("close-up", "eye level"), ("medium", "eye level"), ("wide", "low angle")])]
    w = rhythm_warnings(ps)
    assert any(x.startswith("2~4컷") for x in w) and any("정면 눈높이" in x for x in w)


def test_sheet_retries_stop_when_stalled_or_over_budget():
    """고쳐 그려도 치명 결함이 줄지 않으면 멈추고, 다시 그리기 비용 상한을 넘으면 더 그리지 않아요."""
    from noriva_worker.sheets import _Budget, _stalled

    crit = {"code": "H-6", "severity": "critical", "note": "코등이"}
    assert not _stalled([{"defects": [crit], "score": 70}])
    assert _stalled([{"defects": [crit], "score": 70}, {"defects": [crit], "score": 70}])
    assert not _stalled([{"defects": [crit, crit], "score": 40}, {"defects": [crit], "score": 70}])
    b = _Budget(0.1)
    assert b.ok()
    b.spend({"cost_usd": 0.15})
    assert not b.ok() and _Budget(0).ok()


def test_fal_retries_no_output_with_new_seed(monkeypatch):
    import httpx

    from noriva_worker.images import FalImage, NoImageError

    monkeypatch.setenv("FAL_KEY", "test")
    fal = FalImage("fal-ai/nano-banana", 0.04)
    seeds = []

    def post(url, body, fail=[2]):
        seeds.append(body["seed"])
        if fail[0]:
            fail[0] -= 1
            req = httpx.Request("POST", url)
            raise httpx.HTTPStatusError("422", request=req, response=httpx.Response(422, text='{"detail":"did not generate the expected output"}', request=req))
        return httpx.Response(200, json={"images": [{"url": "data:image/png;base64,"}]})

    monkeypatch.setattr(fal, "_post", post)
    fal.generate("p", seed=5)
    assert len(seeds) == 3 and len(set(seeds)) == 3

    seeds.clear()
    monkeypatch.setattr(fal, "_post", lambda url, body: post(url, body, [9]))
    with pytest.raises(NoImageError):
        fal.generate("p", seed=5)
    assert len(seeds) == 3


def test_fix_text_points_to_locked_refs_without_naming_bad_items():
    from noriva_worker.sheets import _fix_text

    props = [{"id": "h", "kind": "hair"}, {"id": "a", "kind": "attire"}, {"id": "s", "kind": "object"}]
    defects = [
        {"code": "P-1", "severity": "critical", "note": "머리: 이마띠", "part": "h"},
        {"code": "P-1", "severity": "minor", "note": "옷: 버클", "part": "a"},
        {"code": "K-1", "severity": "major", "note": "흉터 없음"},
        {"code": "V-7", "severity": "minor", "note": "선"},
    ]
    t = _fix_text(defects, props)
    assert "identical to reference image 2" in t and "full-body front, side and back views" in t
    assert "reference image 3" not in t and "이마띠" not in t  # 경미한 부품 차이는 고치지 않고, 금지 물건 이름은 쓰지 않아요
    assert "Also fix: K-1 흉터 없음" in t and "V-7" not in t


def test_art_resumes_after_interruption(store, tmp_path):
    """작화가 도중에 끊기면, 다시 시작할 때 같은 컷 목록과 끝난 컷을 그대로 쓰고 남은 컷만 그려요."""
    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model = FakeModel()

    class Dies(FakeImages):
        def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
            if len(self.prompts) >= 2:  # 인물 시트 1장, 첫 컷 1장을 그린 뒤 멈춰요 (다시 해도 안 되는 오류)
                from noriva_worker.images import ImageNotConfiguredError
                raise ImageNotConfiguredError("키 없음")
            return super().generate(prompt, seed, references, aspect_ratio, model)

    first, second = Dies(), FakeImages()
    inputs = [
        _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"}),
        _approved(c, sid, None, "style", {"markdown": "먹선, 한지색"}),
        _approved(c, sid, None, "characters", {"markdown": "하나: 17세"}),
    ]
    aid = c.execute(
        "insert into artifacts (series_id, episode_id, stage, status, attempt, input_artifact_ids) values (%s, %s, 'art', 'generating', 1, %s) returning id",
        (sid, eid, Jsonb([str(i) for i in inputs])),
    ).fetchone()["id"]
    jid = c.execute("insert into jobs (type, series_id, episode_id, artifact_id, payload) values ('art', %s, %s, %s, %s) returning id",
                    (sid, eid, aid, Jsonb({}))).fetchone()["id"]
    settings = ArtSettings(candidates=1, parallel=1, test_panels=0)
    process(store, store.claim_by_id(jid, "test"), Tools(writer=model, media=media, image_factory=lambda: first, art=settings), Config.from_env())
    assert c.execute("select status from jobs where id=%s", (jid,)).fetchone()["status"] == "failed"
    # 멈춰도 끝난 컷은 보여 줘요
    failed = c.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert failed["status"] == "failed" and failed["body"]["kind"] == "art_partial" and failed["body"]["drawn"] == 1
    assert failed["body"]["panels"][0]["image"] and failed["body"]["job_id"] == str(jid)
    plans = sum(1 for props, _, _ in model.calls if "style_prompt" in props)
    # '이어서 그리기' (웹 resumeJob과 같은 일)
    c.execute("update jobs set status='queued', error=null, attempts=0, run_after=now() where id=%s", (jid,))
    c.execute("update artifacts set status='generating' where id=%s", (aid,))

    process(store, store.claim_by_id(jid, "test"), Tools(writer=model, media=media, image_factory=lambda: second, art=settings), Config.from_env())
    a = c.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review", a["body"]
    assert sum(1 for props, _, _ in model.calls if "style_prompt" in props) == plans  # 컷 목록을 새로 짜지 않아요
    assert len(second.prompts) == len(a["body"]["panels"]) - 1  # 끝난 1컷은 다시 그리지 않아요
    assert all(p.get("image") for p in a["body"]["panels"])
    # 첫 시도에서 쓴 그림 값도 비용에 남아요
    n = c.execute("select coalesce(sum((units->>'images')::int), 0) as n from cost_ledger where job_id=%s and provider='fal'", (jid,)).fetchone()["n"]
    # 실패한 첫 시도에서 그린 인물 시트·첫 컷까지 모두, 한 번씩만 적혀요
    assert n == len(first.prompts) + len(second.prompts) == len(a["body"]["panels"]) + 1


def test_art_skips_panel_blocked_by_safety_filter(store, tmp_path):
    """그림 모델이 한 컷을 거부해도(안전 필터) 작업은 끝나고, 그 컷만 이유와 함께 비워 둬요."""
    from noriva_worker.images import NoImageError

    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model = FakeModel()

    class Strict(FakeImages):
        def generate(self, prompt, seed=None, references=None, aspect_ratio="3:4", model=None):
            if "Hana stares at salt" in prompt:
                raise NoImageError("그림 모델의 안전 필터에 걸렸어요")
            return super().generate(prompt, seed, references, aspect_ratio, model)

    images = Strict()
    tools = Tools(writer=model, media=media, image_factory=lambda: images, art=ArtSettings(candidates=2, parallel=1, test_panels=0))
    inputs = [
        _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"}),
        _approved(c, sid, None, "style", {"markdown": "먹선, 한지색"}),
        _approved(c, sid, None, "characters", {"markdown": "하나: 17세"}),
    ]
    _, art = _run(store, tools, sid, eid, "art", inputs)
    assert [b["index"] for b in art["blocked"]] == [2] and "안전 필터" in art["blocked"][0]["note"]
    assert art["panels"][0]["image"] and art["panels"][1]["image"] is None and 2 not in art["pending"]


def test_fal_content_policy_is_no_image(monkeypatch):
    import httpx

    from noriva_worker.images import FalImage, NoImageError

    monkeypatch.setenv("FAL_KEY", "test")
    fal = FalImage("fal-ai/nano-banana-pro", 0.15)

    def post(url, body):
        req = httpx.Request("POST", url)
        raise httpx.HTTPStatusError("422", request=req, response=httpx.Response(
            422, text='{"detail":[{"type":"content_policy_violation","msg":"flagged by a content checker"}]}', request=req))

    monkeypatch.setattr(fal, "_post", post)
    with pytest.raises(NoImageError, match="안전 필터"):
        fal.generate("p", seed=1)


def test_art_rechecks_old_images_instead_of_redrawing(store, tmp_path):
    """저장된 진행 기록이 없어도(예전 코드로 멈춘 작업), 같은 결과물에 그려 둔 그림이 있으면 검사만 다시 해서 써요."""
    import shutil

    c = store.conn
    sid, eid = _series(c)
    media = LocalMedia(str(tmp_path))
    model = FakeModel()
    first, second = FakeImages(), FakeImages()
    inputs = [
        _approved(c, sid, eid, "storyboard", {"markdown": "| 1 | 원경 | 마을 |"}),
        _approved(c, sid, None, "style", {"markdown": "먹선, 한지색"}),
        _approved(c, sid, None, "characters", {"markdown": "하나: 17세"}),
    ]
    aid = c.execute(
        "insert into artifacts (series_id, episode_id, stage, status, attempt, input_artifact_ids) values (%s, %s, 'art', 'generating', 1, %s) returning id",
        (sid, eid, Jsonb([str(i) for i in inputs])),
    ).fetchone()["id"]
    jid = c.execute("insert into jobs (type, series_id, episode_id, artifact_id, payload) values ('art', %s, %s, %s, %s) returning id",
                    (sid, eid, aid, Jsonb({}))).fetchone()["id"]
    settings = ArtSettings(candidates=1, parallel=1, test_panels=0)
    process(store, store.claim_by_id(jid, "test"), Tools(writer=model, media=media, image_factory=lambda: first, art=settings), Config.from_env())
    panels_drawn = sum(1 for p, _ in first.prompts if "One single webtoon panel" in p)
    assert panels_drawn == 2
    # 예전 코드처럼 진행 기록이 없는 상태로 되돌리고 같은 작업을 다시 돌려요
    shutil.rmtree(tmp_path / f"series/{sid}/ep001/art/{aid}/_progress")
    c.execute("update jobs set status='queued', attempts=0 where id=%s", (jid,))
    c.execute("update artifacts set status='generating' where id=%s", (aid,))
    class Passing(FakeModel):  # 다시 검사하면 합격하는 경우
        checks = property(lambda self: 2, lambda self, v: None)

    model = Passing()
    checks_before = 0
    process(store, store.claim_by_id(jid, "test"), Tools(writer=model, media=media, image_factory=lambda: second, art=settings), Config.from_env())
    a = c.execute("select status, body from artifacts where id=%s", (aid,)).fetchone()
    assert a["status"] == "pending_review", a["body"]
    assert not any("One single webtoon panel" in p for p, _ in second.prompts)  # 새로 그린 컷 없음
    assert sum(1 for props, _, _ in model.calls if "people_count" in props) - checks_before == 2  # 검사만 2번
    assert all(p["image"] for p in a["body"]["panels"])


def test_same_critical_stops_redraws_and_attire_override_prompt():
    from noriva_worker.visual import _panel_prompt, _same_critical

    a = {"defects": [{"code": "H-6", "severity": "critical"}, {"code": "K-1", "severity": "major"}]}
    b = {"defects": [{"code": "H-6", "severity": "critical"}]}
    c = {"defects": [{"code": "K-1", "severity": "major"}]}
    assert _same_critical(a, b) and not _same_critical(a, c) and not _same_critical(c, c)

    cast = [{"id": "suro", "name": "수로", "kind": "person", "appearance": "woman"}]
    parts = [{"name": "신라 여인 옷", "owner_name": "수로", "data": b"", "kind": "attire", "overrides": True}]
    p = _panel_prompt("st", {"shot": "wide", "description": "d"}, cast, cast, "", 1, "BASE.", parts)
    assert "Reference image 3 is the approved, period-accurate costume of 수로" in p
    assert "Where the design sheet differs from this reference, follow this reference." in p
