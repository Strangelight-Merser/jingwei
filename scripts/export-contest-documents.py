"""Export the current candidate manuscripts with the local ResearchWrite builder."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT = Path(__file__).resolve().parents[1]
BUILDER = Path('/Users/huaiyi/.codex/skills/nature-proposal-writer/scripts/build_proposal_docx.py')
OUT = ROOT / 'exports'
OUT.mkdir(exist_ok=True)

def font(run, size=None):
    run.font.name = 'Times New Roman'
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'Songti SC')
    if size is not None:
        run.font.size = Pt(size)

def hyperlink(p, label, url):
    element = OxmlElement('w:hyperlink')
    element.set(qn('r:id'), p.part.relate_to(url, RT.HYPERLINK, is_external=True))
    r = OxmlElement('w:r')
    prop = OxmlElement('w:rPr')
    f = OxmlElement('w:rFonts')
    f.set(qn('w:ascii'), 'Times New Roman')
    f.set(qn('w:eastAsia'), 'Songti SC')
    prop.append(f)
    color = OxmlElement('w:color'); color.set(qn('w:val'), '733B36'); prop.append(color)
    r.append(prop)
    t = OxmlElement('w:t'); t.text = label; r.append(t)
    element.append(r); p._p.append(element)

def inline(p, text):
    p.clear()
    pattern = r'\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?://[^\s；，。]+)'
    pos = 0
    for match in re.finditer(pattern, text):
        font(p.add_run(text[pos:match.start()]))
        if match.group(1):
            url = match.group(2)
            if url.startswith(('https://', 'http://')):
                hyperlink(p, match.group(1), url)
            else:
                font(p.add_run(match.group(1)))
        elif match.group(5):
            hyperlink(p, match.group(5), match.group(5))
        else:
            run = p.add_run(match.group(3) or match.group(4)); font(run)
            run.bold = bool(match.group(3))
        pos = match.end()
    font(p.add_run(text[pos:]))

def export(name, summary=False):
    source = ROOT / 'docs' / (name + '.md')
    archived = OUT / source.name
    shutil.copyfile(source, archived)
    target = OUT / (name + '.docx')
    subprocess.run([sys.executable, str(BUILDER), str(source), str(target)], check=True)
    doc = Document(target)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    for style_name in ['Normal', 'Heading 1', 'Heading 2', 'Heading 3']:
        style = doc.styles[style_name]
        style.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'Songti SC')
        style.paragraph_format.widow_control = True
    normal = doc.styles['Normal'].paragraph_format
    normal.space_after = Pt(6 if not summary else 4)
    normal.line_spacing = Pt(18)
    for level, height in [(1,24),(2,21),(3,18)]:
        doc.styles[f'Heading {level}'].paragraph_format.line_spacing = Pt(height)
    if summary:
        for side in ['top_margin', 'bottom_margin']:
            setattr(sec, side, Cm(1.8))
        sec.left_margin = sec.right_margin = Cm(2.1)
        doc.styles['Normal'].font.size = Pt(11)
        normal.line_spacing = Pt(14)
        for level in (1, 2, 3):
            style = doc.styles[f'Heading {level}']
            style.font.size = Pt(11.5)
            style.paragraph_format.line_spacing = Pt(14)
            style.paragraph_format.space_before = Pt(7)
            style.paragraph_format.space_after = Pt(3)
    for index, p in enumerate(doc.paragraphs):
        raw = p.text
        if raw.startswith('*') and raw.endswith('*') and not raw.startswith('**'):
            p.clear()
            r = p.add_run(raw[1:-1]); r.italic = True; font(r, 9)
            continue
        image = re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)', raw)
        if image:
            p.clear()
            p.paragraph_format.line_spacing = 1.0
            picture = (source.parent / image.group(2)).resolve()
            p.add_run().add_picture(str(picture), width=Cm(15.7))
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption = p.insert_paragraph_before(image.group(1))
            caption.paragraph_format.space_before = Pt(8)
            caption.paragraph_format.keep_with_next = True
            for r in caption.runs: font(r, 9)
            continue
        if re.search(r'\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|https?://', raw):
            inline(p, raw)
        if p.style.name.startswith('Heading'):
            p.paragraph_format.keep_with_next = True
        for r in p.runs:
            font(r)
            if summary and p.style.name == 'Normal':
                r.font.size = Pt(11)
        if index == 0:
            p.paragraph_format.line_spacing = Pt(28)
            for r in p.runs: r.font.size = Pt(18)
    # A compact running footer leaves the manuscript editable and numbered.
    p = sec.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run('经纬 · 候选稿 · 2026-10-03    '); font(run, 8)
    run.font.color.rgb = RGBColor(110, 110, 110)
    field = OxmlElement('w:fldSimple'); field.set(qn('w:instr'), 'PAGE'); p._p.append(field)
    doc.core_properties.title = name
    doc.core_properties.subject = '基于当前实现整理；待套官方模板并由本人及学校审核'
    doc.core_properties.author = ''
    doc.save(target)
    print(target)

if __name__ == '__main__':
    export('经纬_参赛方案完整候选稿')
    export('经纬_一页摘要', summary=True)
