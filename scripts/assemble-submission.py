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
import qrcode
import qrcode.image.svg
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'exports' / 'submission'
OUT = SRC / '经纬_参赛提交包'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
REPO_URL = 'https://github.com/Strangelight-Merser/jingwei'
RELEASE_URL = f'{REPO_URL}/releases/tag/v1.0.0-rc.5'
# (file in the package, name on the release page, note). GitHub drops non-ASCII characters from asset names.
DOWNLOADS = [('05_经纬_演示视频.mp4', 'jingwei-demo.mp4', '演示视频（约 2 分钟）'),
             ('05_经纬_演示视频_30秒.mp4', 'jingwei-demo-30s.mp4', '演示视频短版（30 秒）'),
             ('06_安装包/Jingwei-1.0.0-rc.5-mac-arm64.dmg', 'Jingwei-1.0.0-rc.5-mac-arm64.dmg', 'Mac 安装包（Apple Silicon）'),
             ('06_安装包/Jingwei-1.0.0-rc.5-windows-x64-setup.exe', 'Jingwei-1.0.0-rc.5-windows-x64-setup.exe', 'Windows 安装包（64 位）'),
             ('06_安装包/安装与使用说明.pdf', 'jingwei-install-guide.pdf', '安装步骤与常见问题')]
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
copy(SRC / '02_经纬_一页摘要.docx', OUT / '02_经纬_一页摘要.docx')
copy(SRC / '03_经纬_技术与方法附录.docx', OUT / '03_经纬_技术与方法附录.docx')



def download_page(target: Path):
    """One A4 page in the documents' style: where to get the video, installers and source."""
    qr = qrcode.make(RELEASE_URL, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=1).to_string(encoding='unicode')
    rows = ''.join(f'<tr><td>{shown}</td><td class="n">{(OUT / name).stat().st_size / 1_048_576:.1f} MB</td><td>{note}</td></tr>'
                   for name, shown, note in DOWNLOADS if (OUT / name).exists())
    page = f"""<!doctype html><meta charset="utf-8"><style>
@page{{size:A4;margin:25.4mm 31.7mm}}
body{{font-family:'Times New Roman','Songti SC',serif;font-size:10.5pt;line-height:20pt;color:#000}}
h1{{font-family:'Times New Roman','Heiti SC',sans-serif;font-size:16pt;font-weight:normal;text-align:center;margin:0 0 18pt}}
p{{text-indent:2em;margin:0;text-align:justify}}
.qr{{text-align:center;margin:18pt 0 6pt}} .qr svg{{width:45mm;height:45mm}}
.url{{text-align:center;text-indent:0;font-size:10.5pt;margin-bottom:18pt}}
.cap{{font-family:'Times New Roman','Heiti SC',sans-serif;font-size:9pt;text-align:center;text-indent:0;margin-top:6pt}}
table{{width:100%;border-collapse:collapse;font-size:9pt;line-height:14pt;border-top:1.5pt solid #000;border-bottom:1.5pt solid #000}}
th{{font-weight:normal;border-bottom:.75pt solid #000;padding:3pt 4pt;text-align:left}} td{{padding:3pt 4pt}} .n{{white-space:nowrap}}
.note{{font-size:9pt;line-height:14pt;text-indent:0;margin-top:4pt}}
</style><h1>演示与下载</h1>
<p>演示视频、桌面安装包和全部源码发布在 GitHub。扫描下方二维码或打开链接，即可在发布页下载以下文件；源码仓库为 {REPO_URL}。</p>
<div class="qr">{qr}</div><p class="url">{RELEASE_URL}</p>
<p class="cap">表 下载文件</p>
<table><tr><th>文件</th><th>大小</th><th>说明</th></tr>{rows}</table>
<p class="note">注：GitHub 在部分网络环境下访问较慢，可先观看 30 秒短版视频。安装包无需另装运行环境，安装步骤见《安装与使用说明》。</p>"""
    html = target.with_suffix('.html')
    html.write_text(page, encoding='utf-8')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    f'--print-to-pdf={target}', html.as_uri()], check=True, capture_output=True)
    html.unlink()


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

# One PDF for upload forms that accept a single attachment (≤20 MB): summary, plan, appendix, deck, with bookmarks.
parts = [('作品摘要', '02_经纬_一页摘要.pdf'), ('参赛作品计划书', '01_经纬_参赛计划书.pdf'),
         ('技术与方法附录', '03_经纬_技术与方法附录.pdf'), ('路演幻灯片', '04_经纬_路演.pdf')]
if all((SRC / name).exists() for _, name in parts):
    writer = PdfWriter()
    page = SRC / 'download-page.pdf'
    download_page(page)
    parts.insert(1, ('演示与下载', page))
    for title, name in parts:
        start = len(writer.pages)
        writer.append(PdfReader(SRC / name))
        writer.add_outline_item(title, start)
    writer.add_metadata({'/Title': '经纬·规则e判——基于公开估值规则与大模型解读的指数基金决策服务方案'})
    with open(OUT / '经纬·规则e判_参赛作品（合并版）.pdf', 'wb') as fh:
        writer.write(fh)
form = ROOT / 'docs' / '提交表单填写.md'
if form.exists():
    content = form.read_text(encoding='utf-8')
    personal_path = SRC / 'personal.json'
    if personal_path.is_file():
        personal = json.loads(personal_path.read_text(encoding='utf-8'))
        keys = ('姓名', '学校', '学院', '专业', '年级', '学号', '联系方式')
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
