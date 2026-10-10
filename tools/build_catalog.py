"""Build the site: scan files/ and write catalog.json, then copy everything into _site/.

Folder layout:   files/<Course>/<Type>/<document>      e.g. files/CSE445 - Machine Learning/Notes/Week 3.pdf
                 files/<Course>/<document>              (type shown as "Other")
Optional extras: library.csv  path,title,description,semester,tags   (nicer titles and descriptions)
                 courses.csv  folder,name,semester,description        (course details)
Locked slides:   slides/ holds encrypted slides made by tools/lock_slides.ps1. Only key.json and index.enc
                 are published with the site; the website fetches the locked .bin files from the repo itself,
                 so they don't count towards the Pages size limit.

Run locally:  python tools/build_catalog.py   (then open _site/index.html through a local server)
"""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ROOT / "files"
SLIDES = ROOT / "slides"
OUT = ROOT / "_site"
SKIP = {"readme.md", ".gitkeep", "desktop.ini", "thumbs.db", ".ds_store"}
COURSE_RE = re.compile(r"^([A-Za-z]{2,4}\s?\d{3}[A-Za-z]?)\s*[-–:]?\s*(.*)$")


def read_csv(path: Path, key: str) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return {row[key].strip(): {k: (v or "").strip() for k, v in row.items()}
                for row in csv.DictReader(fh) if row.get(key, "").strip()}


def git_date(path: Path, first: bool) -> str | None:
    """Date the file was first added (first=True) or last changed, from git history."""
    args = ["git", "log", "--format=%cI", "--", str(path.relative_to(ROOT))]
    if first:
        args.insert(2, "--diff-filter=A")
    try:
        out = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.split()
    except (OSError, subprocess.SubprocessError):
        return None
    return (out[-1] if first else out[0]) if out else None


def title_from(name: str) -> str:
    stem = Path(name).stem
    return re.sub(r"\s+", " ", re.sub(r"[_]+", " ", stem)).strip()


def build() -> dict:
    meta = read_csv(ROOT / "library.csv", "path")
    course_meta = read_csv(ROOT / "courses.csv", "folder")
    docs, courses = [], {}
    if FILES.exists():
        for p in sorted(FILES.rglob("*")):
            if not p.is_file() or p.name.lower() in SKIP or p.name.startswith("."):
                continue
            rel = p.relative_to(FILES).parts
            course_folder = rel[0] if len(rel) > 1 else "General"
            doc_type = rel[1] if len(rel) > 2 else "Other"
            path = "files/" + "/".join(p.relative_to(FILES).parts)
            m = meta.get(path, {})
            mtime = datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")
            docs.append({
                "path": path,
                "course": course_folder,
                "type": doc_type,
                "title": m.get("title") or title_from(p.name),
                "description": m.get("description", ""),
                "semester": m.get("semester", ""),
                "tags": [t.strip() for t in m.get("tags", "").split(";") if t.strip()],
                "ext": p.suffix.lower().lstrip("."),
                "size": p.stat().st_size,
                "added": git_date(p, first=True) or mtime,
                "updated": git_date(p, first=False) or mtime,
            })
            if course_folder not in courses:
                cm = course_meta.get(course_folder, {})
                match = COURSE_RE.match(course_folder)
                code, name = (match.group(1).upper().replace(" ", ""), match.group(2)) if match else ("", course_folder)
                courses[course_folder] = {
                    "folder": course_folder,
                    "code": code,
                    "name": cm.get("name") or name or ("" if code else course_folder),
                    "semester": cm.get("semester", ""),
                    "description": cm.get("description", ""),
                }
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "courses": sorted(courses.values(), key=lambda c: (c["code"] or "~", c["name"])),
        "documents": docs,
    }


def main() -> None:
    catalog = build()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for item in ["index.html", "css", "js", "files"]:
        src = ROOT / item
        if src.is_dir():
            shutil.copytree(src, OUT / item)
        elif src.exists():
            shutil.copy2(src, OUT / item)
    # make browsers fetch the new style sheet and script after every update instead of an old cached copy
    version = (os.environ.get("GITHUB_SHA") or catalog["generated"])[:12]
    page = OUT / "index.html"
    page.write_text(page.read_text(encoding="utf-8")
                    .replace('href="css/style.css"', f'href="css/style.css?v={version}"')
                    .replace('src="js/app.js"', f'src="js/app.js?v={version}"'), encoding="utf-8")
    if (SLIDES / "key.json").exists() and (SLIDES / "index.enc").exists():
        (OUT / "slides").mkdir()
        for name in ("key.json", "index.enc"):
            shutil.copy2(SLIDES / name, OUT / "slides" / name)
        repo, sha = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_SHA")
        if repo and sha:
            catalog["slides"] = {"base": f"https://raw.githubusercontent.com/{repo}/{sha}/slides/"}
        else:  # local preview: serve the locked files from _site itself
            for p in SLIDES.glob("*.bin"):
                shutil.copy2(p, OUT / "slides" / p.name)
            catalog["slides"] = {"base": "slides/"}
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / ".nojekyll").touch()
    total = sum(d["size"] for d in catalog["documents"])
    print(f"{len(catalog['documents'])} documents in {len(catalog['courses'])} courses, {total / 1e6:.1f} MB")
    big = [d["path"] for d in catalog["documents"] if d["size"] > 95e6]
    if big:
        raise SystemExit(f"These files are over GitHub's 100 MB limit: {big}")


if __name__ == "__main__":
    main()
