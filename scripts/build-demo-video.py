"""Turn the frames recorded by scripts/record-demo.ts into exports/submission/05_经纬_演示视频.mp4.

Screencast frames arrive only when the page changes, so each frame is held until the next one. Time
ranges listed as cuts (the wait for the model's answer) are removed. Output: 1920×1080, 30 fps, H.264,
with a short fade in and out; an optional music track (exports/submission/music.*) is mixed quietly.
Run: python3 scripts/build-demo-video.py
"""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / 'exports' / 'submission' / 'demo-frames'
OUT = ROOT / 'exports' / 'submission' / '05_经纬_演示视频.mp4'
SILENT = ROOT / 'exports' / 'submission' / '05_经纬_演示视频_无音乐.mp4'

manifest = json.loads((FRAMES / 'manifest.json').read_text())
frames = sorted(manifest['frames'], key=lambda f: f['t'])
cuts = manifest['cuts']


def cut_between(a: float, b: float) -> float:
    """Seconds of cut time inside [a, b)."""
    return sum(max(0.0, min(b, end) - max(a, start)) for start, end in cuts)


def inside_cut(t: float) -> bool:
    return any(start <= t < end for start, end in cuts)


kept = [f for f in frames if not inside_cut(f['t'])]
lines = []
for current, following in zip(kept, kept[1:] + [None]):
    end = following['t'] if following else current['t'] + 0.5
    duration = max(0.0, end - current['t'] - cut_between(current['t'], end))
    if duration <= 0:
        continue
    lines.append(f"file '{FRAMES / current['file']}'\nduration {duration:.4f}")
lines.append(f"file '{FRAMES / kept[-1]['file']}'")  # concat demuxer needs the last file repeated
listing = FRAMES / 'list.txt'
listing.write_text('\n'.join(lines) + '\n')
total = sum(float(l.split('duration ')[1]) for l in lines if 'duration' in l)

music = next((p for p in (ROOT / 'exports' / 'submission').glob('music.*')), None)
fade = f"fade=t=in:st=0:d=0.6,fade=t=out:st={total - 0.8:.2f}:d=0.8"
video_filter = f"fps=30,scale=1920:1080:flags=lanczos,{fade},format=yuv420p"
command = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(listing)]
if music:
    command += ['-stream_loop', '-1', '-i', str(music)]
command += ['-vf', video_filter, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart']
if music:
    command += ['-filter:a', f"volume=0.6,afade=t=in:d=1.5,afade=t=out:st={total - 2.5:.2f}:d=2.5", '-c:a', 'aac', '-b:a', '160k', '-shortest', '-map', '0:v', '-map', '1:a']
command.append(str(OUT))
subprocess.run(command, check=True)
# A copy without the music track, for submissions that prefer silence.
if music:
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(OUT), '-c:v', 'copy', '-an', str(SILENT)], check=True)
print(f'{OUT.relative_to(ROOT)}  {total:.1f} s  {OUT.stat().st_size / 1_048_576:.1f} MB  music: {music.name if music else "none"}')
