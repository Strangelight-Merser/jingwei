#!/usr/bin/env python3
"""Build three unchanged Markdown submissions, update fields and export with Word.
Requires python-docx, Pillow, PyMuPDF, fonttools and the bundled Sharp runtime; macOS with Microsoft Word automation access.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess
import sys
import shutil
import os
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'exports/submission'
SANDBOX = Path.home() / 'Library/Containers/com.microsoft.Word/Data/Documents/jingwei-build'
JOBS = [('plan', '经纬*参赛计划书.md', '01_经纬_参赛计划书'),
        ('summary', '经纬*一页摘要.md', '02_经纬_一页摘要'),
        ('appendix', '经纬*技术与方法证据附录.md', '03_经纬_技术与方法附录')]
HEADER = '经纬·规则e判——基于公开估值规则与大模型解读的指数基金决策服务方案'


def element(tag, **attrs):
    e = OxmlElement('w:' + tag)
    for k, v in attrs.items():
        e.set(qn('w:' + k), str(v))
    return e


def font(obj, cn='SimSun', size=10.5, bold=False):
    obj.font.name = 'Times New Roman'
    obj.font.size = Pt(size)
    obj.font.bold = bold
    obj.font.color.rgb = RGBColor(0, 0, 0)
    rp = obj.element.get_or_add_rPr() if hasattr(obj.element, 'get_or_add_rPr') else obj._element.get_or_add_rPr()
    rf = rp.find(qn('w:rFonts'))
    if rf is None:
        rf = element('rFonts'); rp.insert(0, rf)
    for attr, value in [('eastAsia', cn), ('ascii', 'Times New Roman'), ('hAnsi', 'Times New Roman')]:
        rf.set(qn('w:' + attr), value)
    for attr in ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme']:
        rf.attrib.pop(qn('w:' + attr), None)


def field(p, instruction):
    r = p.add_run(); r._r.append(element('fldChar', fldCharType='begin'))
    r = p.add_run(); e = element('instrText'); e.set(qn('xml:space'), 'preserve'); e.text = ' ' + instruction + ' '; r._r.append(e)
    p.add_run()._r.append(element('fldChar', fldCharType='separate'))
    p.add_run()._r.append(element('fldChar', fldCharType='end'))


def inline(p, text, references=False):
    for part in re.split(r'(\*\*.*?\*\*|`[^`]+`|\[[1-5]\])', text):
        if not part: continue
        bold = part.startswith('**') and part.endswith('**')
        value = part[2:-2] if bold else part[1:-1] if part.startswith('`') and part.endswith('`') else part
        r = p.add_run(value)
        if part.startswith('`') and part.endswith('`'):
            font(r, 'SimSun', 9)
            r.font.name = 'Courier New'
            rf = r._r.get_or_add_rPr().find(qn('w:rFonts'))
            rf.set(qn('w:ascii'), 'Courier New'); rf.set(qn('w:hAnsi'), 'Courier New')
        if bold: r.bold = True
        if not references and re.fullmatch(r'\[[1-5]\]', value): r.font.superscript = True


def render_figures():
    """Keep editable SVG text; rasterize with the specified installed font outlines."""
    from lxml import etree as E
    from fontTools.ttLib import TTCollection, TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    font_dir=Path('/Applications/Microsoft Word.app/Contents/Resources/DFonts')
    fonts={'SimSun':TTCollection(font_dir/'Simsun.ttc').fonts[0],
           'SimHei':TTFont(font_dir/'SimHei.ttf'),
           'Times New Roman':TTFont(font_dir/'times.ttf')}
    runtime=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
    env=os.environ.copy(); env['NODE_PATH']=str(runtime/'node_modules')
    svg_ns='http://www.w3.org/2000/svg'
    for source in sorted((ROOT/'docs/figures').glob('0[1-4]_*.svg')):
        svg=E.fromstring(source.read_bytes())
        destination=OUT/'assets/figures'/source.name
        destination.write_bytes(source.read_bytes())
        for text in list(svg.iter('{'+svg_ns+'}text')):
            glyphs=[]
            for span in text:
                ft=fonts[span.get('font-family')]
                scale=float(text.get('font-size'))/ft['head'].unitsPerEm
                cmap=ft.getBestCmap(); gs=ft.getGlyphSet()
                for char in span.text or '':
                    name=cmap.get(ord(char),'space')
                    pen=SVGPathPen(gs);gs[name].draw(pen)
                    glyphs.append((pen.getCommands(),scale,ft['hmtx'][name][0]*scale))
            x=float(text.get('x')); y=float(text.get('y'))
            advance=sum(g[2] for g in glyphs)
            if text.get('text-anchor')=='middle':x-=advance/2
            group=E.Element('{'+svg_ns+'}g',fill=text.get('fill','#262626'))
            for path,scale,width in glyphs:
                if path:E.SubElement(group,'{'+svg_ns+'}path',d=path,transform=f'translate({x} {y}) scale({scale} {-scale})')
                x+=width
            text.getparent().replace(text,group)
        result=subprocess.run([str(runtime/'bin/node'),'-e',
            "const sharp=require('sharp'); const parts=[]; process.stdin.on('data',b=>parts.push(b)); process.stdin.on('end',()=>sharp(Buffer.concat(parts)).resize({width:2400}).png().toBuffer().then(b=>process.stdout.write(b)).catch(()=>process.exit(1)));"],
            input=E.tostring(svg),capture_output=True,env=env)
        if result.returncode:raise RuntimeError('Figure PNG export failed.')
        destination.with_suffix('.png').write_bytes(result.stdout)
        source.with_suffix('.png').write_bytes(result.stdout)


def name_spacing(p):
    if '经纬·规则e判' in p.text:
        pr=p._p.get_or_add_pPr()
        for tag in ['autoSpaceDE','autoSpaceDN']:
            old=pr.find(qn('w:'+tag))
            if old is not None: pr.remove(old)
            pr.append(element(tag,val=0))


def column_widths(data, width, kind):
    if kind == 'summary': return [width * .35, width * .65]
    headers=data[0]
    if headers == ['数据','来源','频率','用途']: return [3.25,3.4,2.05,width-8.7]
    if headers == ['区间','分位','新增资金','已有持仓']: return [1.9,2.2,5.0,width-9.1]
    if headers[-1] == '样本天数': return [3.5,4.2,width-9.5,1.8]
    if headers == ['产品','主要做什么','经纬的不同']: return [3.25,4.7,width-7.95]
    if headers == ['指数','偏低区','中间区','偏高区','高位区']: return [2.3]+[(width-2.3)/4]*4
    if '同日样本' in headers: return [2.2,1.8,4.3,2.1,width-10.4]
    raise RuntimeError('Unrecognized table; assign content-specific column widths.')


def page_setup(sec, num=None, header=False):
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Cm(2.54)
    sec.left_margin = sec.right_margin = Cm(3.17)
    sec.gutter = Cm(0)
    sec.header_distance = sec.footer_distance = Cm(1.27)
    sec.header.is_linked_to_previous = False
    sec.footer.is_linked_to_previous = False
    if num:
        previous_num = sec._sectPr.find(qn('w:pgNumType'))
        if previous_num is not None: sec._sectPr.remove(previous_num)
        sec._sectPr.append(element('pgNumType', fmt=num, start=1))
        p = sec.footer.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        font(p.add_run(), size=9); field(p, r'PAGE \* ROMAN' if num == 'upperRoman' else 'PAGE')
    if header:
        p = sec.header.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = Pt(12)
        font(p.add_run(HEADER), size=9)
        name_spacing(p)
        borders = element('pBdr'); borders.append(element('bottom', val='single', sz=6, space=3, color='000000'))
        p._p.get_or_add_pPr().append(borders)


def style(doc, name, cn, size, before=0, after=0, indent=0, line=20):
    s = doc.styles[name]; font(s, cn, size)
    pf = s.paragraph_format
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    pf.first_line_indent = Pt(indent)
    pf.line_spacing = Pt(line)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.widow_control = True
    return s


def caption(doc, text, keep=False):
    p = doc.add_paragraph(style='Caption'); inline(p, text)
    p.paragraph_format.keep_with_next = keep
    return p


def build(kind, pattern, output, compact=False):
    sources = list((ROOT / 'docs').glob(pattern))
    if len(sources) != 1: raise RuntimeError('Expected exactly one plan Markdown source.')
    source = sources[0].read_text(encoding='utf-8')
    cover, body = source.split('<!-- cover-end -->', 1)
    personal_path = OUT / 'personal.json'
    personal = json.loads(personal_path.read_text(encoding='utf-8')) if personal_path.exists() else {}
    # Never emit personal values or persist them outside the requested document.
    doc = Document(); doc.core_properties.author = ''; doc.core_properties.last_modified_by = ''
    style(doc, 'Normal', 'SimSun', 10.5, indent=21, line=18 if compact else 20)
    for name, size, before, after, indent in [('Heading 1',14,12,6,0), ('Heading 2',12,6,3,24)]:
        s = style(doc,name,'SimHei',size,18 if kind == 'appendix' and name == 'Heading 1' else before,after,indent)
        s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        s.paragraph_format.keep_with_next = True
        if name == 'Heading 1': s.paragraph_format.page_break_before = kind == 'plan'
    for name in ['Heading 1 Char', 'Heading 2 Char']:
        if name in doc.styles: font(doc.styles[name], 'SimHei', 14 if '1' in name else 12)
    s = style(doc,'Caption','SimHei',9,before=6,line=12)
    s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    s.paragraph_format.keep_together = True
    for name, cn, size in [('toc 1','SimHei',12),('toc 2','SimSun',10.5)]:
        if name not in doc.styles:
            from docx.enum.style import WD_STYLE_TYPE
            doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        s=style(doc,name,cn,size,line=18)
        s._element.attrib.pop(qn('w:customStyle'), None)
        s.paragraph_format.keep_with_next=False
        if name == 'toc 2': s.paragraph_format.left_indent=Pt(21)
        s.paragraph_format.tab_stops.add_tab_stop(Cm(14.66),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
    if 'Reference' not in doc.styles:
        from docx.enum.style import WD_STYLE_TYPE
        doc.styles.add_style('Reference',WD_STYLE_TYPE.PARAGRAPH)
    s=style(doc,'Reference','SimSun',9,indent=-18,line=16); s.paragraph_format.left_indent=Pt(18)
    page_setup(doc.sections[0])
    def centered(text,cn,size,before=0,after=0):
        p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent=Pt(0)
        p.paragraph_format.space_before=Pt(before); p.paragraph_format.space_after=Pt(after)
        p.paragraph_format.line_spacing=1
        font(p.add_run(text),cn,size)
        name_spacing(p)
        return p
    if kind == 'summary':
        title = cover.splitlines()[0].removeprefix('# ')
        first, second = title.split('——', 1)
        centered(first, 'SimHei', 16, 0, 0)
        centered('——' + second, 'SimHei', 16, 0, 6)
        for text in [x.strip() for x in cover.splitlines()[1:] if x.strip()]:
            centered(text, 'SimSun', 12, 0, 0)
        page_setup(doc.sections[0], 'decimal', True)
        if compact:
            doc.sections[0].left_margin = doc.sections[0].right_margin = Cm(2.5)
    else:
        doc.sections[0].top_margin=Cm(2)
        centered('第十七届“工行杯”全国大学生金融科技创新大赛','SimSun',15,0)
        centered('技术与方法附录' if kind == 'appendix' else '参赛作品计划书','SimHei',36,162,20)
        centered('经纬·规则e判','SimHei',22,0,12)
        subtitle= centered('——基于公开估值规则与大模型解读的指数基金决策服务方案','SimHei',16,0,0)
        spacer=doc.add_paragraph()
        spacer.paragraph_format.first_line_indent=Pt(0)
        spacer.paragraph_format.line_spacing=Pt(136)
        subtitle.runs[0]._r.get_or_add_rPr().append(element('spacing',val=-16))
        values=dict(re.findall(r'^([^\n：]+)：([^\n]+)$',cover,re.M))
        t=doc.add_table(rows=5,cols=2); t.autofit=False
        t.columns[0].width=Cm(4.66); t.columns[1].width=Cm(10)
        t.alignment=1
        for row in t.rows:
            row.cells[0].width=Cm(4.66); row.cells[1].width=Cm(10)
        borders=element('tblBorders')
        for edge in ['top','left','bottom','right','insideH','insideV']: borders.append(element(edge,val='nil'))
        t._tbl.tblPr.append(borders)
        for row,label in zip(t.rows,['参赛方向','姓名','学校','学号','联系方式']):
            for cell in row.cells:
                cell.paragraphs[0].paragraph_format.first_line_indent=Pt(0)
                cell.paragraphs[0].paragraph_format.space_after=Pt(12)
                cell.paragraphs[0].paragraph_format.line_spacing=Pt(20)
            p=row.cells[0].paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.RIGHT; font(p.add_run(label+'：'),'SimSun',14)
            value=values.get(label,'【待填】')
            if value=='【待填】': value=personal.get(label) or value
            p=row.cells[1].paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            r=p.add_run(str(value)); font(r,'SimSun',14)
            cb=element('tcBorders'); cb.append(element('bottom',val='single',sz=4,color='000000'))
            row.cells[1]._tc.get_or_add_tcPr().append(cb)
        centered('二〇二六年十月','SimSun',14,44)
        page_setup(doc.add_section(WD_SECTION_START.NEW_PAGE),'upperRoman')
    lines=body.splitlines(); i=0; in_body=kind == 'summary'; references=False
    while i<len(lines):
        line=lines[i].strip(); i+=1
        if not line or line.startswith('<!--'): continue
        if line=='## 摘要': centered('摘　要','SimHei',16,0,18); continue
        if line.startswith('## ') and not in_body:
            if kind == 'plan': doc.add_page_break()
            centered('目　录','SimHei',16,0,18)
            p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Pt(0); field(p,'TOC \\o "1-2" \\h \\z \\u')
            page_setup(doc.add_section(WD_SECTION_START.NEW_PAGE),'decimal',True)
            in_body=True
        if line.startswith('## '):
            text=line[3:]; references=text=='参考文献'
            p=doc.add_paragraph(text,'Heading 1')
            if not any(x.style.name=='Heading 1' for x in doc.paragraphs[:-1]): p.paragraph_format.page_break_before=False
        elif line.startswith('### '): doc.add_paragraph(line[4:],'Heading 2')
        elif line.startswith('|'):
            rows=[line]
            while i<len(lines) and lines[i].strip().startswith('|'): rows.append(lines[i].strip()); i+=1
            data=[[x.strip() for x in r.strip('|').split('|')] for r in rows if not re.match(r'^\|[\s:|\-]+\|$',r)]
            j=i
            while j<len(lines) and not lines[j].strip(): j+=1
            if j<len(lines) and re.match(r'^表\d',lines[j].strip()): caption(doc,lines[j].strip(),True); i=j+1
            table=doc.add_table(rows=len(data),cols=len(data[0])); table.autofit=False
            tw=table._tbl.tblPr.find(qn('w:tblW')); tw.set(qn('w:w'),'5000'); tw.set(qn('w:type'),'pct')
            b=element('tblBorders')
            for edge in ['top','bottom']: b.append(element(edge,val='single',sz=12,color='000000'))
            for edge in ['left','right','insideH','insideV']: b.append(element(edge,val='nil'))
            table._tbl.tblPr.append(b)
            text_width=16 if kind == 'summary' and compact else 14.66
            widths=column_widths(data,text_width,kind)
            for col,w in zip(table.columns,widths): col.width=Cm(w)
            for ri,(row,items) in enumerate(zip(table.rows,data)):
                row._tr.get_or_add_trPr().append(element('cantSplit'))
                if ri==0: row._tr.get_or_add_trPr().append(element('tblHeader'))
                for ci,(cell,text) in enumerate(zip(row.cells,items)):
                    cell.width=Cm(widths[ci])
                    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
                    cb=element('tcBorders')
                    if ri==0: cb.append(element('bottom',val='single',sz=6,color='000000'))
                    cell._tc.get_or_add_tcPr().append(cb)
                    p=cell.paragraphs[0]; p.paragraph_format.first_line_indent=Pt(0); p.paragraph_format.line_spacing=1
                    p.paragraph_format.keep_with_next=ri<len(data)-1; p.paragraph_format.keep_together=True
                    p.alignment=WD_ALIGN_PARAGRAPH.LEFT if data[0][ci] in ['用途','主要做什么','经纬的不同','项目','结果'] or max(len(r[ci]) for r in data)>16 else WD_ALIGN_PARAGRAPH.CENTER
                    inline(p,text)
                    for r in p.runs: font(r,'SimSun',9,ri==0)
        elif line.startswith('!['):
            match=re.fullmatch(r'!\[([^]]*)\]\(([^)]+)\)',line)
            path=(sources[0].parent/match[2]).resolve()
            if not path.is_relative_to((OUT/'assets').resolve()): raise RuntimeError('Image must be in submission assets.')
            width,height=Image.open(path).size; cm=min(14.66,9*width/height) if 'screens' in path.parts else 14.66
            p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent=Pt(0); p.paragraph_format.line_spacing=1; p.paragraph_format.keep_with_next=True
            pic=p.add_run().add_picture(str(path),width=Cm(cm))
            if 'screens' in path.parts:
                from lxml import etree
                sp=pic._inline.xpath('.//pic:spPr')[0]
                ns='http://schemas.openxmlformats.org/drawingml/2006/main'
                ln=etree.SubElement(sp,'{'+ns+'}ln',w='6350'); fill=etree.SubElement(ln,'{'+ns+'}solidFill'); etree.SubElement(fill,'{'+ns+'}srgbClr',val='BFBFBF')
        elif re.match(r'^图\d',line): caption(doc,line)
        elif re.match(r'^表\d',line): caption(doc,line,True)
        elif line.startswith('注：'):
            p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Pt(0); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.line_spacing=Pt(12); inline(p,line)
            for r in p.runs: font(r,'SimSun',9)
        elif line.startswith('关键词：'):
            p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Pt(0)
            font(p.add_run('关键词：'),'SimHei',10.5); inline(p,line[len('关键词：'):])
        else:
            p=doc.add_paragraph(style='Reference' if references else 'Normal')
            if line.startswith('- '): line='• '+line[2:]
            inline(p,line,references)
            previous=p._p.getprevious()
            if previous is not None and previous.tag==qn('w:p') and ''.join(previous.itertext()).startswith('注：'):
                previous=previous.getprevious()
            if previous is not None and (previous.tag==qn('w:tbl') or (previous.tag==qn('w:p') and previous.find('.//'+qn('w:pStyle')) is not None and previous.find('.//'+qn('w:pStyle')).get(qn('w:val'))=='Caption' and ''.join(previous.itertext()).startswith('图'))):
                p.paragraph_format.space_before=Pt(6)
    for p in doc.paragraphs: name_spacing(p)
    compat=doc.settings.element.find(qn('w:compat'))
    if compat is not None:
        for e in compat:
            if e.get(qn('w:name')) == 'compatibilityMode': e.set(qn('w:val'),'15')
    doc.settings.element.append(element('updateFields',val='true'))
    doc.save(output)


def word_export(output):
    SANDBOX.mkdir(parents=True, exist_ok=True)
    staged = SANDBOX / output.name
    staged_pdf = staged.with_suffix(".pdf")
    # Refuse to reuse a document already open by the user, even with the same name.
    preflight = 'on run argv\ntell application "Microsoft Word"\nif exists document (item 1 of argv) then return "open"\nend tell\nend run'
    check = subprocess.run(['osascript', '-', output.name], input=preflight,
                           text=True, capture_output=True, timeout=15)
    if check.returncode or check.stdout.strip() == 'open':
        raise RuntimeError('Word has the target document open, or automation access is unavailable; no open document was changed.')
    shutil.copy2(output, staged)
    # The script operates on this path only; no selection, active-document or quit commands.
    script='''on run argv
set docPath to item 1 of argv
set pdfPath to item 2 of argv
tell application "Microsoft Word"
    open file name docPath
    set targetDoc to document (name of (info for POSIX file docPath))
    repeat 2 times
        repaginate targetDoc
        repeat with f in (get fields of targetDoc)
            update field f
        end repeat
        repeat with toc in (get tables of contents of targetDoc)
            update toc
            update page numbers toc
        end repeat
        repeat with s in (get sections of targetDoc)
            set foot to get footer s index header footer primary
            repeat with f in (get fields of text object of foot)
                update field f
            end repeat
        end repeat
    end repeat
    repaginate targetDoc
    save targetDoc
    close targetDoc saving no
    open file name docPath
    set targetDoc to document (name of (info for POSIX file docPath))
    repaginate targetDoc
    delay 2
    save targetDoc
    save as targetDoc file name pdfPath file format format PDF
    close targetDoc saving no
end tell
end run'''
    try:
        result=subprocess.run(['osascript','-',''+str(staged),str(staged_pdf)],input=script,text=True,capture_output=True,timeout=60)
    except subprocess.TimeoutExpired:
        raise RuntimeError('Word automation did not finish; check for a macOS authorization dialog before rerunning.') from None
    if result.returncode:
        # Word errors can contain document content; keep logs free of personal information.
        raise RuntimeError('Microsoft Word automation failed (osascript exit '+str(result.returncode)+'); inspect Word authorization or scripting support.')

    shutil.copy2(staged, output)
    shutil.copy2(staged_pdf, output.with_suffix(".pdf"))


def render(output, directory):
    import pymupdf as fitz
    directory.mkdir(parents=True,exist_ok=True)
    with fitz.open(output.with_suffix(".pdf")) as pdf:
        for i,page in enumerate(pdf):
            page.get_pixmap(matrix=fitz.Matrix(2,2)).save(directory/f'page-{i+1:02d}.png')
        print(f'{output.stem}: {len(pdf)} pages, {output.with_suffix(".pdf").stat().st_size} bytes')
        return len(pdf)


if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--render-dir',type=Path,default=Path('/tmp/jingwei-bj-render')); args=ap.parse_args()
    try:
        render_figures()
        for kind, pattern, stem in JOBS:
            output = OUT / (stem + '.docx')
            build(kind, pattern, output); word_export(output)
            import pymupdf
            with pymupdf.open(output.with_suffix('.pdf')) as pdf: pages=len(pdf)
            if kind == 'summary' and pages > 1:
                build(kind, pattern, output, compact=True); word_export(output)
                with pymupdf.open(output.with_suffix('.pdf')) as pdf: pages=len(pdf)
                if pages > 1: raise RuntimeError('Summary exceeds one page after allowed 18 pt spacing and 2.5 cm side margins.')
            render(output, args.render_dir / stem)
    except Exception as exc:
        # Do not serialize JSON values, document contents or raw AppleScript errors.
        print(str(exc) if isinstance(exc,RuntimeError) else 'Document build failed: '+type(exc).__name__,file=sys.stderr)
        sys.exit(1)
