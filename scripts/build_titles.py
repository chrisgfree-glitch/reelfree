#!/usr/bin/env python3
"""Turn the hand-curated candidates into data/titles.json (run once; then check-links verifies)."""
import json, sys
sys.path.insert(0, 'scripts')
from candidates import C
out = []
for cid, title, year, src, ref, genre, kind, desc in C:
    e = {"id": cid, "title": title, "year": year, "type": kind, "genre": genre, "source": src, "description": desc}
    if src == "archive":
        e["archiveId"] = ref
        e["url"] = f"https://archive.org/details/{ref}"
        e["embedUrl"] = f"https://archive.org/embed/{ref}"
    elif src == "youtube":
        e["youtubeId"] = ref
        e["url"] = f"https://www.youtube.com/watch?v={ref}"
        e["embedUrl"] = f"https://www.youtube-nocookie.com/embed/{ref}"
    elif src == "commons":
        from urllib.parse import quote
        f = ref.replace(" ", "_")
        e["commonsFile"] = ref
        e["url"] = "https://commons.wikimedia.org/wiki/" + quote(f)
        e["embedUrl"] = e["url"] + "?embedplayer=yes"
        e["image"] = "https://commons.wikimedia.org/wiki/Special:FilePath/" + quote(f[5:]) + "?width=640"
    elif src == "loc":
        e["locItem"] = ref.rstrip("/").split("/")[-1]
        e["url"] = ref
    else:
        e["url"] = ref
    out.append(e)
# keep artwork / popularity already curated in the existing file
try:
    old = {t["id"]: t for t in json.load(open("data/titles.json"))}
    for e in out:
        for k in ("image", "popularRank"):
            if k in old.get(e["id"], {}) and k not in e: e[k] = old[e["id"]][k]
except FileNotFoundError: pass
for e in out:
    if e["source"] == "archive": e.setdefault("image", f"https://archive.org/services/img/{e['archiveId']}")
    if e["source"] == "youtube": e.setdefault("image", f"https://i.ytimg.com/vi/{e['youtubeId']}/hqdefault.jpg")
json.dump(out, open('data/titles.json', 'w'), indent=2, ensure_ascii=False)
print(len(out), "titles written")
