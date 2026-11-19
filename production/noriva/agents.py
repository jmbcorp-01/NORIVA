"""The production agents. Each is a function over a provider, so it can be tested
with fakes and its prompt read in one place."""

from __future__ import annotations

from .models import (
    DialogueReview,
    EpisodeScript,
    Panel,
    QAReport,
    SeriesBible,
    Storyboard,
)
from .providers import LLM


def _bible_text(bible: SeriesBible) -> str:
    return bible.model_dump_json(indent=2)


# --- Writer ---------------------------------------------------------------

WRITER_SYSTEM = """You are the head writer of a vertical-scroll webtoon for American readers.
The stories draw on Korean history, folk painting (minhwa) and folktales, told with the pacing
of a modern Korean drama: a strong hook in the first panels, emotional beats, and a cliffhanger.

Write the script directly in natural, contemporary American English. Do not write as if
translating from Korean: use the idioms, contractions and rhythm American readers expect,
and keep each character's speech style from the series bible. Korean terms (hanbok, gut,
dokkaebi) may stay when the context makes them clear on first use.

Webtoon constraints: one episode is about 45-60 panels read on a phone. A speech bubble holds
at most about 25 words. Favor showing over telling. Never imitate the characters, plots or
signature scenes of existing works listed under banned_similarities, or any other
recognizable copyrighted work."""


def write_script(llm: LLM, bible: SeriesBible, episode_number: int, previously: list[str]) -> tuple[EpisodeScript, float]:
    recap = "\n".join(f"- Ep {i + 1}: {s}" for i, s in enumerate(previously)) or "(this is the first episode)"
    prompt = f"""Series bible:
{_bible_text(bible)}

Story so far:
{recap}

Write episode {episode_number}. Break it into scenes with every line of dialogue and narration.
End on the cliffhanger."""
    return llm.structured(WRITER_SYSTEM, prompt, EpisodeScript)


# --- Storyboard -----------------------------------------------------------

STORYBOARD_SYSTEM = """You are a webtoon storyboard artist. Turn a script into a panel-by-panel
vertical-scroll storyboard. For each panel give the shot type, a concrete visual description an
illustrator can draw without the script (setting, lighting, pose, expression), which characters
appear, the dialogue lines placed in that panel, an optional sound effect, and a motion hint for
the motion-webtoon layer (use 'none' for most panels; reserve movement for key beats).
Keep the dialogue text exactly as written in the script."""

APPROACHES = [
    "Faithful: follow the script's order with clear, steady pacing.",
    "Cinematic: more establishing shots and close-ups, slower reveals, bigger cliffhanger panel.",
    "Tense: shorter panels, faster cuts, and horror beats held in silent panels.",
]


def storyboard(llm: LLM, bible: SeriesBible, script: EpisodeScript, variant: int) -> tuple[Storyboard, float]:
    approach = APPROACHES[variant % len(APPROACHES)]
    prompt = f"""Series bible:
{_bible_text(bible)}

Episode script:
{script.model_dump_json(indent=2)}

Storyboard approach for this version: {approach}
Set variant={variant} and describe the approach in one line."""
    board, cost = llm.structured(STORYBOARD_SYSTEM, prompt, Storyboard)
    board.variant = variant
    for i, panel in enumerate(board.panels):
        panel.index = i
    return board, cost


# --- Dialogue (American English check) -------------------------------------

DIALOGUE_SYSTEM = """You are an American dialogue editor for comics. Flag lines that sound
translated, stiff, dated, or unlike how that character would talk in the US today, and lines
too long for a speech bubble (over ~25 words). Suggest a natural rewrite that keeps the meaning
and the character's voice. Do not flag lines that are already fine. Indexes are zero-based."""


def review_dialogue(llm: LLM, bible: SeriesBible, board: Storyboard) -> tuple[DialogueReview, float]:
    prompt = f"""Characters:
{[c.model_dump() for c in bible.characters]}

Storyboard panels with dialogue:
{board.model_dump_json(indent=2)}"""
    return llm.structured(DIALOGUE_SYSTEM, prompt, DialogueReview)


# --- Art prompt -------------------------------------------------------------

def image_prompt(bible: SeriesBible, panel: Panel) -> str:
    """Fixed character descriptions go into every prompt to keep faces and clothes stable."""
    cast = []
    for cid in panel.character_ids:
        c = bible.character(cid)
        if c:
            cast.append(f"{c.name}: {c.appearance}")
    parts = [
        f"Webtoon panel, {panel.shot} shot.",
        panel.description,
        ("Characters: " + " | ".join(cast)) if cast else "",
        f"Style: {bible.art_style}",
        "No text, no speech bubbles, no letters, no watermark.",
    ]
    return " ".join(p for p in parts if p)


# --- QA ---------------------------------------------------------------------

QA_IMAGE_SYSTEM = """You are the quality reviewer for a webtoon. Judge one panel image against
its storyboard description and the fixed character designs. Fail it for: wrong number of people,
a character who does not match their design, anatomy errors (hands, faces), any visible text or
watermark, a style that drifts from the style guide, or a resemblance to a well-known existing
character or franchise. Score 0-100; pass only if the panel is publishable as is."""


def qa_image(llm: LLM, bible: SeriesBible, panel: Panel, image: bytes) -> tuple[QAReport, float]:
    cast = [bible.character(cid).model_dump() for cid in panel.character_ids if bible.character(cid)]
    prompt = f"""Storyboard panel:
{panel.model_dump_json(indent=2)}

Character designs: {cast}
Style guide: {bible.art_style}
Banned similarities: {bible.banned_similarities}"""
    return llm.structured(QA_IMAGE_SYSTEM, prompt, QAReport, images=[image])


QA_EPISODE_SYSTEM = """You are the final editor for a webtoon episode. Check the storyboard for
continuity with the series bible and earlier episodes, clarity of the story beat by beat, a
working hook and cliffhanger, consistent character voices, and any resemblance to existing
works. Score 0-100; pass only if it is ready to publish."""


def qa_episode(llm: LLM, bible: SeriesBible, board: Storyboard, previously: list[str]) -> tuple[QAReport, float]:
    prompt = f"""Series bible:
{_bible_text(bible)}

Earlier episodes: {previously}

Final storyboard:
{board.model_dump_json(indent=2)}"""
    return llm.structured(QA_EPISODE_SYSTEM, prompt, QAReport)
