#!/usr/bin/env python3
"""OpenGameArt: search CC0 sound effects, verify each asset page lists CC0 as its only licence,
record author + file links in raw/opengameart/index.json. ~1 request/second.
  python3 -I fetch_oga.py search [query ...]    # build/extend the index
  python3 -I fetch_oga.py get <slug> [<slug>..]   # download + extract an indexed asset's files
"""
import html, io, json, os, re, sys, time, urllib.parse, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "opengameart")
UA = {"User-Agent": "Mozilla/5.0 (playmat sound picker; low-volume fetch)"}
QUERIES = ["sword", "shield", "gong", "drum", "horn", "fanfare", "victory", "defeat", "heartbeat", "bell", "magic", "spell",
           "card", "stone", "bone", "dark", "explosion", "clock", "whoosh", "impact", "battle", "swoosh", "monster", "ambience"]

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

def text(url):
    return fetch(url).decode("utf8", "replace")

def load():
    p = os.path.join(RAW, "index.json")
    return json.load(open(p)) if os.path.exists(p) else {}

def save(idx):
    os.makedirs(RAW, exist_ok=True)
    json.dump(idx, open(os.path.join(RAW, "index.json"), "w"), indent=1)

def search(queries):
    idx = load()
    for q in queries:
        url = ("https://opengameart.org/art-search-advanced?keys=%s&field_art_type_tid%%5B%%5D=13"
               "&field_art_licenses_tid%%5B%%5D=4&sort_by=count&sort_order=DESC" % urllib.parse.quote_plus(q))
        page = text(url); time.sleep(1.1)
        slugs = list(dict.fromkeys(re.findall(r'href="/content/([a-z0-9\-_]+)"', page)))
        slugs = [s for s in slugs if s not in ("faq",) and not s.startswith("october") and not s.startswith("november")][:6]
        for s in slugs:
            if s in idx: continue
            a = text("https://opengameart.org/content/" + s); time.sleep(1.1)
            lic = re.search(r'field-name-field-art-licenses.*?<div class="field-items">(.*?)</div></div></div></div>', a, re.S)
            names = re.findall(r"license-name'>([^<]*)<", lic.group(1)) if lic else []
            auth = re.search(r"field-name-author-submitter.*?<span class='username'><a[^>]*>([^<]*)<", a, re.S)
            title = re.search(r"<title>(.*?) \| OpenGameArt", a, re.S)
            files = re.findall(r'<span class="file"><img[^>]*>\s*<a href="([^"]+)"', a)
            idx[s] = {"title": html.unescape(title.group(1)) if title else s, "author": auth.group(1) if auth else "?",
                      "licenses": names, "files": files, "url": "https://opengameart.org/content/" + s, "q": q}
            print(q, s, names, len(files))
        save(idx)

def get(slugs):
    idx = load()
    for s in slugs:
        e = idx[s]
        assert e["licenses"] == ["CC0"], (s, e["licenses"])
        out = os.path.join(RAW, s); os.makedirs(out, exist_ok=True)
        for f in e["files"]:
            data = fetch(f); time.sleep(1.1)
            name = urllib.parse.unquote(os.path.basename(f))
            if name.lower().endswith(".zip"):
                zipfile.ZipFile(io.BytesIO(data)).extractall(os.path.join(out, name[:-4]))
            else:
                open(os.path.join(out, name), "wb").write(data)
            print("got", s, name)

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "search": search(sys.argv[2:] or QUERIES)
    else: get(sys.argv[2:])
