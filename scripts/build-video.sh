#!/usr/bin/env bash
# BG: run after BA has delivered all 17 screenshots and their README.
# Usage: scripts/build-video.sh [--check]
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in ''|--check) ;; *) echo 'Usage: scripts/build-video.sh [--check]' >&2; exit 2 ;; esac
export BG_CHECK_ONLY="${1:-}"
python3 - <<'PY'
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

screens = Path('exports/submission/assets/screens')
output = Path('exports/submission')
images = {}
missing = []
for number in range(1, 18):
    matches = sorted(p for p in screens.glob(f'{number:02d}*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg'))
    if len(matches) != 1:
        missing.append(f'{number:02d}: 需要一张截图，现有 {len(matches)} 张')
    else:
        images[number] = matches[0].resolve()
if not (screens / 'README.md').is_file():
    missing.append('缺少 BA 的 README.md')
if missing:
    print('等待 BA 截图齐备；未生成视频。\n' + '\n'.join(missing))
    raise SystemExit(3)
for tool in ('ffmpeg', 'ffprobe'):
    if not shutil.which(tool):
        raise SystemExit(f'缺少 {tool}')
font = Path('/System/Library/Fonts/Supplemental/Songti.ttc')
if not font.is_file():
    raise SystemExit('缺少指定中文字体 Songti SC')
if os.environ['BG_CHECK_ONLY'] == '--check':
    print('BA 的 17 张截图与 README 已齐备，视频依赖可用。')
    raise SystemExit(0)

# Roadshow order: current judgment → history → holdings → Ask → bank service.
# Avoid copying old holding amounts or presenting an unanswered Ask panel as a model answer.
full = [
    (1, 10, '经纬·规则e判', '公开估值规则与大模型解读，连接客户与客户经理'),
    (1, 10, '先看今日判断', '新增资金与已有持仓，分别给出对应说法'),
    (2, 10, '切换指数，查看各自判断', '全部指数一览连接每个指数的当前估值与区间'),
    (4, 10, '判断改变需要确认', '五个百分点缓冲；日数据连续五次、周数据连续两次确认'),
    (5, 10, '每次改判都有依据', '回看历史记录、触发条件与对应数据'),
    (6, 10, '历史结果提供第二视角', '收益回放与股债对照；历史回算不代表未来收益'),
    (7, 10, '导入后先核对', '虚构持仓示例：核对基金名称与金额，再确认保存'),
    (8, 10, '让组合的去向看得清', '虚构持仓示例：查看规则覆盖、区间分布与重复方向'),
    (15, 10, '规则决定判断，AI解释原因', '展示问经纬提问入口；本视频未发起模型请求'),
    (12, 10, '同一依据，接入机构服务', '规则卡、嵌入代码与JSON，连接基金频道'),
    (13, 10, '让每次改变有依据', '客户经理一页说明，承接判断与客户情境'),
]
short = [
    (1, 6, '经纬·规则e判', '先看今日判断：新增资金与已有持仓'),
    (5, 6, '改判可以回看', '公开规则，让改变有据可查'),
    (8, 6, '持仓体检', '虚构持仓示例：看覆盖、区间与重复方向'),
    (15, 6, '问经纬', '规则决定判断，AI解释原因；此处展示提问入口'),
    (12, 6, '连接工行服务场景', '规则卡与客户经理说明，共用同一依据'),
]

def run(args):
    subprocess.run(args, check=True)

def render(scenes, destination, temp):
    clips = []
    for i, (number, seconds, title, caption) in enumerate(scenes):
        subtitle = Image.new('RGB', (1920, 120), '#25252b')
        draw = ImageDraw.Draw(subtitle)
        draw.rectangle((0, 0, 1919, 4), fill='#963749')
        draw.text((960, 18), title, font=ImageFont.truetype(str(font), 32), fill='white', anchor='mt')
        draw.text((960, 64), caption, font=ImageFont.truetype(str(font), 27), fill='white', anchor='mt')
        subtitle_file = temp / f'subtitle-{i}.png'
        subtitle.save(subtitle_file)
        clip = temp / f'clip-{i}.mp4'
        frames = seconds * 30
        # Desktop viewports stay complete; tall pages scroll at readable width.
        # Reserve the bottom strip for captions throughout the movement.
        width, height = Image.open(images[number]).size
        if height / width > 0.8:
            picture = ("scale=1800:-2,pad=1920:ih+120:60:60:color=0xf8f6f3,"
                       f"crop=1920:960:0:'(in_h-out_h)*min(n/{frames-1},1)',setsar=1,")
        else:
            picture = ("scale=1800:840:force_original_aspect_ratio=decrease,"
                       "pad=1920:960:(ow-iw)/2:(oh-ih)/2:color=0xf8f6f3,setsar=1,")
        vf = (
            picture +
            f"zoompan=z='1.025-0.025*on/{frames-1}':x='iw/2-iw/zoom/2':"
            f"y='ih/2-ih/zoom/2':d=1:s=1920x960:fps=30"
            "[picture];[picture][1:v]vstack=inputs=2,"
            f"fade=t=in:st=0:d=0.4,fade=t=out:st={seconds-0.4}:d=0.4,format=yuv420p[out]"
        )
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', str(images[number]),
             '-loop', '1', '-framerate', '30', '-i', str(subtitle_file), '-filter_complex', '[0:v]' + vf,
             '-map', '[out]', '-r', '30', '-frames:v', str(frames), '-an', '-c:v', 'libx264',
             '-preset', 'medium', '-crf', '18', '-threads', '4', str(clip)])
        clips.append(clip)
    listing = temp / 'concat.txt'
    listing.write_text(''.join(f"file '{p}'\n" for p in clips), encoding='utf-8')
    staged = temp / 'complete.mp4'
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
         '-i', str(listing), '-c', 'copy', '-movflags', '+faststart', str(staged)])
    import json
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                    '-show_format', '-of', 'json', str(staged)]))
    streams = probe['streams']
    expected = sum(s[1] for s in scenes)
    assert len(streams) == 1 and streams[0]['codec_type'] == 'video'
    assert (streams[0]['width'], streams[0]['height']) == (1920, 1080)
    assert abs(float(probe['format']['duration']) - expected) < 0.1
    shutil.copyfile(staged, destination)
    print(f'已生成 {destination}（{expected}秒，1920×1080，无音轨）')

output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='jingwei-bg-') as work:
    root = Path(work)
    for scenes, filename, name in [(full, '05_经纬_演示视频.mp4', 'full'),
                                   (short, '05_经纬_演示视频_30秒.mp4', 'short')]:
        temp = root / name
        temp.mkdir()
        render(scenes, output / filename, temp)
PY
