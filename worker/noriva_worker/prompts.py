"""단계별 과제 문장과 지침 조립. 지침 본문은 DB(스튜디오 '지침 관리')에서 와요."""

from __future__ import annotations

from typing import Any

STAGE_LABEL = {
    "concept": "① 장르·소재 → 기획안",
    "story": "② 스토리",
    "characters": "③ 인물",
    "research": "③+ 고증 자료",
    "style": "④ 화풍",
    "sheets": "④+ 인물 시트",
    "plot": "⑤ 회차 플롯(대본)",
    "storyboard": "⑥ 콘티",
    "art": "⑦ 작화",
    "lettering": "⑧ 말풍선",
    "review": "⑨ 검수",
    "manuscript": "⑥ 집필 (웹소설)",
    "copyedit": "⑦ 퇴고·교정 (웹소설)",
}

TEXT_STAGES = {"concept", "story", "characters", "style", "plot", "storyboard", "manuscript"}

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
    "research": (
        "승인된 기획안·스토리·인물과 뿌리 소재를 읽고, 그림에 나오는 옷, 머리 모양, 관모, 무기·도구, 건물, 동물·요괴의 시대 고증을 "
        "항목별로 정리하라. 그림 모델이 그대로 따라 그릴 수 있게 맞는 생김새를 구조까지 쓰고, 근거가 약한 것은 확실성을 낮게 적어라."
    ),
    "style": (
        "시장 웹툰의 완성도를 기준으로 삼고, 작품의 톤과 뿌리에서 나온 고유 요소로 이 작품만의 화풍 후보 3개를 제안하라. "
        "특정 작가를 모방하지 말고, 각 후보마다 화풍 카드(작품 고유 요소, 시장 기준 대비표, 선, 채색, 명암, 장면별 팔레트 hex, "
        "배경 처리, 질감, 장르 연출, 금지 요소)와 같은 장면의 시험 컷 지시문 3개(영어 이미지 프롬프트)를 써라."
    ),
    "plot": (
        "이번 회차의 전개 설계표(훅, 박자 구간, 절단 유형, 이번에 심고 회수할 떡밥)를 먼저 쓰고, "
        "장면별 대본(장소·시간, 지문, 대사, 내레이션)을 한국어로 써라. 말풍선 하나에 40자 이내."
    ),
    "storyboard": (
        "승인된 대본을 세로 스크롤 콘티로 나눠라. 대본의 모든 사건과 대사를 순서대로 담고, 빠뜨리거나 바꾸지 않는다. "
        "장면마다 표 앞에 '장면 연속성표'를 먼저 쓴다: 장소와 고정 배치(문·창·주요 소품이 어느 쪽), 시간과 광원(방향·색), "
        "인물 위치와 화면 방향(마주 보는 두 인물의 좌우는 장면 안에서 바꾸지 않는다, 180도 규칙), 인물별 옷·머리·고정 소품, "
        "장면 안에서 상태가 바뀌는 소품과 바뀌는 컷. 컷마다 '앞 컷에서 이어지는 것'(동작의 다음 순간, 시선, 소품 상태)을 적어 "
        "컷을 한 장씩 따로 그려도 이야기가 이어지게 한다. 원인 컷 없이 결과 컷만 두지 않는다. "
        "장면마다 먼저 연출 의도(사건과 감정 한 줄)를 정하고 그 의도로 샷과 각도를 고른다. "
        "표로 쓰고 컷마다 번호, 샷 크기, 카메라 각도(구체적으로), 깊이(전경·중경·배경), 컷 세로 길이(짧음/보통/긺), "
        "앞 여백(없음/보통/긺), 등장인물과 위치, 표정, 조명, 대사(대본 그대로), 효과음, 보이면 안 되는 것, "
        "앞 컷에서 이어지는 것, 이어 그림(다음 컷과 여백 없이 한 장으로 이어지면 '다음 컷과 이어 그림', 아니면 빈칸), 영어 그림 지시문을 적어라. "
        "이어 그림은 하늘에서 인물로 내려오는 카메라, 떨어지는 사람·물건, 높은 건물·긴 계단·폭포처럼 시선을 아래로 끌고 가는 같은 장면에만, "
        "한 묶음 3컷 이하, 한 화에 서너 묶음까지 쓴다. 대사가 많은 대화 컷과 장면이 바뀌는 곳에는 쓰지 않는다. "
        "마지막에 S-12~S-16, S-19~S-21 자가 점검 결과와 "
        "대본의 대사가 모두 들어갔는지 대조한 결과를 적어라."
    ),
}


# 웹소설 작품(docs/07)에서 과제 문장이 다른 단계. 없는 단계는 TASKS를 그대로 써요.
NOVEL_TASKS = {
    "concept": (
        "대표가 고른 장르, 뿌리 소재, 톤, 메모로 서로 확실히 다른 웹소설 기획안 3개를 써라. 100~150화 장기 연재를 버틸 갈등 구조가 있어야 한다. "
        "각 기획안은 뿌리 소재를 이야기의 엔진으로 써야 한다. 마지막에 추천안과 이유를 짧게 적어라."
    ),
    "story": (
        "승인된 기획안으로 웹소설의 스토리를 설계하라: 시놉시스, 100~150화 큰 흐름(10화 단위 아크), 회차별 한 줄 요약(최소 30화), "
        "떡밥 장부(심는 화, 회수 화), 회차별 절단 유형 배치표, 설정 장부(인물 나이와 관계, 호칭, 시간표, 세계 규칙, 주요 장소). 첫 3화 법칙과 고구마 규칙을 지켜라."
    ),
    "characters": (
        "승인된 스토리에 필요한 주인공과 주요 등장인물을 설계하라. 인물마다 결핍, 원하는 것, 말투(예시 대사 3개), 호칭 관계, "
        "글로 묘사할 때 쓰는 외모 특징과 버릇을 적어라. 마지막에 인물 사이 호칭·존댓말 관계표를 둬라."
    ),
    "plot": (
        "이번 회차의 전개 설계표(첫 문단의 훅, 장면 순서와 장면마다 분량 비중, 절단 유형, 이번에 심고 회수할 떡밥)를 쓰고, "
        "장면마다 장소·시간, 시점 인물, 일어나는 일, 꼭 들어갈 대사 요점을 적어라. 본문은 쓰지 않는다(⑥ 집필이 쓴다)."
    ),
    "manuscript": (
        "승인된 회차 플롯대로 이번 회차의 웹소설 본문을 써라. 첫 줄은 '# 회차 제목', 그다음 본문만 쓴다. "
        "공백 포함 5,000~5,500자(줄바꿈 제외). 첫 문단에서 바로 긴장을 던지고, 지난 회 끝과 자연스럽게 이어지며, 마지막 문단은 플롯의 절단으로 끝낸다. "
        "문단은 1~4문장으로 짧게, 대사는 따옴표로 줄을 바꾼다. 장면 전환은 '* * *'로 표시한다. 설명이나 메모, 인사말은 쓰지 마라."
    ),
}

FORMAT_HEADER = {
    "webtoon": "NORIVA는 한국의 역사, 설화, 민속을 뿌리로 한 세로 스크롤 웹툰을 한국어와 영어로 동시에 연재한다.",
    "novel": "NORIVA는 한국의 역사, 설화, 민속을 뿌리로 한 웹소설을 한국어로 연재한다. 이 작품은 웹소설이라 컷·말풍선·그림 지시는 쓰지 않는다.",
}


def is_novel(ctx: dict[str, Any]) -> bool:
    return (ctx.get("series") or {}).get("format") == "novel"


def render_guidelines(versions: list[dict[str, Any]], format: str = "webtoon") -> str:
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
        f"당신은 NORIVA의 제작 에이전트다. {FORMAT_HEADER.get(format, FORMAT_HEADER['webtoon'])} 아래 지침이 겹치면 뒤에 나온(더 좁은 범위의) 지침을 따른다. "
        "결과는 대표가 검토하고 직접 고칠 수 있게 마크다운으로만 쓰고, 앞뒤 인사말은 쓰지 마라."
    )
    return header + "\n\n" + "\n\n".join(parts)


# 시대 검사에서 같은 기준으로 쓰는 판정 메모. 모양 하나만 보고 다른 나라 옷이라 단정하면 맞는 그림도 떨어져요.
PERIOD_JUDGE_NOTE = (
    "판정 주의: 앞으로 여며 V자로 교차하는 깃은 삼국·통일신라·고려의 저고리에도 있다. 깃이 교차한다는 것만으로 기모노·사무에라고 적지 말고, "
    "작품 시대의 기준(명세, 의상 시트, 실물 사진)과 다를 때만 적는다. 기모노는 발목까지 내려오는 긴 옷, 넓은 오비 허리띠, 넓고 늘어진 소매를 함께 보고 판단한다. "
    "고름은 조선 후기 저고리의 특징이라 그 이전 시대 작품이면 결함이다. 확신이 없으면 치명이 아니라 주요로 적는다."
)


def render_task(stage: str, ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    brief = s["brief"]
    out = [
        f"# 과제: {STAGE_LABEL[stage]}",
        (NOVEL_TASKS.get(stage) if is_novel(ctx) else None) or TASKS[stage],
        "",
        "## 작품",
        f"- 제목: {s['title']} / {s.get('title_en') or '(영어 제목 미정)'}",
        f"- 형식: {'웹소설' if s.get('format') == 'novel' else '웹툰'}",
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
