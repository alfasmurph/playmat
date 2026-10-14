#!/usr/bin/env python3
"""Download Kenney (CC0) audio packs into raw/kenney/<pack>/. Run: python3 -I fetch_kenney.py"""
import os, re, sys, time, urllib.request, zipfile, io

HERE = os.path.dirname(os.path.abspath(__file__))
PACKS = ["casino-audio", "impact-sounds", "rpg-audio", "interface-sounds", "music-jingles", "digital-audio"]
UA = {"User-Agent": "Mozilla/5.0 (playmat sound picker; low-volume fetch)"}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

for pack in PACKS:
    out = os.path.join(HERE, "raw", "kenney", pack)
    if os.path.isdir(out) and os.listdir(out):
        print("have", pack); continue
    page = get(f"https://kenney.nl/assets/{pack}").decode("utf8", "replace")
    if "CC0" not in page:
        print("SKIP (no CC0 text on page)", pack); continue
    m = re.search(r'https://kenney\.nl/media/pages/assets/[^"\']+\.zip', page)
    if not m:
        print("no zip link", pack); continue
    time.sleep(1)
    data = get(m.group(0))
    os.makedirs(out, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(out)
    print("got", pack, m.group(0), len(data))
    time.sleep(1)
