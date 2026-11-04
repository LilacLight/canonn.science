"""ONE-OFF migration: archive/pipeline/content  ->  content/articles/<slug>/ folders.

    python -I tools/migrate_archive.py

Reads (all under ../archive and ../):
  archive/pipeline/content/articles/*.json   archived article records
  archive/pipeline/content/media/            archived media tree
  canonn-sorted-articles.json                category/sub-category assignments

Writes (under ./content):
  articles/<slug>/article.json   metadata
  articles/<slug>/body.html      article body
  articles/<slug>/media/...      media used by that article only
  shared-media/<y>/<m>/...       media used by two or more articles

References in body.html are rewritten to relative form:
  media/<file>                   the article's own media
  shared-media/<y>/<m>/<file>    shared media
References to files that were never archived are left as the original
/assets/media/... URL and listed in tools/migration-report.json.
"""
import html
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT.parent / "archive" / "pipeline" / "content"
SORTED = ROOT.parent / "canonn-sorted-articles.json"
OUT = ROOT / "content"

MEDIA_RE = re.compile(r"/assets/media/([^\"'\s)<>,]+)")


def to_text(fragment):
    text = re.sub(r"<[^>]+>", " ", fragment or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def refs_in(*chunks):
    found = set()
    for chunk in chunks:
        for m in MEDIA_RE.finditer(chunk or ""):
            found.add(m.group(1))
    return found


def main():
    sorted_data = json.loads(SORTED.read_text(encoding="utf-8"))
    assignments = sorted_data["assignments"]

    articles = {}
    for p in sorted((ARCHIVE / "articles").glob("*.json")):
        articles[p.stem] = json.loads(p.read_text(encoding="utf-8"))

    # media path (as referenced, URL-decoded) -> set of slugs using it
    users = defaultdict(set)
    for slug, a in articles.items():
        for ref in refs_in(a["content_html"], a.get("banner_image"), a.get("excerpt_html")):
            users[unquote(ref)].add(slug)

    media_root = ARCHIVE / "media"
    missing = defaultdict(list)
    placement = {}  # ref -> new relative path (relative to article dir or content/)
    for ref, slugs in users.items():
        src = media_root / ref
        if not src.is_file():
            for s in slugs:
                missing[s].append(ref)
            continue
        placement[ref] = ("shared" if len(slugs) > 1 else "own", src)

    if OUT.exists() and any(OUT.iterdir()):
        sys.exit(f"{OUT} is not empty; refusing to overwrite")

    stats = defaultdict(int)
    for slug, a in articles.items():
        adir = OUT / "articles" / slug
        adir.mkdir(parents=True)
        own_names = {}  # ref -> filename inside media/

        def rewrite(match):
            raw = match.group(1)
            ref = unquote(raw)
            kind = placement.get(ref)
            if kind is None:
                return match.group(0)  # never archived: leave the legacy URL
            if kind[0] == "shared":
                return "shared-media/" + raw
            if ref not in own_names:
                name = Path(ref).name
                if name in own_names.values():
                    name = ref.replace("/", "__")
                own_names[ref] = name
            return "media/" + own_names[ref].replace(" ", "%20")

        body = MEDIA_RE.sub(rewrite, a["content_html"])
        banner = a.get("banner_image")
        if banner:
            m = MEDIA_RE.fullmatch(banner)
            banner = MEDIA_RE.sub(rewrite, banner) if m else banner
        (adir / "body.html").write_text(body, encoding="utf-8", newline="\n")

        for ref, name in own_names.items():
            dest = adir / "media" / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(placement[ref][1], dest)
            stats["own_files"] += 1

        cats = []
        for asg in assignments.get(slug, []):
            subs = asg.get("subs") if "subs" in asg else ([asg["sub"]] if asg.get("sub") else [])
            cats.append({"category": asg["category"], "subs": [s for s in subs if s]})
        if not cats:
            stats["unsorted"] += 1

        meta = {
            "title": a["title"],
            "slug": slug,
            "section": a["section"],
            "date": a.get("date"),
            "modified": a.get("modified"),
            "excerpt": to_text(a.get("excerpt_html")),
            "banner": banner,
            "categories": cats,
            "format": "html",
            "source": a.get("source"),
            "original_link": a.get("original_link"),
        }
        (adir / "article.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
        )

    shared = {ref for ref, (kind, _) in placement.items() if kind == "shared"}
    for ref in shared:
        dest = OUT / "shared-media" / ref
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(placement[ref][1], dest)
    stats["shared_files"] = len(shared)

    report = {
        "articles": len(articles),
        "stats": dict(stats),
        "missing_media": {k: v for k, v in sorted(missing.items())},
        "articles_with_script": sorted(s for s, a in articles.items() if re.search(r"<script", a["content_html"], re.I)),
    }
    (ROOT / "tools" / "migration-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("missing_media", "articles_with_script")}, indent=1))
    print("articles with missing media:", len(missing), "refs:", sum(len(v) for v in missing.values()))
    print("articles with <script>:", len(report["articles_with_script"]))


main()
