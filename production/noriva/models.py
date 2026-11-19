"""Data shapes shared by every agent.

Speech-bubble text is stored as data next to each panel, never burned into the
image. One set of images can then serve every language the app adds later.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Character(BaseModel):
    id: str = Field(description="Short slug, e.g. 'hana'")
    name: str
    role: str = Field(description="protagonist, antagonist, mentor, ...")
    appearance: str = Field(description="Fixed visual description used in every image prompt")
    personality: str
    speech_style: str = Field(description="How this character talks in American English")
    voice_profile: str = Field(description="Voice casting note: age, pitch, texture, accent")


class SeriesBible(BaseModel):
    id: str
    title: str
    genre: str
    logline: str
    tone: str
    art_style: str = Field(description="Style guide appended to every image prompt")
    world_rules: list[str]
    period_notes: list[str] = Field(default_factory=list)
    characters: list[Character]
    season_arc: str
    banned_similarities: list[str] = Field(
        default_factory=list,
        description="Existing works, characters or styles the output must not resemble",
    )

    def character(self, char_id: str) -> Character | None:
        return next((c for c in self.characters if c.id == char_id), None)


class DialogueLine(BaseModel):
    speaker_id: str = Field(description="Character id, or 'narration'")
    text: str
    emotion: str = "neutral"


class Scene(BaseModel):
    location: str
    description: str
    lines: list[DialogueLine]


class EpisodeScript(BaseModel):
    episode_number: int
    title: str
    summary: str = Field(description="Two or three sentences, used as memory for later episodes")
    cliffhanger: str
    scenes: list[Scene]


Shot = Literal["establishing", "wide", "medium", "close-up", "extreme close-up", "over-the-shoulder"]
Motion = Literal["none", "slow-pan", "zoom-in", "zoom-out", "shake", "parallax", "fade"]


class Panel(BaseModel):
    index: int
    shot: Shot
    description: str = Field(description="What the image shows, in concrete visual terms")
    character_ids: list[str] = Field(
        description="Characters visible in the image. Off-screen speakers (a voice from a jar, a phone) are not listed."
    )
    dialogue: list[DialogueLine]
    sfx: str | None = None
    motion: Motion = "none"


class Storyboard(BaseModel):
    variant: int = 0
    approach: str = Field(description="One line on how this cut differs from the others")
    panels: list[Panel]


class DialogueIssue(BaseModel):
    panel_index: int
    line_index: int
    original: str
    suggestion: str
    reason: str


class DialogueReview(BaseModel):
    issues: list[DialogueIssue]


class QAReport(BaseModel):
    passed: bool
    score: int = Field(ge=0, le=100)
    issues: list[str]


class ReviewDecision(BaseModel):
    """What the owner chose at the storyboard checkpoint."""

    chosen_variant: int
    line_edits: list[DialogueIssue] = Field(
        default_factory=list, description="Owner's own rewrites; suggestion = new text"
    )
    note: str = ""
