"""고증 사진 찾기: 위키미디어 공용(Wikimedia Commons)에서 자유 이용 라이선스가 붙은 실물 사진을 찾아요.

대표가 올린 실물 사진이 없을 때 소품 시트의 참고 그림으로 써요. 찾은 사진은 sheets.py가 한 번 더 검사해서
실제 유물 사진이고 그 소품이 맞을 때만 써요. 출처와 라이선스는 결과에 남겨 화면에 보여줘요.
"""

from __future__ import annotations

import re
from typing import Any

API = "https://commons.wikimedia.org/w/api.php"
# 위키미디어는 연락 가능한 User-Agent를 요구해요. 개인 정보 대신 서비스 주소를 써요.
USER_AGENT = "NorivaStudio/1.0 (https://k-noriva.com; period reference lookup)"

# 상업적 이용과 변형이 가능한 라이선스만 써요 (비영리 NC, 변경 금지 ND 제외)
_OK = re.compile(r"(public domain|^pd\b|cc0|cc[ -]by(?!.*\b(nc|nd)\b)|kogl|공공누리)", re.I)
_BAD = re.compile(r"\b(nc|nd|non-?commercial|no ?deriv)", re.I)


def _strip(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def license_ok(name: str) -> bool:
    return bool(name) and bool(_OK.search(name)) and not _BAD.search(name)


def _queries(queries: list[str]) -> list[str]:
    """검색어를 짧게 다듬어요. 공용 검색은 긴 문장에 결과가 거의 없어서, 4단어가 넘으면 앞 3단어짜리도 함께 찾아요."""
    out: list[str] = []
    for q in queries:
        q = " ".join((q or "").replace('"', " ").split())
        if not q:
            continue
        words = q.split()
        for v in ([q, " ".join(words[:3])] if len(words) > 4 else [q]):
            if v not in out:
                out.append(v)
    return out[:5]


def search_commons(queries: list[str], limit: int = 6, http: Any = None) -> list[dict[str, Any]]:
    """검색어마다 공용의 파일을 찾아, 쓸 수 있는 라이선스의 사진만 돌려줘요."""
    import httpx

    client = http or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for q in _queries(queries):
        try:
            r = client.get(
                API,
                params={
                    "action": "query",
                    "format": "json",
                    "generator": "search",
                    "gsrnamespace": 6,
                    "gsrsearch": f"{q} filetype:bitmap",
                    "gsrlimit": 10,
                    "prop": "imageinfo",
                    "iiprop": "url|mime|extmetadata",
                    "iiurlwidth": 1280,
                },
            )
            r.raise_for_status()
            pages = (r.json().get("query") or {}).get("pages") or {}
        except Exception:
            continue
        for p in sorted(pages.values(), key=lambda x: x.get("index", 0)):
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            lic = _strip((meta.get("LicenseShortName") or {}).get("value", ""))
            if info.get("mime") not in ("image/jpeg", "image/png") or not license_ok(lic):
                continue
            url = info.get("thumburl") or info.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            out.append(
                {
                    "title": p.get("title", "").removeprefix("File:"),
                    "url": url,
                    "page": info.get("descriptionurl", ""),
                    "license": lic,
                    "artist": _strip((meta.get("Artist") or {}).get("value", ""))[:120],
                }
            )
            if len(out) >= limit:
                return out
    return out


def fetch(url: str, http: Any = None) -> bytes | None:
    import httpx

    client = http or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    try:
        r = client.get(url)
        r.raise_for_status()
        return r.content
    except Exception:
        return None
