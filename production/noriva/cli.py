"""Command line for running one episode by hand until the admin page exists.

  python -m noriva plan    --bible ../series/occult/bible.json --episode 1
  python -m noriva decide  --run runs/<series>/ep001 --variant 1 [--edits edits.json]
  python -m noriva produce --bible ../series/occult/bible.json --run runs/<series>/ep001
  python -m noriva cost    --run runs/<series>/ep001
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import Settings, missing_keys
from .ledger import Ledger
from .models import DialogueIssue, ReviewDecision, SeriesBible


def _load_bible(path: str) -> SeriesBible:
    return SeriesBible.model_validate_json(Path(path).read_text(encoding="utf-8"))


def _previously(run_root: Path, episode_number: int) -> list[str]:
    summaries = []
    for n in range(1, episode_number):
        script = run_root / f"ep{n:03d}" / "script.json"
        if script.exists():
            summaries.append(json.loads(script.read_text())["summary"])
    return summaries


def _require(keys: list[str]) -> None:
    missing = [k for k in missing_keys() if k in keys]
    if missing:
        sys.exit(f"Missing environment variables: {', '.join(missing)}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="noriva")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan")
    p.add_argument("--bible", required=True)
    p.add_argument("--episode", type=int, required=True)
    p.add_argument("--runs", default="runs")

    d = sub.add_parser("decide")
    d.add_argument("--run", required=True)
    d.add_argument("--variant", type=int, required=True)
    d.add_argument("--edits", help="JSON list of {panel_index, line_index, original, suggestion, reason}")
    d.add_argument("--note", default="")

    r = sub.add_parser("produce")
    r.add_argument("--bible", required=True)
    r.add_argument("--run", required=True)
    r.add_argument("--accept-qa", action="store_true", help="Owner overrides a failed episode QA; recorded in the ledger")

    c = sub.add_parser("cost")
    c.add_argument("--run", required=True)

    args = ap.parse_args(argv)
    settings = Settings.from_env()

    from . import pipeline

    if args.cmd == "plan":
        _require(["ANTHROPIC_API_KEY"])
        from .providers.anthropic_llm import AnthropicLLM

        bible = _load_bible(args.bible)
        run_root = Path(args.runs) / bible.id
        result = pipeline.plan_episode(
            bible, args.episode, _previously(run_root, args.episode), AnthropicLLM(settings), settings, run_root / f"ep{args.episode:03d}"
        )
    elif args.cmd == "decide":
        edits = [DialogueIssue(**e) for e in json.loads(Path(args.edits).read_text())] if args.edits else []
        result = pipeline.apply_decision(Path(args.run), ReviewDecision(chosen_variant=args.variant, line_edits=edits, note=args.note))
    elif args.cmd == "produce":
        _require(["ANTHROPIC_API_KEY", "FAL_KEY", "ELEVENLABS_API_KEY"])
        from .providers.anthropic_llm import AnthropicLLM
        from .providers.elevenlabs_voice import ElevenLabsVoice
        from .providers.fal_image import FalImage

        bible = _load_bible(args.bible)
        ref_dir = Path(args.bible).parent / "refs"
        references = {f.stem: f.read_bytes() for f in ref_dir.glob("*.jpg")} if ref_dir.is_dir() else {}
        run_dir = Path(args.run)
        episode_number = int(run_dir.name.removeprefix("ep"))
        result = pipeline.produce_episode(
            bible, _previously(run_dir.parent, episode_number), AnthropicLLM(settings), FalImage(settings), ElevenLabsVoice(settings), settings, run_dir,
            owner_accepts_qa=args.accept_qa,
            references=references,
        )
    else:
        ledger = Ledger(Path(args.run))
        result = {"by_stage_usd": ledger.cost_by_stage(), "total_usd": ledger.total_cost()}

    print(json.dumps(result, indent=2, ensure_ascii=False))
