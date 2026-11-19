"""Pipeline tests with fake providers: no network, no keys, no spend.
They check the wiring (stages, review gate, retries, ledger), not output quality."""

from __future__ import annotations

import json

import pytest

from noriva import pipeline
from noriva.agents import image_prompt
from noriva.config import Settings
from noriva.ledger import Ledger
from noriva.models import (
    Character,
    DialogueIssue,
    DialogueLine,
    DialogueReview,
    EpisodeScript,
    Panel,
    QAReport,
    ReviewDecision,
    Scene,
    SeriesBible,
    Storyboard,
)

BIBLE = SeriesBible(
    id="test-series",
    title="Test",
    genre="occult",
    logline="A shaman's granddaughter hunts a fox spirit in Seoul.",
    tone="dark, warm",
    art_style="clean line art, muted colors",
    world_rules=["Spirits cannot cross salt."],
    characters=[
        Character(id="hana", name="Hana", role="protagonist", appearance="short black hair, red scarf",
                  personality="stubborn", speech_style="dry, sarcastic", voice_profile="20s female, low"),
    ],
    season_arc="Hana learns the fox is her ancestor.",
)


class FakeLLM:
    def __init__(self, image_scores: list[int] | None = None, episode_pass: bool = True):
        self.image_scores = list(image_scores or [95])
        self.episode_pass = episode_pass
        self.calls: list[str] = []

    def structured(self, system, prompt, schema, images=None):
        self.calls.append(schema.__name__)
        if schema is EpisodeScript:
            return EpisodeScript(
                episode_number=1, title="Salt Line", summary="Hana meets the fox.", cliffhanger="The fox knows her name.",
                scenes=[Scene(location="alley", description="night", lines=[DialogueLine(speaker_id="hana", text="Great. Another ghost.")])],
            ), 0.01
        if schema is Storyboard:
            return Storyboard(approach="test", panels=[
                Panel(index=9, shot="wide", description="An alley at night", character_ids=["hana"],
                      dialogue=[DialogueLine(speaker_id="hana", text="Great. Another ghost.")]),
                Panel(index=9, shot="close-up", description="Fox eyes", character_ids=[], dialogue=[]),
            ]), 0.02
        if schema is DialogueReview:
            return DialogueReview(issues=[DialogueIssue(panel_index=0, line_index=0, original="Great. Another ghost.",
                                                        suggestion="Oh, great. Another ghost.", reason="rhythm")]), 0.005
        if schema is QAReport and images:
            score = self.image_scores.pop(0) if len(self.image_scores) > 1 else self.image_scores[0]
            return QAReport(passed=score >= 80, score=score, issues=[] if score >= 80 else ["hands"]), 0.003
        if schema is QAReport:
            return QAReport(passed=self.episode_pass, score=90 if self.episode_pass else 40, issues=[]), 0.004
        raise AssertionError(schema)


class FakeImage:
    def __init__(self):
        self.prompts = []

    def generate(self, prompt, seed=None):
        self.prompts.append(prompt)
        return b"\x89PNG\r\n\x1a\nfake", 0.04


class FakeVoice:
    def speak(self, text, voice_id):
        return b"ID3fake", 0.001


SETTINGS = Settings(storyboard_variants=2, voice_map={"hana": "voice-hana"})


def _plan_and_approve(tmp_path, llm):
    run = tmp_path / "ep001"
    status = pipeline.plan_episode(BIBLE, 1, [], llm, SETTINGS, run)
    assert status["status"] == "awaiting_review"
    pipeline.apply_decision(run, ReviewDecision(chosen_variant=1, line_edits=[
        DialogueIssue(panel_index=0, line_index=0, original="", suggestion="Perfect. Another ghost.", reason="owner")
    ]))
    return run


def test_plan_stops_for_owner_review(tmp_path):
    llm = FakeLLM()
    run = tmp_path / "ep001"
    status = pipeline.plan_episode(BIBLE, 1, [], llm, SETTINGS, run)
    assert status["status"] == "awaiting_review"
    assert [v["variant"] for v in status["variants"]] == [0, 1]
    board = Storyboard.model_validate_json((run / "storyboard_v0.json").read_text())
    assert [p.index for p in board.panels] == [0, 1]  # renumbered
    assert board.panels[0].dialogue[0].text == "Oh, great. Another ghost."  # dialogue agent applied
    assert "QAReport" not in llm.calls  # nothing drawn or checked before approval


def test_owner_decision_is_recorded_and_applied(tmp_path):
    run = _plan_and_approve(tmp_path, FakeLLM())
    final = Storyboard.model_validate_json((run / "final_storyboard.json").read_text())
    assert final.variant == 1
    assert final.panels[0].dialogue[0].text == "Perfect. Another ghost."
    owner = [e for e in Ledger(run).entries() if e["actor"] == "owner"]
    assert owner and owner[0]["detail"]["edits"][0]["suggestion"] == "Perfect. Another ghost."


def test_produce_writes_episode_with_bubbles_as_data(tmp_path):
    run = _plan_and_approve(tmp_path, FakeLLM())
    image = FakeImage()
    status = pipeline.produce_episode(BIBLE, [], FakeLLM(), image, FakeVoice(), SETTINGS, run)
    assert status["status"] == "ready"
    episode = json.loads((run / "episode.json").read_text())
    assert len(episode["panels"]) == 2
    bubble = episode["panels"][0]["bubbles"][0]
    assert bubble["text"]["en"] == "Perfect. Another ghost."
    assert (run / bubble["audio"]["en"]).exists()
    assert "No text, no speech bubbles" in image.prompts[0]
    assert episode["cost_total_usd"] > 0


def test_failed_panel_is_retried_then_flagged(tmp_path):
    run = _plan_and_approve(tmp_path, FakeLLM())
    llm = FakeLLM(image_scores=[50, 60, 70, 95])  # panel 0 fails 3 times; panel 1 passes
    status = pipeline.produce_episode(BIBLE, [], llm, FakeImage(), FakeVoice(), SETTINGS, run)
    assert status["status"] == "needs_owner"
    assert status["flagged_panels"] == [{"panel": 0, "score": 70, "issues": ["hands"]}]


def test_episode_qa_failure_stops_before_spending_on_art(tmp_path):
    run = _plan_and_approve(tmp_path, FakeLLM())
    image = FakeImage()
    status = pipeline.produce_episode(BIBLE, [], FakeLLM(episode_pass=False), image, FakeVoice(), SETTINGS, run)
    assert status["status"] == "needs_owner"
    assert image.prompts == []


def test_image_prompt_carries_fixed_character_design():
    panel = Panel(index=0, shot="medium", description="Hana lights incense", character_ids=["hana"], dialogue=[])
    prompt = image_prompt(BIBLE, panel)
    assert "short black hair, red scarf" in prompt and "muted colors" in prompt


def test_missing_voice_is_reported(tmp_path):
    run = _plan_and_approve(tmp_path, FakeLLM())
    status = pipeline.produce_episode(BIBLE, [], FakeLLM(), FakeImage(), FakeVoice(), Settings(storyboard_variants=2), run)
    assert status["missing_voices"] == ["hana"]


@pytest.mark.parametrize("bible_path", ["../series/occult/bible.json"])
def test_series_bible_file_is_valid(bible_path):
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / bible_path
    if not path.exists():
        pytest.skip("no bible chosen yet")
    SeriesBible.model_validate_json(path.read_text(encoding="utf-8"))
