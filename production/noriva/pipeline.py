"""One episode, in two phases with the owner's review between them.

plan:    writer -> storyboard x N -> dialogue check      => waits for the owner
decide:  owner picks a storyboard and edits lines        => recorded in the ledger
produce: episode QA -> art (+image QA, retries) -> voice -> motion => episode.json

Planning before drawing means the owner reviews when changes are cheap, and
images and voices are only paid for once a storyboard is approved.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import agents
from .imaging import trim_border
from .config import Settings
from .ledger import Ledger
from .models import EpisodeScript, ReviewDecision, SeriesBible, Storyboard
from .providers import LLM, ImageGen, Voice


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = data.model_dump_json(indent=2) if hasattr(data, "model_dump_json") else json.dumps(data, indent=2, ensure_ascii=False)
    path.write_text(text, encoding="utf-8")


def _status(run_dir: Path, status: str, **extra) -> dict:
    data = {"status": status, **extra}
    _write(run_dir / "status.json", data)
    return data


def plan_episode(
    bible: SeriesBible, episode_number: int, previously: list[str], llm: LLM, settings: Settings, run_dir: Path
) -> dict:
    ledger = Ledger(run_dir)
    _status(run_dir, "planning")

    script, cost = agents.write_script(llm, bible, episode_number, previously)
    _write(run_dir / "script.json", script)
    ledger.record("script", "agent:writer", "wrote script", {"title": script.title, "scenes": len(script.scenes)}, cost)

    variants = []
    for v in range(settings.storyboard_variants):
        board, cost = agents.storyboard(llm, bible, script, v)
        ledger.record("storyboard", "agent:storyboard", f"drafted variant {v}", {"panels": len(board.panels), "approach": board.approach}, cost)

        review, cost = agents.review_dialogue(llm, bible, board)
        for issue in review.issues:
            _replace_line(board, issue.panel_index, issue.line_index, issue.suggestion)
        ledger.record("dialogue", "agent:dialogue", f"revised variant {v}", {"changes": [i.model_dump() for i in review.issues]}, cost)

        _write(run_dir / f"storyboard_v{v}.json", board)
        variants.append({"variant": v, "approach": board.approach, "panels": len(board.panels)})

    return _status(run_dir, "awaiting_review", variants=variants)


def _replace_line(board: Storyboard, panel_index: int, line_index: int, text: str) -> bool:
    if 0 <= panel_index < len(board.panels):
        lines = board.panels[panel_index].dialogue
        if 0 <= line_index < len(lines):
            lines[line_index].text = text
            return True
    return False


def apply_decision(run_dir: Path, decision: ReviewDecision) -> dict:
    """Record the owner's choice and edits. This record is the evidence of human authorship."""
    ledger = Ledger(run_dir)
    board = Storyboard.model_validate_json((run_dir / f"storyboard_v{decision.chosen_variant}.json").read_text())
    applied = []
    for edit in decision.line_edits:
        if _replace_line(board, edit.panel_index, edit.line_index, edit.suggestion):
            applied.append(edit.model_dump())
    _write(run_dir / "decision.json", decision)
    _write(run_dir / "final_storyboard.json", board)
    ledger.record("review", "owner", f"chose variant {decision.chosen_variant}", {"edits": applied, "note": decision.note})
    return _status(run_dir, "approved", chosen_variant=decision.chosen_variant, edits=len(applied))


def produce_episode(
    bible: SeriesBible,
    previously: list[str],
    llm: LLM,
    image_gen: ImageGen,
    voice: Voice,
    settings: Settings,
    run_dir: Path,
    owner_accepts_qa: bool = False,
    references: dict[str, bytes] | None = None,
) -> dict:
    ledger = Ledger(run_dir)
    board = Storyboard.model_validate_json((run_dir / "final_storyboard.json").read_text())
    _status(run_dir, "producing")

    report, cost = agents.qa_episode(llm, bible, board, previously)
    ledger.record("qa", "agent:qa", "episode check", report.model_dump(), cost)
    if not report.passed or report.score < settings.qa_pass_score:
        if not owner_accepts_qa:
            return _status(run_dir, "needs_owner", reason="episode QA failed", issues=report.issues, score=report.score)
        ledger.record("review", "owner", "accepted episode despite QA notes", {"score": report.score, "issues": report.issues})

    panels_out, flagged = [], []
    for panel in board.panels:
        refs = [references[c] for c in panel.character_ids if references and c in references]
        if refs and len(refs) != len([c for c in panel.character_ids if bible.character(c)]):
            refs = []  # numbering in the prompt must line up with the reference images
        prompt = agents.image_prompt(bible, panel, with_references=bool(refs))
        best: tuple[int, bytes, list[str]] | None = None
        for attempt in range(settings.max_image_attempts):
            img, cost = image_gen.generate(prompt, seed=panel.index * 100 + attempt, references=refs or None)
            img = trim_border(img)
            ledger.record("art", "agent:art", f"panel {panel.index} attempt {attempt}", {"prompt": prompt}, cost)
            qa, cost = agents.qa_image(llm, bible, panel, img)
            ledger.record("qa", "agent:qa", f"panel {panel.index} attempt {attempt}", qa.model_dump(), cost)
            if best is None or qa.score > best[0]:
                best = (qa.score, img, qa.issues)
            if qa.passed and qa.score >= settings.qa_pass_score:
                break
        score, img, issues = best
        image_path = run_dir / "panels" / f"{panel.index:03d}.png"
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(img)
        if score < settings.qa_pass_score:
            flagged.append({"panel": panel.index, "score": score, "issues": issues})

        bubbles = []
        for li, line in enumerate(panel.dialogue):
            audio = None
            voice_id = settings.voice_map.get(line.speaker_id)
            if voice_id:
                mp3, cost = voice.speak(line.text, voice_id)
                audio_path = run_dir / "audio" / f"{panel.index:03d}_{li}.mp3"
                audio_path.parent.mkdir(parents=True, exist_ok=True)
                audio_path.write_bytes(mp3)
                audio = str(audio_path.relative_to(run_dir))
                ledger.record("voice", "agent:voice", f"panel {panel.index} line {li}", {"chars": len(line.text)}, cost)
            bubbles.append({"speaker": line.speaker_id, "emotion": line.emotion, "text": {"en": line.text}, "audio": {"en": audio}})

        panels_out.append(
            {
                "index": panel.index,
                "image": str(image_path.relative_to(run_dir)),
                "motion": panel.motion,
                "sfx": panel.sfx,
                "bubbles": bubbles,
            }
        )

    missing_voices = sorted({b["speaker"] for p in panels_out for b in p["bubbles"] if b["audio"]["en"] is None})
    script = EpisodeScript.model_validate_json((run_dir / "script.json").read_text())
    episode = {
        "series_id": bible.id,
        "episode_number": script.episode_number,
        "title": script.title,
        "summary": script.summary,
        "panels": panels_out,
        "flagged_panels": flagged,
        "cost_usd": ledger.cost_by_stage(),
        "cost_total_usd": ledger.total_cost(),
    }
    _write(run_dir / "episode.json", episode)
    status = "needs_owner" if flagged else "ready"
    return _status(run_dir, status, flagged_panels=flagged, missing_voices=missing_voices, cost_total_usd=ledger.total_cost())


def letter_episode(llm: LLM, run_dir: Path) -> dict:
    """Place bubbles and sound effects on each finished panel. Layout is language-independent,
    so every translation reuses it."""
    ledger = Ledger(run_dir)
    path = run_dir / "episode.json"
    episode = json.loads(path.read_text())
    for panel in episode["panels"]:
        if not panel["bubbles"] and not panel.get("sfx"):
            continue
        image = (run_dir / panel["image"]).read_bytes()
        layout, cost = agents.letter_panel(llm, panel["bubbles"], panel.get("sfx"), image)
        panel["layout"] = layout.model_dump()
        ledger.record("lettering", "agent:letterer", f"panel {panel['index']}", panel["layout"], cost)
    _write(path, episode)
    return _status(run_dir, "lettered", cost_total_usd=ledger.total_cost())
