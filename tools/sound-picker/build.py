#!/usr/bin/env python3
"""Build tools/sound-picker/clips + catalog.json from selection.json.
Run: python3 -I build.py            (all phases)
     python3 -I build.py fetch      (only download/verify Freesound previews)
     python3 -I build.py process    (only ffmpeg + catalog)
Phase 'fetch' re-checks every Freesound sound page for the CC0 licence (publicdomain/zero/1.0) and
refuses to use a sound whose page does not say so. Kenney/OpenGameArt files come from fetch_kenney.py / fetch_oga.py."""
import array, datetime, html, json, os, re, shutil, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
CLIPS = os.path.join(HERE, "clips")
FFMPEG = "/opt/homebrew/bin/ffmpeg"
UA = {"User-Agent": "Mozilla/5.0 (playmat sound picker; low-volume fetch)"}
KENNEY_NAMES = {"casino-audio": "Casino Audio", "impact-sounds": "Impact Sounds", "rpg-audio": "RPG Audio",
                "interface-sounds": "Interface Sounds"}
ORDER = ["turn", "decide", "cast", "resolve", "land", "draw", "shuffle", "tap", "untap", "attack", "attackBig", "block",
         "damage", "damageBig", "lifeGain", "creatureDies", "token", "exile", "counter", "discard", "mulligan", "timer",
         "victory", "defeat"]

def http(url, binary=False):
    d = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    return d if binary else d.decode("utf8", "replace")

def fs_index():
    """sound id -> {user,title} from the search results gathered by fetch_freesound.py"""
    out = {}
    for rows in json.load(open(os.path.join(RAW, "freesound", "index.json"))).values():
        for r in rows:
            out[int(r["id"])] = r
    return out

def fetch_freesound(sel):
    idx = fs_index()
    meta_dir = os.path.join(RAW, "freesound", "meta")
    os.makedirs(meta_dir, exist_ok=True)
    for ev in sel["events"]:
        for c in ev["cands"]:
            if c[0] != "F": continue
            sid = c[1]
            mp = os.path.join(meta_dir, f"{sid}.json")
            if os.path.exists(mp): continue
            r = idx[sid]
            url = f"https://freesound.org/people/{r['user']}/sounds/{sid}/"
            page = http(url); time.sleep(1.1)
            if "publicdomain/zero/1.0" not in page or "Creative Commons 0" not in page:
                sys.exit(f"NOT CC0 on page: {url}")
            m = re.search(r'https://cdn\.freesound\.org/previews/[^"\']*?/%d_\d+-hq\.mp3' % sid, page)
            if not m: sys.exit(f"no hq preview link: {url}")
            mp3 = http(m.group(0), binary=True); time.sleep(1.1)
            open(os.path.join(RAW, "freesound", f"{sid}.mp3"), "wb").write(mp3)
            json.dump({"id": sid, "user": r["user"], "title": r["title"], "url": url, "license": "CC0 (page verified)",
                       "preview": m.group(0)}, open(mp, "w"))
            print("freesound ok", sid, r["title"])

def resolve(c):
    """-> (input path, label, credit, url, source name)"""
    kind = c[0]
    if kind == "K":
        _, pack, name = c
        p = os.path.join(RAW, "kenney", pack, "Audio", name + ".ogg")
        pretty = KENNEY_NAMES[pack]
        return p, f"{pretty} · {name}", f'"{name}" by Kenney (Kenney.nl {pretty}, CC0)', f"https://kenney.nl/assets/{pack}", "Kenney"
    if kind == "F":
        m = json.load(open(os.path.join(RAW, "freesound", "meta", f"{c[1]}.json")))
        return (os.path.join(RAW, "freesound", f"{c[1]}.mp3"), m["title"],
                f'"{m["title"]}" by {m["user"]} (Freesound #{c[1]}, CC0)', m["url"], "Freesound")
    _, slug, rel = c
    e = json.load(open(os.path.join(RAW, "opengameart", "index.json")))[slug]
    assert e["licenses"] == ["CC0"], slug
    base = os.path.splitext(os.path.basename(rel))[0]
    return (os.path.join(RAW, "opengameart", slug, rel), f'{e["title"]} · {base}',
            f'"{e["title"]}" by {e["author"]} (OpenGameArt #{slug}, CC0)', e["url"], "OpenGameArt")

def run(args, **kw):
    return subprocess.run(args, capture_output=True, **kw)

def duration(path):
    r = run(["/opt/homebrew/bin/ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], text=True)
    return float(r.stdout.strip())

def samples(path):
    r = run([FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-"])
    a = array.array("f"); a.frombytes(r.stdout[: len(r.stdout) // 4 * 4]); return a

def measure_lufs(path):
    r = run([FFMPEG, "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None

def process(src, dst, cap, tmp):
    base = ["-ac", "1", "-ar", "44100"]
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,"
            "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse")
    t0 = tmp + ".mono.wav"          # mono/44.1k float, peak-normalised to -3 dBFS so the -50 dB trim is relative to the signal
    r = run([FFMPEG, "-y", "-v", "error", "-i", src, *base, "-c:a", "pcm_f32le", t0])
    if r.returncode or not os.path.exists(t0): raise RuntimeError(r.stderr.decode()[-300:])
    r = run([FFMPEG, "-nostats", "-i", t0, "-af", "volumedetect", "-f", "null", "-"], text=True)
    mv = re.findall(r"max_volume: (-?[\d.]+) dB", r.stderr)
    if not mv or float(mv[-1]) < -80: raise RuntimeError("silent source")
    t1 = tmp + ".trim.wav"
    r = run([FFMPEG, "-y", "-v", "error", "-i", t0, "-af", f"volume={-3.0 - float(mv[-1]):.2f}dB," + trim, "-c:a", "pcm_f32le", t1])
    if r.returncode or not os.path.exists(t1): raise RuntimeError(r.stderr.decode()[-300:])
    dur = duration(t1) if os.path.getsize(t1) > 200 else 0
    if dur < 0.03: raise RuntimeError("empty after trim")
    capped = dur > cap
    dur = min(dur, cap)
    s = samples(t1)
    fade_in = 0.010 if (len(s) and abs(s[0]) > 0.01) else 0.0
    fade_out = min(0.080 if capped else 0.030, dur * 0.25)
    chain = ["highpass=f=30", f"atrim=0:{dur:.4f}"]   # 30 Hz high-pass drops DC/sub rumble that only eats headroom
    if fade_in: chain.append(f"afade=t=in:d={fade_in}")
    chain.append(f"afade=t=out:st={max(dur - fade_out, 0):.4f}:d={fade_out:.4f}")
    t2 = tmp + ".shape.wav"
    r = run([FFMPEG, "-y", "-v", "error", "-i", t1, "-af", ",".join(chain), "-ar", "44100", "-ac", "1", "-c:a", "pcm_f32le", t2])
    if r.returncode: raise RuntimeError(r.stderr.decode()[-300:])
    if dur < 0.4:   # loudnorm unreliable: peak-normalise to -1 dBFS
        r = run([FFMPEG, "-nostats", "-i", t2, "-af", "volumedetect", "-f", "null", "-"], text=True)
        mx = float(re.findall(r"max_volume: (-?[\d.]+) dB", r.stderr)[-1])
        gain, mode = -1.0 - mx, "peak"
    else:           # EBU R128 integrated -18 LUFS (linear gain), peaks held under -1 dBFS by a limiter
        lufs = measure_lufs(t2)
        if lufs is None: raise RuntimeError("no loudness")
        gain, mode = -18.0 - lufs, "lufs"
        r = run([FFMPEG, "-nostats", "-i", t2, "-af", "volumedetect", "-f", "null", "-"], text=True)
        mx = float(re.findall(r"max_volume: (-?[\d.]+) dB", r.stderr)[-1])
        gain = min(gain, -1.0 - mx + 8.0)   # never ask the limiter for more than ~8 dB of peak reduction (transient-heavy clips land a bit under target)
    af = f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=1:release=20:level=false"
    r = run([FFMPEG, "-y", "-v", "error", "-i", t2, "-af", af, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", dst])
    if r.returncode: raise RuntimeError(r.stderr.decode()[-300:])
    for t in (t0, t1, t2): os.remove(t)
    return round(duration(dst), 2), mode, round(gain, 1), capped

def main():
    phase = sys.argv[1] if len(sys.argv) > 1 else "all"
    sel = json.load(open(os.path.join(HERE, "selection.json")))
    if phase in ("all", "fetch"): fetch_freesound(sel)
    if phase == "fetch": return
    shutil.rmtree(CLIPS, ignore_errors=True)
    tmpd = os.path.join(RAW, "_tmp"); os.makedirs(tmpd, exist_ok=True)
    byid = {e["id"]: e for e in sel["events"]}
    events, report = [], []
    for eid in ORDER:
        ev = byid[eid]
        os.makedirs(os.path.join(CLIPS, eid), exist_ok=True)
        opts, kn, on = [], 0, 0
        for c in ev["cands"]:
            src, label, credit, url, source = resolve(c)
            if c[0] == "K": kn += 1; oid = f"{eid}-k{kn}"
            elif c[0] == "F": oid = f"{eid}-f{c[1]}"
            else: on += 1; oid = f"{eid}-o{on}"
            if not os.path.exists(src): sys.exit(f"missing source {src}")
            dst = os.path.join(CLIPS, eid, oid + ".mp3")
            try:
                dur, mode, gain, capped = process(src, dst, ev["cap"], os.path.join(tmpd, oid))
            except Exception as e:
                print("FAIL", oid, e); continue
            opts.append({"id": oid, "source": source, "label": label, "credit": credit, "url": url,
                         "dur": dur, "file": f"clips/{eid}/{oid}.mp3"})
            report.append((oid, dur, mode, gain, capped))
            print(oid, dur, mode, gain, "capped" if capped else "")
        events.append({"group": ev["group"], "id": eid, "name": ev["name"], "what": ev["what"], "options": opts})
    shutil.rmtree(tmpd, ignore_errors=True)
    json.dump({"generated": datetime.date.today().isoformat(), "events": events},
              open(os.path.join(HERE, "catalog.json"), "w"), indent=1, ensure_ascii=False)
    print("clips:", sum(len(e["options"]) for e in events))

main()
