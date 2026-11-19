"""단계별 과제 문장과 지침 조립. 지침 본문은 DB(스튜디오 '지침 관리')에서 와요."""

from __future__ import annotations

from typing import Any

STAGE_LABEL = {
    "concept": "① 장르·소재 → 기획안",
    "story": "② 스토리",
    "characters": "③ 인물",
    "style": "④ 화풍",
    "plot": "⑤ 회차 플롯(대본)",
    "storyboard": "⑥ 콘티",
    "art": "⑦ 작화",
    "lettering": "⑧ 말풍선",
    "review": "⑨ 검수",
}

TEXT_STAGES = {"concept", "story", "characters", "style", "plot", "storyboard"}

TASKS = {
    "concept": (
        "대표가 고른 장르, 뿌리 소재, 톤, 메모로 서로 확실히 다른 기획안 3개를 써라. "
        "각 기획안은 뿌리 소재를 이야기의 엔진으로 써야 한다. 마지막에 추천안과 이유를 짧게 적어라."
    ),
    "story": (
        "승인된 기획안으로 시즌 1의 스토리를 설계하라: 시놉시스, 10화 단위 시즌 아크, 회차별 한 줄 요약(최소 30화), "
        "떡밥 장부(심는 화, 회수 화), 회차별 절단 유형 배치표. 첫 3화 법칙과 고구마 규칙을 지켜라."
    ),
    "characters": (
        "승인된 스토리에 필요한 주인공과 주요 등장인물을 설계하라. 인물마다 결핍, 원하는 것, 말투(예시 대사 3개), "
        "호칭 관계, 작화에 그대로 쓸 외모 명세와 고정 소품을 적어라. 마지막에 인물 사이 호칭·존댓말 관계표를 둬라."
    ),
    "style": (
        "작품의 톤과 뿌리에 맞는 화풍 후보 3개를 제안하라. 특정 작가를 모방하지 말고, 각 후보마다 화풍 카드"
        "(선, 채색, 명암, 장면별 팔레트 hex, 배경 처리, 질감, 금지 요소)와 같은 장면의 시험 컷 지시문 3개(영어 이미지 프롬프트)를 써라."
    ),
    "plot": (
        "이번 회차의 전개 설계표(훅, 박자 구간, 절단 유형, 이번에 심고 회수할 떡밥)를 먼저 쓰고, "
        "장면별 대본(장소·시간, 지문, 대사, 내레이션)을 한국어로 써라. 말풍선 하나에 40자 이내."
    ),
    "storyboard": (
        "승인된 대본을 세로 스크롤 콘티로 나눠라. 표로 쓰고 컷마다 번호, 샷 크기, 카메라 각도, 컷 세로 길이(짧음/보통/긺), "
        "앞 여백(없음/보통/긺), 등장인물과 위치, 표정, 조명, 대사(대본 그대로), 효과음, 보이면 안 되는 것, "
        "영어 그림 지시문을 적어라. 마지막에 S-12~S-16 자가 점검 결과를 적어라."
    ),
}


def render_guidelines(versions: list[dict[str, Any]]) -> str:
    """전체 < 장르 < 작품 < 회차 순서의 지침 본문들을 시스템 프롬프트 한 덩어리로."""
    parts: list[str] = []
    for v in versions:
        body = v["body"]
        scope = {"global": "전체", "genre": "장르", "series": "작품", "episode": "회차"}[v["scope"]]
        lines = [f"## {scope} 지침 (v{v['version']})", "", body.get("role", "")]
        rules = body.get("rules") or []
        if rules:
            lines += ["", "### 규칙"]
            lines += [f"- {r['code']} {r['text']}".replace("-  ", "- ") for r in rules]
        banned = body.get("banned") or []
        if banned:
            lines += ["", "### 금지"]
            lines += [f"- {b}" for b in banned]
        if body.get("outputFormat"):
            lines += ["", "### 출력 형식", body["outputFormat"]]
        if body.get("examples"):
            lines += ["", "### 예시", body["examples"]]
        parts.append("\n".join(lines))
    header = (
        "당신은 NORIVA의 제작 에이전트다. NORIVA는 한국의 역사, 설화, 민속을 뿌리로 한 세로 스크롤 웹툰을 "
        "한국어와 영어로 동시에 연재한다. 아래 지침이 겹치면 뒤에 나온(더 좁은 범위의) 지침을 따른다. "
        "결과는 대표가 검토하고 직접 고칠 수 있게 마크다운으로만 쓰고, 앞뒤 인사말은 쓰지 마라."
    )
    return header + "\n\n" + "\n\n".join(parts)


def render_task(stage: str, ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    brief = s["brief"]
    out = [
        f"# 과제: {STAGE_LABEL[stage]}",
        TASKS[stage],
        "",
        "## 작품",
        f"- 제목: {s['title']} / {s.get('title_en') or '(영어 제목 미정)'}",
        f"- 장르: {s['genre']}",
        f"- 연령 등급: {brief.get('ageRating', '')}",
        f"- 톤: {brief.get('tone', '')}",
        f"- 대상 독자: {brief.get('audience', '')}",
        f"- 대표 메모: {brief.get('memo', '')}",
        "",
        "## 뿌리 소재",
    ]
    for src in ctx["sources"]:
        out.append(f"### {src['name']} ({src['era']})")
        out.append(src["summary"])
        if src["rules"]:
            out.append("핵심 규칙: " + "; ".join(src["rules"]))
        if src["visual_notes"]:
            out.append("시각 요소: " + src["visual_notes"])
        if src["caution"]:
            out.append("고증 주의: " + src["caution"])
        if src["overlap_works"]:
            out.append("겹치면 안 되는 기존 작품: " + ", ".join(src["overlap_works"]))
    if ctx.get("episode"):
        ep = ctx["episode"]
        out += ["", "## 이번 회차", f"- {ep['number']}화 {ep.get('title') or ''}", f"- 한 줄 요약: {ep.get('logline') or '(스토리의 회차 요약을 따른다)'}"]
    for label, text in ctx["inputs"]:
        out += ["", f"## 승인된 앞 단계: {label}", text]
    if ctx.get("previous_attempt"):
        out += ["", "## 이전 결과 (대표가 다시 생성을 요청함)", ctx["previous_attempt"]]
    if ctx.get("instruction"):
        out += ["", "## 대표의 추가 지시 (가장 우선)", ctx["instruction"]]
    return "\n".join(out)
