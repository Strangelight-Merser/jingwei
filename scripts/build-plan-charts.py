"""Draw the data charts for the contest plan in journal style (grayscale, SimSun / Times New Roman).

Rule charts read the replay output in exports/rule-replay/ (node scripts/replay-rule.ts writes it);
return, robustness and source-comparison figures are the published numbers in docs/规则稳健性.md and
docs/指数覆盖.md; bank figures come from the sources cited in docs/经纬_工行落地与价值测算.md.
Output: exports/submission/assets/charts/*.png
Run: python3 scripts/build-plan-charts.py
"""
from pathlib import Path
import csv
from datetime import date
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.dates import YearLocator, DateFormatter

ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / 'exports' / 'rule-replay'
OUT = ROOT / 'exports' / 'submission' / 'assets' / 'charts'
OUT.mkdir(parents=True, exist_ok=True)

FONTS = Path('/Applications/Microsoft Word.app/Contents/Resources/DFonts')
for name in ('times.ttf', 'Simsun.ttc', 'SimHei.ttf'):
    if (FONTS / name).exists():
        font_manager.fontManager.addfont(str(FONTS / name))
plt.rcParams.update({
    'font.family': ['Times New Roman', 'SimSun'], 'font.size': 9, 'axes.unicode_minus': True,
    'axes.linewidth': 0.6, 'axes.edgecolor': '#000000', 'axes.spines.top': False, 'axes.spines.right': False,
    'xtick.major.width': 0.6, 'ytick.major.width': 0.6, 'xtick.direction': 'in', 'ytick.direction': 'in',
    'legend.frameon': False, 'savefig.dpi': 300, 'savefig.bbox': 'tight', 'savefig.pad_inches': 0.04,
})
DARK, MID, LIGHT, PALE = '#262626', '#7f7f7f', '#bfbfbf', '#ececec'
BANDS = {'low': '偏低区', 'mid': '中间区', 'high': '偏高区', 'extreme': '高位区'}
WIDTH = 5.8  # inches, about the 14.66 cm text width


def save(fig, name):
    fig.savefig(OUT / f'{name}.png')
    plt.close(fig)


def replay(code):
    with open(REPLAY / code / 'daily.csv', encoding='utf-8') as fh:
        return [r for r in csv.DictReader(fh)]


def label_bars(ax, bars, values, fmt):
    for bar, v in zip(bars, values):
        if v is None:
            continue
        y = bar.get_height()
        ax.annotate(fmt(v), (bar.get_x() + bar.get_width() / 2, y), xytext=(0, 2 if y >= 0 else -9),
                    textcoords='offset points', ha='center', fontsize=7.5)


# 1. 沪深300 滚动市盈率与十年分位（2016-09 起有完整窗口）
rows = [r for r in replay('000300') if r['percentile']]
days = [date.fromisoformat(r['date']) for r in rows]
pe = [float(r['pe_ttm']) for r in rows]
pct = [float(r['percentile']) for r in rows]
with open(REPLAY / '000300' / 'changes.csv', encoding='utf-8') as fh:
    changes = [r for r in csv.DictReader(fh) if r['from']]
fig, (a1, a2) = plt.subplots(2, 1, figsize=(WIDTH, 3.6), sharex=True, gridspec_kw={'height_ratios': [1, 1.25], 'hspace': 0.12})
a1.plot(days, pe, color=DARK, lw=0.8)
a1.set_ylabel('滚动市盈率（倍）')
for y0, y1, shade in ((0, 30, PALE), (70, 90, PALE), (90, 100, LIGHT)):
    a2.axhspan(y0, y1, color=shade, lw=0)
a2.plot(days, pct, color=DARK, lw=0.8)
for c in changes:
    a2.axvline(date.fromisoformat(c['date']), color=MID, lw=0.4, ls=(0, (2, 2)))
for y in (30, 70, 90):
    a2.axhline(y, color=MID, lw=0.5)
for y, text in ((15, '偏低区'), (50, '中间区'), (80, '偏高区'), (95, '高位区')):
    a2.text(days[-1], y, ' ' + text, va='center', fontsize=7.5, color=DARK)
a2.set_ylim(0, 100)
a2.set_ylabel('近十年分位（%）')
a2.xaxis.set_major_locator(YearLocator(2))
a2.xaxis.set_major_formatter(DateFormatter('%Y'))
save(fig, '01_沪深300估值与分位')

# 2. 11 个指数的当前分位与已确认区间（2026-09-30）
names = [('000300', '沪深300'), ('000905', '中证500'), ('000016', '上证50'), ('000852', '中证1000'), ('399006', '创业板指'),
         ('000688', '科创50'), ('000922', '中证红利'), ('NDX', '纳斯达克100'), ('SPX', '标普500'), ('HSI', '恒生指数'), ('HSTECH', '恒生科技')]
latest = [(label, replay(code)[-1]) for code, label in names]
fig, ax = plt.subplots(figsize=(WIDTH, 3.3))
for x0, x1, shade in ((0, 30, PALE), (70, 90, PALE), (90, 100, LIGHT)):
    ax.axvspan(x0, x1, color=shade, lw=0)
ys = range(len(latest))[::-1]
values = [float(r['percentile']) for _, r in latest]
ax.barh(list(ys), values, height=0.55, color=MID)
for y, (label, r), v in zip(ys, latest, values):
    note = BANDS[r['band']] + ('（缓冲带内）' if r['band'] != r['raw_band'] else '')
    ax.text(v + 1.2, y, f'{v:.1f}  {note}', va='center', fontsize=7.5)
ax.set_yticks(list(ys), [label for label, _ in latest])
for x in (30, 70, 90):
    ax.axvline(x, color=DARK, lw=0.5)
ax.set_xlim(0, 100)
ax.set_xlabel('滚动市盈率近十年分位（%）；数字后为当前已确认的区间')
ax.tick_params(axis='y', length=0)
save(fig, '02_各指数当前分位')

# 3. 沪深300 各区间之后三年的年化收益与为正比例（逐日样本，含分红）
zones = ['偏低区', '中间区', '偏高区', '高位区']
ret, pos = [9.6, 6.3, 3.7, -5.1], [100.0, 86.7, 70.7, 16.8]
fig, (a1, a2) = plt.subplots(1, 2, figsize=(WIDTH, 2.3), gridspec_kw={'wspace': 0.35})
b = a1.bar(zones, ret, width=0.55, color=[DARK, MID, MID, LIGHT], edgecolor=DARK, lw=0.5)
a1.axhline(0, color=DARK, lw=0.6)
label_bars(a1, b, ret, lambda v: f'{v:.1f}%'.replace('-', '−'))
a1.set_ylabel('之后三年年化均值（%）')
a1.set_ylim(-8, 12)
a1.set_title('（a）年化收益均值', fontsize=9, y=-0.32)
b = a2.bar(zones, pos, width=0.55, color=[DARK, MID, MID, LIGHT], edgecolor=DARK, lw=0.5)
label_bars(a2, b, pos, lambda v: f'{v:.1f}%')
a2.set_ylabel('三年后收益为正的比例（%）')
a2.set_ylim(0, 115)
a2.set_title('（b）三年后为正的比例', fontsize=9, y=-0.32)
save(fig, '03_沪深300分区间收益')

# 4. 缓冲与连续确认的作用（沪深300，近十年）
fig, ax = plt.subplots(figsize=(WIDTH, 2.1))
groups, without, with_rule = ['改判次数', '45 天内又改回'], [31, 7], [17, 1]
x = range(len(groups))
b1 = ax.bar([i - 0.17 for i in x], without, width=0.32, color=LIGHT, edgecolor=DARK, lw=0.5, label='不设缓冲与确认')
b2 = ax.bar([i + 0.17 for i in x], with_rule, width=0.32, color=DARK, label='现行规则')
label_bars(ax, b1, without, str)
label_bars(ax, b2, with_rule, str)
ax.set_xticks(list(x), groups)
ax.set_ylabel('次数')
ax.set_ylim(0, 36)
ax.legend(fontsize=7.5, loc='upper right')
save(fig, '04_缓冲效果')

# 5. 五个指数各区间之后三年的年化收益（现行规则，月初取样；None 为无样本）
data = {'沪深300': [9.9, 5.9, 3.9, -5.3], '中证500': [6.3, -1.4, -6.0, None], '上证50': [9.9, 6.1, 2.8, -5.7],
        '中证1000': [3.6, -4.1, None, None], '中证红利': [9.7, 7.7, 2.9, None]}
fig, ax = plt.subplots(figsize=(WIDTH, 2.5))
shades = [DARK, MID, LIGHT, '#ffffff']
width = 0.19
for zi, zone in enumerate(zones):
    xs = [i + (zi - 1.5) * width for i in range(len(data))]
    vals = [v[zi] for v in data.values()]
    bars = ax.bar(xs, [v or 0 for v in vals], width=width, color=shades[zi], edgecolor=DARK, lw=0.5, label=zone)
    for bar, v in zip(bars, vals):
        if v is None:
            ax.text(bar.get_x() + width / 2, 0.4, '无', ha='center', fontsize=6.5, color=MID)
ax.axhline(0, color=DARK, lw=0.6)
ax.set_xticks(range(len(data)), list(data))
ax.set_ylabel('之后三年年化均值（%）')
ax.legend(ncol=4, fontsize=7.5, loc='upper center', bbox_to_anchor=(0.5, 1.14))
save(fig, '05_五指数分区间收益')

# 6. 蛋卷基金与中证官网数据得出的判断一致率
idx = ['沪深300', '中证500', '上证50', '中证1000', '中证红利', '科创50']
agree, weekly = [81.03, 64.03, 70.75, 70.36, 80.24, 20.31], [88.93, 69.17, 77.47, 82.21, 88.54, 15.63]
fig, ax = plt.subplots(figsize=(WIDTH, 2.3))
xs = range(len(idx))
b1 = ax.bar([i - 0.18 for i in xs], agree, width=0.34, color=DARK, label='判断一致率')
b2 = ax.bar([i + 0.18 for i in xs], weekly, width=0.34, color=LIGHT, edgecolor=DARK, lw=0.5, label='同为周采样时的一致率')
label_bars(ax, b1, agree, lambda v: f'{v:.0f}')
label_bars(ax, b2, weekly, lambda v: f'{v:.0f}')
ax.set_xticks(list(xs), idx)
ax.set_ylabel('一致率（%）')
ax.set_ylim(0, 105)
ax.legend(ncol=2, fontsize=7.5, loc='upper center', bbox_to_anchor=(0.5, 1.15))
save(fig, '06_数据来源一致率')

# 7. 工商银行基金代销保有规模（2025 年下半年，亿元）
kinds, amounts = ['非货币市场基金', '其中：权益类基金', '其中：股票型指数基金'], [5052, 3796, 454]
fig, ax = plt.subplots(figsize=(WIDTH, 1.8))
bars = ax.barh(range(3)[::-1], amounts, height=0.5, color=[DARK, MID, LIGHT], edgecolor=DARK, lw=0.5)
for bar, v in zip(bars, amounts):
    ax.text(v + 60, bar.get_y() + bar.get_height() / 2, f'{v:,}', va='center', fontsize=7.5)
ax.set_yticks(range(3)[::-1], kinds)
ax.set_xlim(0, 6000)
ax.set_xlabel('保有规模（亿元）')
ax.tick_params(axis='y', length=0)
save(fig, '07_工行基金保有规模')

print('\n'.join(sorted(p.name for p in OUT.glob('*.png'))))
