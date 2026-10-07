"""Generate explicitly synthetic platform-style holdings, then record local Vision OCR.
Run from jingwei/: python3 tests/fixtures/holdings/generate-am.py
Requires Pillow and the project's .local/bin/jingwei-ocr; no account data is used.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
# Public-list identities, not fictional funds. All balances and layouts are synthetic.
FUNDS = [
    ('006479', '广发纳斯达克100ETF联接人民币(QDII)C', 'NDX'),
    ('012349', '天弘恒生科技ETF联接C', 'HSTECH'),
    ('000198', '天弘余额宝货币', None),
    ('005827', '易方达蓝筹精选混合', None),
    ('007801', '大成中证红利指数C', '000922'),
    ('110026', '易方达创业板ETF联接A', '399006'),
    ('011613', '华夏科创50ETF联接C', '000688'),
    ('006075', '博时标普500ETF联接C', 'SPX'),
    ('000015', '华夏纯债债券A', None),
]
# Check every identity against the public seed before rendering.
seed = subprocess.check_output(['node', '--input-type=module', '-e',
    'import {FUND_LIST_SEED as s} from "./packages/backend/fund-list-seed.ts"; console.log(JSON.stringify(s.funds));'], cwd=ROOT, text=True)
public = {f['code']: f for f in json.loads(seed)}
for code, name, _ in FUNDS:
    assert public[code]['name'] == name
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
def font(size): return ImageFont.truetype(FONT, size)
styles = [
    ('cmb-app', '招商银行 App · 基金持仓', '#b32734', 'card'),
    ('tiantian-list', '天天基金 · 持仓列表', '#e46622', 'table'),
    ('danjuan-xueqiu', '蛋卷 / 雪球 · 基金持仓', '#287ac0', 'inline'),
    ('jd-finance', '京东金融 · 基金持仓', '#d53131', 'columns'),
    ('wechat-licaitong', '微信理财通 · 我的基金', '#258354', 'label'),
]
amounts = [12300, 12345.67, 3000, 4567.89, 9876.54, 2500, 6789.01, 18000, 7654.32]
for slug, title, color, layout in styles:
    im = Image.new('RGB', (1100, 2240), '#f2f4f7')
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1100, 180), fill=color)
    d.text((40, 25), title, font=font(42), fill='white')
    d.text((40, 95), '虚构持仓示例 · 非真实账户 · 仅供解析测试', font=font(30), fill='white')
    expected = []
    for i, (code, name, index) in enumerate(FUNDS):
        y = 210 + i * 220
        d.rounded_rectangle((25, y, 1075, y+200), radius=16, fill='white')
        d.text((45, y+15), name, font=font(29), fill='#202c39')
        d.text((45, y+57), code, font=font(24), fill='#647282')
        val = '1.23万' if i == 0 else f'¥{amounts[i]:,.2f}' if i == 1 else f'{amounts[i]:,.2f}'
        if layout == 'columns':
            d.text((530, y+75), '最新市值', font=font(25), fill='#647282')
            d.text((870, y+75), '累计收益', font=font(25), fill='#647282')
            d.text((530, y+125), val, font=font(32), fill='#202c39')
            d.text((870, y+125), '18.90', font=font(30), fill='#b32734')
        elif layout == 'card':
            d.text((45, y+100), '持有金额（元）', font=font(25), fill='#647282')
            d.text((720, y+100), '持有收益（元）', font=font(25), fill='#647282')
            d.text((45, y+140), val, font=font(32), fill='#202c39')
            d.text((720, y+140), '18.90', font=font(30), fill='#b32734')
        elif layout == 'table':
            d.text((560, y+60), '持有金额', font=font(25), fill='#647282')
            d.text((870, y+60), '昨日收益', font=font(25), fill='#647282')
            d.text((560, y+112), val, font=font(32), fill='#202c39')
            d.text((870, y+112), '18.90', font=font(30), fill='#b32734')
        elif layout == 'inline':
            d.text((45, y+117), '持有金额 '+val, font=font(32), fill='#202c39')
            d.text((780, y+117), '+1.23%', font=font(28), fill='#b32734')
        else:
            d.text((45, y+117), '持有金额：'+val, font=font(32), fill='#202c39')
            d.text((780, y+117), '收益 +18.90', font=font(26), fill='#b32734')
        expected.append({'name': name, 'code': code, 'amount': amounts[i], 'covered_index': index})
    path = OUT / (slug+'.synthetic.png')
    im.save(path)
    lines = json.loads(subprocess.check_output([str(ROOT/'.local/bin/jingwei-ocr'), str(path)], text=True))
    fixture = {'source': title+'风格的合成版式，非平台截图；Pillow 生成，金额虚构，基金身份来自公开种子。',
               'image': path.name, 'lines': lines, 'holdings': expected}
    (OUT/(slug+'.synthetic.json')).write_text(json.dumps(fixture, ensure_ascii=False, indent=2)+'\n')
    print(slug, len(lines), 'OCR lines')
