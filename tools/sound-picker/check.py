#!/usr/bin/env python3
"""QA over catalog.json: ffprobe format, loudness (short clips: peak), flags outliers. Run: python3 -I check.py"""
import json, os, re, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
FF, FP = "/opt/homebrew/bin/ffmpeg", "/opt/homebrew/bin/ffprobe"
cat = json.load(open(os.path.join(HERE, "catalog.json")))
n = bad = total = 0
for e in cat["events"]:
    for o in e["options"]:
        f = os.path.join(HERE, o["file"]); total += os.path.getsize(f); n += 1
        p = subprocess.run([FP, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,codec_name",
                            "-show_entries", "format=duration,bit_rate", "-of", "json", f], capture_output=True, text=True)
        j = json.loads(p.stdout); s = j["streams"][0]; d = float(j["format"]["duration"])
        r = subprocess.run([FF, "-nostats", "-i", f, "-af", "ebur128=peak=true,volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
        lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r)[-1]); mx = float(re.findall(r"max_volume: (-?[\d.]+)", r)[-1])
        flags = []
        if s["sample_rate"] != "44100" or s["channels"] != 1 or s["codec_name"] != "mp3": flags.append("format")
        if abs(d - o["dur"]) > 0.06: flags.append("dur-mismatch")
        if d >= 0.4 and abs(lufs + 18) > 3.5: flags.append("LUFS %.1f" % lufs)
        if mx > -0.3: flags.append("peak %.1f" % mx)
        if flags: bad += 1; print(o["id"], "%.2fs" % d, "I=%.1f" % lufs, "max=%.1f" % mx, flags)
print("clips", n, "flagged", bad, "bytes", total)
