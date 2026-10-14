#!/usr/bin/env python3
"""Search Freesound's public website (CC0 filter), collect preview-mp3 candidates into
raw/freesound/index.json. No API key. ~1 request/second. Run: python3 -I fetch_freesound.py [query ...]"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "freesound")
UA = {"User-Agent": "Mozilla/5.0 (playmat sound picker; low-volume fetch)"}
QUERIES = [
    "card shuffle riffle", "card slide", "card flick", "card snap table", "playing card place", "cards gather deck",
    "crumple paper", "paper toss", "parchment", "quill",
    "taiko drum hit", "deep gong", "war horn", "heavy door slam", "low drum hit", "war drum",
    "wood knock", "door knock", "low bell", "church bell toll", "bell single",
    "dark whoosh", "magic whoosh", "dark magic cast", "spell cast", "magic thrum", "drone hit impact", "sub bass impact rumble",
    "stone set down", "stone drag", "rock slide", "stone impact",
    "sword draw", "sword unsheathe", "metal ring", "sword clash", "armor clank", "shield hit", "wooden shield block",
    "punch impact", "sword slash flesh", "body hit", "heavy crunch", "bone crack", "bone break", "explosion thud", "boom impact",
    "heartbeat", "heartbeat slow", "warm pad swell", "healing swell",
    "body fall", "body drop", "dark puff", "poof smoke", "cloth flourish", "cloth flap", "summon",
    "reverse whoosh", "reverse cymbal", "void vanish", "dark vanish",
    "fizzle", "glass break", "snuff", "extinguish candle",
    "clock tick", "clock ticking", "tick tock", "pocket watch",
    "victory fanfare brass", "triumphant horn", "orchestral stinger", "defeat stinger", "somber low", "game over low", "brass fanfare short",
    "felt card scrape", "card rotate", "cards flurry", "fast card shuffle",
]

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf8", "replace")

def parse(page):
    out = []
    for m in re.finditer(r'<div\s+class="bw-player"(.*?)tabindex', page, re.S):
        blk = m.group(1)
        def a(k):
            r = re.search(r'data-%s="([^"]*)"' % k, blk)
            return html.unescape(r.group(1)) if r else ""
        out.append({"id": a("sound-id"), "user": a("username"), "title": a("title"),
                    "mp3": a("mp3"), "dur": float(a("duration") or 0)})
    return out

def main():
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, "index.json")
    idx = json.load(open(path)) if os.path.exists(path) else {}
    qs = sys.argv[1:] or QUERIES
    for q in qs:
        if q in idx: continue
        url = "https://freesound.org/search/?q=%s&f=license:%%22Creative+Commons+0%%22" % urllib.parse.quote_plus(q)
        try:
            page = get(url)
        except Exception as e:
            print("ERR", q, e); time.sleep(2); continue
        if "license:&quot;Creative Commons 0&quot;" not in page:
            print("license filter chip missing, skipping", q); continue
        idx[q] = parse(page)
        print(q, len(idx[q]))
        json.dump(idx, open(path, "w"), indent=1)
        time.sleep(1.1)

main()
