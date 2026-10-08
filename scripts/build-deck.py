#!/usr/bin/env python3
"""Build the 14-slide manuscript deck and export PDF with Microsoft PowerPoint."""
import json
import re
import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageOps
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.oxml.xmlchemy import OxmlElement
from pptx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'exports/submission'
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
FONT = 'Microsoft YaHei'
INK, RED, GRAY = '262626', 'C7000B', '8C8C8C'
CONTENT_X, CONTENT_W = .6, 12.133333
CONTENT_Y, CONTENT_BOTTOM = 1.28, 6.88


def style(p, size, bold=False, color=INK):
    p.font.name = FONT
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = RGBColor.from_string(color)
    p.line_spacing = 1.3
    p.space_before = Pt(0)
    p.space_after = Pt(0)
    props = p._p.get_or_add_pPr().get_or_add_defRPr()
    for tag in ('a:ea', 'a:cs'):
        el = props.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            props.append(el)
        el.set('typeface', FONT)


def text(s, value, x, y, w, h, size=18, bold=False, color=INK, align=PP_ALIGN.LEFT):
    shape = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = shape.text_frame
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(value.split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        p.alignment = align
        style(p, size, bold, color)
    return shape


def points(s, values, x, y, w, h, size=20, numbered=False, middle=False):
    shape = text(s, '', x, y, w, h, size)
    tf = shape.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE if middle else MSO_ANCHOR.TOP
    for i, value in enumerate(values):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = re.sub(r'^(?:- |\d+\. )', '', value)
        style(p, size)
        p.space_before = Pt(8 if i else 0)
        props = p._p.get_or_add_pPr()
        props.set('marL', str(Pt(32 if numbered else 24)))
        props.set('indent', str(-Pt(26 if numbered else 18)))
        bullet_font = OxmlElement('a:buFont')
        bullet_font.set('typeface', FONT)
        bullet = OxmlElement('a:buAutoNum' if numbered else 'a:buChar')
        bullet.set('type' if numbered else 'char', 'arabicPeriod' if numbered else '•')
        if numbered and i == 0:
            bullet.set('startAt', '1')
        props.insert_element_before(bullet_font, 'a:buChar', 'a:buAutoNum', 'a:tabLst', 'a:defRPr')
        props.insert_element_before(bullet, 'a:tabLst', 'a:defRPr')
    return shape


def line(s, x, y, w, color=RED, width=1.5):
    sh = s.shapes.add_connector(1, Inches(x), Inches(y), Inches(x+w), Inches(y))
    sh.line.color.rgb = RGBColor.from_string(color)
    sh.line.width = Pt(width)
    sh._element.spPr.append(OxmlElement('a:effectLst'))
    sh._element.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}effectRef').set('idx', '0')


def image(s, name, x, y, w, h, crop=None):
    path = OUT / 'assets' / name
    with Image.open(path) as im:
        full_w, full_h = im.size
    left, top, right, bottom = crop or (0, 0, full_w, full_h)
    ratio = (right-left) / (bottom-top)
    iw, ih = (w, w/ratio) if ratio >= w/h else (h*ratio, h)
    pic = s.shapes.add_picture(str(path), Inches(x+(w-iw)/2), Inches(y+(h-ih)/2), width=Inches(iw), height=Inches(ih))
    pic.crop_left = left/full_w
    pic.crop_top = top/full_h
    pic.crop_right = (full_w-right)/full_w
    pic.crop_bottom = (full_h-bottom)/full_h
    if name.startswith('screens/'):
        pic.line.color.rgb = RGBColor.from_string('D9D9D9')
        pic.line.width = Pt(.75)


def table(s, rows, y, widths, heights):
    sh = s.shapes.add_table(len(rows), len(rows[0]), Inches(CONTENT_X), Inches(y), Inches(CONTENT_W), Inches(sum(heights)))
    tbl = sh.table
    for c, weight in zip(tbl.columns, widths):
        c.width = Inches(CONTENT_W*weight/sum(widths))
    for i, row in enumerate(rows):
        tbl.rows[i].height = Inches(heights[i])
        for j, value in enumerate(row):
            cell = tbl.cell(i,j)
            cell.text = value
            cell.margin_left = cell.margin_right = Inches(.12)
            cell.margin_top = cell.margin_bottom = Inches(.08)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = RGBColor(255,255,255)
            for p in cell.text_frame.paragraphs:
                style(p, 18, i == 0)
            tcpr = cell._tc.get_or_add_tcPr()
            for side in ('L','R','T','B'):
                el = OxmlElement('a:ln'+side)
                active = (side == 'T' and i == 0) or (side == 'B' and i in (0,len(rows)-1))
                el.set('w', str(int((1.5 if i != 0 or side == 'T' else .75)*12700)))
                fill = OxmlElement('a:solidFill' if active else 'a:noFill')
                if active:
                    rgb = OxmlElement('a:srgbClr'); rgb.set('val',INK); fill.append(rgb)
                el.append(fill); tcpr.insert(len(tcpr)-1, el)


def main():
    personal = json.loads((OUT/'personal.json').read_text())
    def person(key):
        value = personal.get(key, '')
        if not isinstance(value, str):
            raise ValueError(f'个人信息字段必须为字符串：{key}')
        return value or '【待填】'
    source = (ROOT/'docs/经纬_路演稿.md').read_text()
    pages = re.findall(r'^## 第(\d+)页 ([^\n]+)\n(.*?)(?=^## 第\d+页 |\Z)', source, re.M|re.S)
    prs = Presentation(); prs.slide_width = Inches(13.333333); prs.slide_height = Inches(7.5)
    for num, heading, body in pages:
        n = int(num)
        s = prs.slides.add_slide(prs.slide_layouts[6])
        s.background.fill.solid(); s.background.fill.fore_color.rgb = RGBColor(255,255,255)
        lines = [v.strip() for v in body.strip().splitlines() if v.strip()]
        notes = [v.removeprefix('讲稿：') for v in lines if v.startswith('讲稿：')]
        s.notes_slide.notes_text_frame.text = '\n'.join(notes)
        if n == 1:
            fields = dict(v.removeprefix('- ').split('：',1) for v in lines)
            sh = s.shapes.add_connector(1, Inches(.65), Inches(1.5), Inches(.65), Inches(6.0))
            sh.line.color.rgb = RGBColor.from_string(RED); sh.line.width = Pt(5)
            sh._element.spPr.append(OxmlElement('a:effectLst'))
            sh._element.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}effectRef').set('idx', '0')
            text(s,fields['标题'],1.1,1.7,11.3,.9,44,True)
            text(s,fields['副标题'],1.1,2.8,11.1,.8,22)
            text(s,fields['赛事'],1.1,3.85,11.1,.5,16)
            text(s,'　'.join(f'{k}：{person(k)}' for k in ('姓名','学校','学号')),1.1,4.55,11.1,.4,16)
            text(s,f'联系方式：{person("联系方式")}',1.1,5.05,11.1,.4,16)
            text(s,fields['日期'],1.1,5.55,11.1,.4,16)
            continue
        if n == 14:
            fields = dict(v.removeprefix('- ').split('：',1) for v in lines)
            text(s,fields['标题'],CONTENT_X,2.65,CONTENT_W,1,40,True,align=PP_ALIGN.CENTER)
            lower = fields['下方'].replace('姓名',person('姓名')).replace('学校',person('学校'))
            text(s,lower,CONTENT_X,4.1,CONTENT_W,.65,20,align=PP_ALIGN.CENTER)
            continue
        title = next((v.removeprefix('标题：') for v in lines if v.startswith('标题：')),heading)
        text(s,title,CONTENT_X,.3,CONTENT_W,.7,28,True)
        line(s,CONTENT_X,1.08,CONTENT_W)
        text(s,'经纬·规则e判',.6,7.03,6,.25,10,color=GRAY)
        text(s,str(n),12.1,7.03,.63,.25,10,color=GRAY,align=PP_ALIGN.RIGHT)
        pics = [v.split('：',1)[1] for v in lines if re.match(r'^图(?:（[左右]）)?：',v)]
        caption = next((v.removeprefix('图注：') for v in lines if v.startswith('图注：')),None)
        rows = [[c.strip() for c in v.strip('|').split('|')] for v in lines if v.startswith('|') and not re.match(r'^\|[-|]+\|$',v)]
        content = [v for v in lines if not v.startswith(('图','表：','|','讲稿：','标题：'))]
        if len(pics) == 1:
            image_w = CONTENT_W*.58
            crop = (300,220,2580,1800) if pics[0].startswith('screens/') else None
            image(s,pics[0],CONTENT_X,CONTENT_Y,image_w,5.15,crop)
            text(s,caption,CONTENT_X,6.61,image_w,.27,12,color=GRAY,align=PP_ALIGN.CENTER)
            text_x = CONTENT_X+image_w+.3
            points(s,content,text_x,CONTENT_Y,CONTENT_X+CONTENT_W-text_x,CONTENT_BOTTOM-CONTENT_Y,middle=True)
        elif pics:
            image_w = (CONTENT_W-.26)/2
            crops = {
                'screens/07_持仓导入.png': (300,300,2580,1613),
                'screens/08_持仓体检结果.png': (300,200,2580,1513),
                'screens/12_机构服务规则卡.png': (300,250,2580,1563),
                'screens/13_客户经理说明.png': (300,260,2580,1573),
            }
            for j, pic in enumerate(pics):
                image(s,pic,CONTENT_X+j*(image_w+.26),CONTENT_Y,image_w,3.42,crops[pic])
            text(s,caption,CONTENT_X,4.75,CONTENT_W,.25,12,color=GRAY,align=PP_ALIGN.CENTER)
            points(s,content,CONTENT_X,5.06,CONTENT_W,1.82)
        elif rows:
            label = next((v.removeprefix('表：') for v in lines if v.startswith('表：')),None)
            if label: text(s,label,CONTENT_X,1.3,CONTENT_W,.45,20)
            if n==12:
                table(s,rows,1.3,[4.15,7.983333],[.64]+[.97]*5)
            elif n==5:
                table(s,rows,1.86,[2,2.2,4.05,3.883333],[.70]*5)
                points(s,content,CONTENT_X,5.5,CONTENT_W,1.38)
            else:
                table(s,rows,1.96,[2.35,4.2,3.15,2.433333],[.78]*5)
                text(s,'\n'.join(content),CONTENT_X,6.03,CONTENT_W,.85,18)
        elif n==3:
            points(s,[v for v in content if v.startswith('- ')],CONTENT_X,1.6,CONTENT_W,2.35,24,numbered=True,middle=True)
            line(s,CONTENT_X,4.35,CONTENT_W,'D9D9D9',.75)
            text(s,'\n'.join(v for v in content if not v.startswith('- ')),CONTENT_X,4.65,CONTENT_W,1.6,18)
        elif n==13:
            split = content.index('后续计划：')
            text(s,content[0],CONTENT_X,1.5,CONTENT_W,.45,20,True)
            points(s,content[1:split],CONTENT_X,2.1,CONTENT_W,1.45)
            text(s,content[split],CONTENT_X,4.03,CONTENT_W,.45,20,True)
            points(s,content[split+1:],CONTENT_X,4.68,CONTENT_W,1.95,numbered=True)
        else:
            points(s,content,CONTENT_X,1.48,CONTENT_W,5.1,numbered=n==2,middle=True)
    target = OUT/'04_经纬_路演.pptx'
    prs.save(target)
    sandbox = Path.home()/"Library/Containers/com.microsoft.Powerpoint/Data/Documents/jingwei-build"
    sandbox.mkdir(parents=True, exist_ok=True)
    staged = sandbox/target.name
    shutil.copy2(target, staged)
    # Keep every existing presentation open; export only this exact presentation.
    apple = '''on run argv
    tell application "Microsoft PowerPoint"
        activate
        open POSIX file (item 1 of argv)
        set deck to active presentation
        save deck in (POSIX file (item 2 of argv)) as save as PDF
        close deck saving no
    end tell
end run'''
    try:
        subprocess.run(['osascript','-e',apple,str(staged),str(staged.with_suffix('.pdf'))],check=True,timeout=45)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as e:
        raise SystemExit('PowerPoint 导出未完成；请检查授权弹窗或应用错误。'+str(e))
    shutil.copy2(staged.with_suffix('.pdf'), target.with_suffix('.pdf'))
    preview = OUT/'deck-preview-bl'; preview.mkdir(exist_ok=True)
    subprocess.run([str(RUNTIME/'bin/override/pdftoppm'),'-scale-to','1800','-png',str(target.with_suffix('.pdf')),str(preview/'slide')],check=True)
    thumbnails = []
    for i in range(1,len(pages)+1):
        with Image.open(preview/f'slide-{i:02d}.png') as im:
            thumbnails.append(ImageOps.pad(im.convert('RGB'),(640,360),color='white'))
    montage = Image.new('RGB',(4*660,4*380),'#E5E5E5')
    for i, thumb in enumerate(thumbnails): montage.paste(thumb,((i%4)*660+10,(i//4)*380+10))
    montage.save(preview/'all-slides.png')
    print(f'{len(pages)} 页；PDF {target.with_suffix(".pdf").stat().st_size} 字节；缩略图：{preview / "all-slides.png"}')

if __name__ == '__main__':
    main()
