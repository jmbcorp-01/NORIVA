"""④ 화풍 참고작 찾기.

승인한 ① 기획안, ② 스토리, ③ 인물을 읽고 웹 검색으로 분위기·장르·독자층이 맞는 시장 웹툰 5편을 찾아요.
작품마다 공식 페이지 링크, 어울리는 이유, 측정 가능한 화풍 특징(선, 채색, 비율 등)을 정리해요.
대표가 고른 작품의 '특징'만 화풍 후보 쓰기에 들어가고, 작품·작가 이름과 그림은 그림 모델에 가지 않아요.
"""

from __future__ import annotations

import html
import re
from typing import Any, Callable
import logging
from urllib.parse import urljoin, urlparse

from .images import thumbnail
from .scout import ROOT_RULES
from .style import CRITERIA_SCHEMA, CRITERIA_TASK
from .visual import _STR, _arr, _obj

log = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 6 * 1024 * 1024
# 공식 연재 플랫폼 주소는 인용 목록에 없어도 받아요 (받아서 열리는지는 대표 이미지를 받을 때 확인돼요)
OFFICIAL_HOSTS = (
    "comic.naver.com", "series.naver.com", "webtoon.kakao.com", "page.kakao.com", "webtoons.com",
    "lezhin.com", "ridibooks.com", "toptoon.com", "bomtoon.com", "mrblue.com",
)
_GENERIC_OG = re.compile(r"/shared/ogImage|/og[_-]?default|/common/og|/static/comic/images/og_tag|logo", re.I)
_URL = re.compile(r"https?://[^\s)\]>\"']+")


def _official(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in OFFICIAL_HOSTS)


def _image_sources(w: dict[str, Any], url: str, links: list[dict[str, str]]) -> list[str]:
    """대표 이미지를 받아 볼 주소들: 작품 주소, 그 작품을 다룬 인용 링크(리뷰 글의 대표 이미지도 보통 작품 표지예요)."""
    out = [url] if url else []
    title = w["title"].replace(" ", "")
    for l in links:
        if title and title in (l.get("title") or "").replace(" ", "") and l["url"] not in out:
            out.append(l["url"])
    return out[:4]
_OG = re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]*>', re.I)
_CONTENT = re.compile(r'content=["\']([^"\']+)["\']', re.I)


def fetch_cover(url: str) -> bytes | None:
    """작품 공식 페이지의 대표 이미지(og:image)를 받아요. 화풍 측정에만 쓰고 저장하지 않아요."""
    import httpx

    try:
        with httpx.Client(timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (compatible; NorivaStudio/1.0)"}) as http:
            page = http.get(url)
            if page.status_code != 200:
                return None
            if "titleId=" in url and "titleId=" not in str(page.url):
                return None  # 없는 작품이라 첫 화면으로 돌려보내졌어요 (그 화면 대표 이미지는 사이트 로고)
            tag = _OG.search(page.text[:400_000])
            m = _CONTENT.search(tag.group(0)) if tag else None
            if not m:
                return None
            src = urljoin(str(page.url), html.unescape(m.group(1)))
            if _GENERIC_OG.search(src):
                return None  # 사이트 공용 대표 이미지(로고)는 작품 그림이 아니에요
            img = http.get(src)
            if img.status_code != 200 or not img.headers.get("content-type", "").startswith("image/") or len(img.content) > MAX_IMAGE_BYTES:
                return None
            return img.content
    except Exception:  # noqa: BLE001 - 못 받으면 글로 추정한 값을 그대로 둬요
        return None


_UA = {"User-Agent": "Mozilla/5.0 (compatible; NorivaStudio/1.0)"}


def _norm(t: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", (t or "").lower())


def _pick(items: list[dict[str, Any]], title: str, author: str, name_of: Callable[[dict[str, Any]], str], authors_of: Callable[[dict[str, Any]], str]) -> dict[str, Any] | None:
    """제목이 같은 작품을 고르고, 여럿이면 작가 이름이 겹치는 쪽을 골라요."""
    want = _norm(title)
    same = [it for it in items if _norm(name_of(it)) == want] or [it for it in items if want and want in _norm(name_of(it))]
    if not same:
        return None
    names = [_norm(a) for a in re.split(r"[,/·()]", author or "") if _norm(a)]
    for it in same:
        if any(n in _norm(authors_of(it)) for n in names):
            return it
    return same[0]


def lookup_platform(title: str, author: str, platform: str) -> tuple[str, list[str]]:
    """제목으로 네이버웹툰·카카오웹툰 검색을 불러 (작품 주소, 대표 그림 주소들)을 돌려줘요. 못 찾으면 ("", [])."""
    import httpx

    def naver(http: Any) -> tuple[str, list[str]]:
        r = http.get("https://comic.naver.com/api/search/all", params={"keyword": title})
        items = ((r.json().get("searchWebtoonResult") or {}).get("searchViewList")) or []
        it = _pick(
            items, title, author, lambda x: x.get("titleName", ""),
            lambda x: (x.get("displayAuthor") or "") + " ".join(a.get("name", "") for a in x.get("communityArtists") or []),
        )
        if not it or not it.get("titleId"):
            return "", []
        return f"https://comic.naver.com/webtoon/list?titleId={it['titleId']}", [u for u in [it.get("thumbnailUrl")] if u]

    def kakao(http: Any) -> tuple[str, list[str]]:
        r = http.get("https://gateway-kw.kakao.com/search/v2/content", params={"word": title, "offset": 0, "limit": 5})
        items = ((r.json().get("data") or {}).get("content")) or []
        it = _pick(items, title, author, lambda x: x.get("title", ""), lambda x: " ".join(a.get("name", "") for a in x.get("authors") or []))
        if not it or not it.get("id"):
            return "", []
        imgs = [it.get(k) for k in ("featuredCharacterImageA", "featuredCharacterImageB")]  # titleImage는 제목 로고라 빼요
        return f"https://webtoon.kakao.com/content/{it.get('seoId') or '-'}/{it['id']}", [u for u in imgs if u][:2]

    order = [kakao, naver] if "카카오" in (platform or "") else [naver, kakao]
    try:
        with httpx.Client(timeout=15, follow_redirects=True, headers=_UA) as http:
            for fn in order:
                try:
                    page, imgs = fn(http)
                except Exception:  # noqa: BLE001 - 한 플랫폼이 실패하면 다음 플랫폼으로
                    continue
                if page:
                    return page, imgs
    except Exception:  # noqa: BLE001
        pass
    return "", []


def fetch_image(url: str) -> bytes | None:
    """그림 주소에서 바로 받아요. 확장자 없는 카카오 CDN 주소는 .webp도 시도해요."""
    import httpx

    try:
        with httpx.Client(timeout=15, follow_redirects=True, headers=_UA) as http:
            for u in (url, url + ".webp") if not re.search(r"\.(jpe?g|png|webp|gif)(\?|$)", url, re.I) else (url,):
                r = http.get(u)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") and len(r.content) <= MAX_IMAGE_BYTES:
                    return r.content
    except Exception:  # noqa: BLE001
        return None
    return None


SYSTEM = ROOT_RULES + """
당신은 NORIVA의 아트 디렉터예요. 우리 작품에 맞는 화풍을 정하기 전에, 시장에서 검증된 웹툰 중 분위기·장르·독자층이 닮은 작품을 찾아요.
- 네이버웹툰, 카카오웹툰, 카카오페이지, 레진, 리디, 네이버 시리즈 등 공식 플랫폼에서 연재 중이거나 완결된 세로 스크롤 컬러 웹툰만 골라요.
- 작품 존재, 플랫폼, 작가, 연재 시기는 검색으로 확인한 것만 써요. 확인 못 한 작품은 넣지 않아요.
- 화풍 특징은 그 작품을 따라 그리기 위한 게 아니라 우리 그림이 넘어야 할 완성도 기준을 정하려는 거예요. 캐릭터 디자인이나 장면은 묘사하지 말고 측정 가능한 특징만 적어요.
- 다섯 작품은 서로 화풍 결이 달라야 대표가 비교해서 고를 수 있어요 (예: 어두운 실사풍, 부드러운 로맨스풍, 선명한 액션풍).
"""


def scout_task(ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    brief = s.get("brief") or {}
    parts = [
        f"작품: {s['title']} / 장르: {s['genre']} / 연령: {brief.get('ageRating', '')} / 톤: {brief.get('tone', '')} / 독자: {brief.get('audience', '')}",
        "",
        "## 뿌리 소재",
        *[f"- {src['name']}: {src['summary']}" for src in ctx["sources"]],
    ]
    for label, text in ctx["inputs"]:
        parts += ["", f"## 승인된 {label}", text[:10000]]
    parts += [
        "",
        "위 작품과 장르·시대 배경·분위기·독자층이 닮은 시장 웹툰 다섯 편을 웹 검색으로 찾아 주세요.",
        "작품마다 공식 연재 페이지 주소, 우리 작품에 어울리는 이유, 화풍 특징(선, 채색, 그림자 단계, 팔레트, 비율, 얼굴, 배경, 연출, 컷 리듬)을 정리해 주세요.",
    ]
    return "\n".join(parts)


WORK = _obj(
    {
        "title": _STR,
        "platform": _STR,
        "author": _STR,
        "url": _STR,
        "why": _STR,
        "traits": CRITERIA_SCHEMA,
    }
)
SCHEMA = _obj({"works": _arr(WORK)})


def _organize_task(research_text: str, links: list[dict[str, str]]) -> str:
    link_lines = "\n".join(f"- {l['title']}: {l['url']}" for l in links[:40])
    return f"""# 과제: 조사 결과를 화풍 참고작 목록으로 정리

## 조사 결과
{research_text[:30000]}

## 조사에서 인용한 링크
{link_lines}

## 출력 형식 (JSON)
- works: 조사에서 확인된 작품 최대 5편. 확인 안 된 작품은 넣지 않는다.
- title: 작품 제목, platform: 연재 플랫폼, author: 작가(글/그림)
- url: 그 작품의 공식 연재 페이지 주소(네이버웹툰 comic.naver.com, 카카오웹툰 webtoon.kakao.com, 카카오페이지 page.kakao.com 등). 조사 결과나 위 링크에 있는 주소만 쓰고 지어내지 않는다. 공식 주소가 없으면 그 작품을 다룬 위 링크.
- why: 우리 작품에 어울리는 이유 한두 문장 (장르, 시대, 분위기, 독자층)
- traits: 측정 가능한 화풍 특징을 짧은 한국어로. 캐릭터 디자인·장면 묘사 금지.
  line(선 굵기·강약·색), coloring(채색 방식), shading_steps(그림자 단계 수, 정수), palette(채도·명도 경향),
  proportions(등신·체형), faces(눈 크기·턱선·생략 정도), backgrounds(배경 밀도·처리), effects(효과선·빛),
  panel_rhythm(컷 크기·여백 리듬), avoid(이 결을 따를 때 우리 그림에서 피할 것)
"""


MEASURE_TASK = CRITERIA_TASK.replace(
    "첨부한 그림은 대표가 고른 시장 웹툰 화면 캡처예요.", "첨부한 그림은 시장 웹툰의 공식 대표 이미지(썸네일·캐릭터 일러스트)로 받은 것이에요."
) + """
먼저 is_artwork를 판정하라: 인물이나 장면이 그려진 웹툰 그림이면 true, 플랫폼·작품 로고, 글자만 있는 배너, 사진, 아이콘이면 false.
false면 나머지 칸은 빈 문자열(그림자 단계는 0)로 두어라.
true면 그림에서 확인되는 것만 적고, 이 이미지로 알 수 없는 항목(예: 컷 리듬)은 '대표 이미지로는 확인 불가'라고 적어라."""

MEASURE_SCHEMA = _obj({"is_artwork": {"type": "boolean"}, **CRITERIA_SCHEMA["properties"]})
MAX_MEASURES = 3  # 작품 하나에 그림 판정·측정은 최대 3번 (비용 상한)


def run_style_scout(
    ctx: dict[str, Any], model: Any, fetch: Callable[[str], bytes | None] | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    fetch = fetch or fetch_cover
    lookup = lookup_platform
    get_image = fetch_image
    research = model.research(SYSTEM, scout_task(ctx), max_searches=12)
    organized = model.json(SYSTEM, _organize_task(research.text, research.links), SCHEMA, effort="medium", max_tokens=16000)
    allowed = {l["url"] for l in research.links} | set(_URL.findall(research.text))
    works = []
    for w in organized.data.get("works", [])[:5]:
        title = (w.get("title") or "").strip()
        if not title:
            continue
        url = (w.get("url") or "").strip()
        works.append(
            {
                "title": title[:100],
                "platform": (w.get("platform") or "").strip()[:50],
                "author": (w.get("author") or "").strip()[:100],
                "url": url if url.startswith("http") and (url in allowed or _official(url)) else "",
                "why": (w.get("why") or "").strip()[:500],
                "traits": w.get("traits") or {},
                "measured": False,
            }
        )
    costs = [*research.cost_entries(), organized.result.cost_entry()]
    # 글로 추정한 특징을, 공식 대표 이미지를 직접 보고 잰 값으로 바꿔요 (그림은 저장하지 않아요)
    for w in works:
        # 1) 플랫폼 검색으로 작품 주소와 대표 그림을 직접 찾아요 (AI가 적은 주소에 기대지 않아요)
        page, img_urls = lookup(w["title"], w["author"], w["platform"])
        if page:
            w["url"] = page
        tried = _image_sources(w, w["url"], research.links)

        # 2) 받을 그림 후보: 플랫폼 검색 그림, 그다음 작품 주소·인용 링크의 대표 이미지(og:image)
        def candidates() -> Any:
            for u in img_urls:
                yield u, get_image(u)
            for src in tried:
                yield src, fetch(src)

        attempts: list[str] = []
        for src, raw in candidates():
            if len(attempts) >= MAX_MEASURES:
                break
            if not raw:
                continue
            try:
                img = thumbnail(raw, 1280)
            except Exception:  # noqa: BLE001 - 깨진 그림은 건너뛰어요
                continue
            r = model.json(SYSTEM, MEASURE_TASK, MEASURE_SCHEMA, images=[img], effort="medium", max_tokens=6000)
            costs.append(r.result.cost_entry())
            if not r.data.get("is_artwork"):
                attempts.append(f"{src} (로고·글자 이미지)")
                continue
            w["traits"] = {k: v for k, v in r.data.items() if k != "is_artwork"}
            w["measured"] = True
            log.info("화풍 참고작 그림으로 측정: %s (%s)", w["title"], src)
            break
        if not w["measured"]:
            log.info(
                "화풍 참고작 그림 못 찾음: %s (플랫폼 검색 %s, 시도: %s)",
                w["title"], page or "없음", ", ".join(attempts) or ", ".join(tried) or "주소 없음",
            )
    return works, costs
