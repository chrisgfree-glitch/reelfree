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
    else:
        e["url"] = ref
    out.append(e)
json.dump(out, open('data/titles.json', 'w'), indent=2, ensure_ascii=False)
print(len(out), "titles written")
