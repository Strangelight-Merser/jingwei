"""Cut the 30-second version from the full demo: six moments joined with short crossfades.
Segment times refer to exports/submission/05_经纬_演示视频.mp4 as recorded by scripts/record-demo.ts.
Run after scripts/build-demo-video.py:  python3 scripts/build-demo-short.py
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FULL = ROOT / 'exports' / 'submission' / '05_经纬_演示视频.mp4'
OUT = ROOT / 'exports' / 'submission' / '05_经纬_演示视频_30秒.mp4'
MUSIC = ROOT / 'exports' / 'submission' / 'music.wav'
# (start, length) in seconds: opening card, scrubbing the chart, switching indices, holdings check-up, the answer, closing card.
SEGMENTS = [(0.0, 4.0), (9.0, 5.5), (22.0, 5.0), (80.0, 5.5), (108.5, 5.0), (125.5, 4.5)]
FADE = 0.5

inputs, parts = [], []
for i, (start, length) in enumerate(SEGMENTS):
    inputs += ['-ss', f'{start}', '-t', f'{length}', '-i', str(FULL)]
    parts.append(f'[{i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30[v{i}]')
chain, label, offset = [], 'v0', SEGMENTS[0][1] - FADE
for i in range(1, len(SEGMENTS)):
    out = f'x{i}'
    chain.append(f'[{label}][v{i}]xfade=transition=fade:duration={FADE}:offset={offset:.2f}[{out}]')
    label, offset = out, offset + SEGMENTS[i][1] - FADE
total = offset + FADE
graph = ';'.join(parts + chain) + f';[{label}]format=yuv420p[v]'
music = len(SEGMENTS)
command = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-i', str(MUSIC), '-filter_complex',
           graph + f';[{music}:a]atrim=0:{total:.2f},volume=0.6,afade=t=in:d=1,afade=t=out:st={total - 1.5:.2f}:d=1.5[a]',
           '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(OUT)]
subprocess.run(command, check=True)
print(f'{OUT.relative_to(ROOT)}  {total:.1f} s  {OUT.stat().st_size / 1_048_576:.1f} MB')
