"""Gather the contest submission into one numbered folder: exports/submission/经纬_参赛提交包/.

Inputs are the files the other build scripts write into exports/submission/ (plan, deck, video),
the desktop installers in releases/, and two Markdown sources rendered here (install guide, form
texts). The source archive is `git archive HEAD`: tracked files only, so no personal data, keys or
build output. Missing inputs are listed at the end instead of stopping the run.
Run: python3 scripts/assemble-submission.py
"""
from pathlib import Path
import shutil
import json
import subprocess
import markdown

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'exports' / 'submission'
OUT = SRC / '经纬_参赛提交包'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CSS = """
@page{size:A4;margin:18mm 18mm 20mm}
body{font-family:'PingFang SC','Songti SC',sans-serif;font-size:10.5pt;line-height:1.75;color:#25252b}
h1{font-size:18pt;margin:0 0 4mm;letter-spacing:.02em}
h2{font-size:12.5pt;margin:7mm 0 2mm;padding-top:3mm;border-top:1px solid #dcdce1}
p,li{margin:1.5mm 0}
code,pre{font-family:Menlo,monospace;font-size:9pt}
pre{background:#f4f4f6;padding:3mm 4mm;border-radius:2mm}
strong{color:#25252b}
"""

missing: list[str] = []


def copy(source: Path, target: Path):
    if source.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    else:
        missing.append(str(source.relative_to(ROOT)))


def md_to_pdf(source: Path, target: Path):
    """Markdown → HTML → PDF with headless Chrome (no header/footer lines)."""
    html = target.with_suffix('.html')
    body = markdown.markdown(source.read_text(encoding='utf-8'), extensions=['fenced_code', 'tables'])
    html.write_text(f'<!doctype html><meta charset="utf-8"><style>{CSS}</style>{body}', encoding='utf-8')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    f'--print-to-pdf={target}', html.as_uri()], check=True, capture_output=True)
    html.unlink()


if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)

copy(SRC / '01_经纬_参赛计划书.pdf', OUT / '01_经纬_参赛计划书.pdf')
copy(SRC / '01_经纬_参赛计划书.docx', OUT / '01_经纬_参赛计划书.docx')
copy(SRC / '02_经纬_一页摘要.pdf', OUT / '02_经纬_一页摘要.pdf')
copy(SRC / '03_经纬_技术与方法附录.pdf', OUT / '03_经纬_技术与方法附录.pdf')
copy(SRC / '04_经纬_路演.pptx', OUT / '04_经纬_路演.pptx')
copy(SRC / '04_经纬_路演.pdf', OUT / '04_经纬_路演.pdf')
copy(SRC / '05_经纬_演示视频.mp4', OUT / '05_经纬_演示视频.mp4')
copy(SRC / '05_经纬_演示视频_30秒.mp4', OUT / '05_经纬_演示视频_30秒.mp4')

software = OUT / '06_安装包'
for name in ['Jingwei-1.0.0-rc.5-mac-arm64.dmg', 'Jingwei-1.0.0-rc.5-windows-x64-setup.exe']:
    copy(ROOT / 'releases' / '1.0.0-rc.5' / name, software / name)
md_to_pdf(ROOT / 'docs' / '安装与使用说明.md', software / '安装与使用说明.pdf')

commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
source_dir = OUT / '07_源码'
source_dir.mkdir()
subprocess.run(['git', 'archive', '--format=zip', f'--prefix=jingwei/', '-o', str(source_dir / f'经纬_源码_{commit}.zip'), 'HEAD'], cwd=ROOT, check=True)

form = ROOT / 'docs' / '提交表单填写.md'
if form.exists():
    content = form.read_text(encoding='utf-8')
    personal_path = SRC / 'personal.json'
    if personal_path.is_file():
        personal = json.loads(personal_path.read_text(encoding='utf-8'))
        keys = ('姓名', '学校', '学院', '专业', '年级', '学号', '指导教师', '联系方式')
        fields = []
        for key in keys:
            value = personal.get(key, '【待填】')
            if not isinstance(value, str):
                raise ValueError(f'个人信息字段必须为字符串：{key}')
            fields.append(f'- **{key}**：{value or "【待填】"}')
        content = content.replace('- **' + ' / '.join(keys) + '**：【待填】', '\n'.join(fields))
        content = content.replace('个人信息一律由本人填写。', '个人信息待填项请本人补全。')
    (OUT / '提交表单填写.md').write_text(content, encoding='utf-8')
else:
    missing.append(str(form.relative_to(ROOT)))

for path in sorted(OUT.rglob('*')):
    if path.is_file():
        print(f'{path.relative_to(OUT)}  {path.stat().st_size / 1_048_576:.1f} MB')
if missing:
    print('\n尚缺：')
    for item in missing:
        print(' -', item)
