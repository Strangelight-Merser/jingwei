// Does the rule's main claim depend on its parameters? Re-runs the band rule under other windows,
// thresholds, confirmation lengths and buffers, written independently of the production rule, and
// reports change counts, quick reversals and the three-year return of each band from month-start
// samples (one start per month; the three-year holding periods still overlap).
// Run: node scripts/rule-sensitivity.ts  → prints a Markdown table; docs/规则稳健性.md holds the output.
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {RETURN_INDEX_CODES, VALUATION_INDEXES, type ReturnIndexCode as IndexCode} from '../packages/backend/valuation-indexes.ts';

type Variant = {label: string; window: number; edges: [number, number, number]; confirm: number; buffer: number};
const VARIANTS: Variant[] = [
  {label: '现行 v2', window: 10, edges: [30, 70, 90], confirm: 5, buffer: 5},
  {label: 'v1（无缓冲）', window: 10, edges: [30, 70, 90], confirm: 5, buffer: 0},
  {label: '缓冲 3 点', window: 10, edges: [30, 70, 90], confirm: 5, buffer: 3},
  {label: '缓冲 8 点', window: 10, edges: [30, 70, 90], confirm: 5, buffer: 8},
  {label: '确认 3 日', window: 10, edges: [30, 70, 90], confirm: 3, buffer: 5},
  {label: '确认 10 日', window: 10, edges: [30, 70, 90], confirm: 10, buffer: 5},
  {label: '阈值 25/75/90', window: 10, edges: [25, 75, 90], confirm: 5, buffer: 5},
  {label: '阈值 20/80/95', window: 10, edges: [20, 80, 95], confirm: 5, buffer: 5},
  {label: '窗口 8 年', window: 8, edges: [30, 70, 90], confirm: 5, buffer: 5},
  {label: '窗口 7 年', window: 7, edges: [30, 70, 90], confirm: 5, buffer: 5},
];
const BAND = ['偏低', '中间', '偏高', '高位'];

const yearsBefore = (date: string, years: number) => {const t = new Date(`${date}T00:00:00Z`); t.setUTCFullYear(t.getUTCFullYear() - years); return t.toISOString().slice(0, 10);};

function run(index: IndexCode, v: Variant) {
  const pts = seedHistory(index).points;
  const closes = new Map(seedTotalReturnHistory(index).points.map(p => [p.date, p.close]));
  const dates = [...closes.keys()].sort();
  let start = 0;
  let current: number | null = null, changes = 0, reversals = 0;
  let pending = null as {b: number; n: number} | null;
  const log: {date: string; from: number; to: number}[] = [];
  const confirmed = new Map<string, number>();
  for (let i = 0; i < pts.length; i++) {
    const d = pts[i].date;
    if (yearsBefore(d, 5) < pts[0].date) continue;
    const ws = yearsBefore(d, v.window);
    while (pts[start].date < ws) start++;
    let below = 0;
    for (let j = start; j <= i; j++) if (pts[j].pe_ttm <= pts[i].pe_ttm) below++;
    const pct = below / (i - start + 1) * 100;
    const e = [...v.edges];
    if (current !== null) {if (current >= 1) e[current - 1] -= v.buffer; if (current <= 2) e[current] += v.buffer;}
    const b = pct < e[0] ? 0 : pct < e[1] ? 1 : pct < e[2] ? 2 : 3;
    if (current === null) current = b;
    else if (b === current) pending = null;
    else {
      pending = pending?.b === b ? {b, n: pending.n + 1} : {b, n: 1};
      if (pending.n >= v.confirm) {
        const prev = log.at(-1);
        if (prev && b === prev.from && Date.parse(d) - Date.parse(prev.date) <= 45 * 86_400_000) reversals++;
        log.push({date: d, from: current, to: b});
        current = b; pending = null; changes++;
      }
    }
    confirmed.set(d, current);
  }
  const acc: number[][] = [[], [], [], []];
  let month = '';
  for (const d of dates) {
    if (d.slice(0, 7) === month) continue;
    month = d.slice(0, 7);
    const b = confirmed.get(d);
    if (b === undefined) continue;
    const end = dates.find(x => x >= yearsBefore(d, -3));
    if (!end) continue;
    acc[b].push((Math.pow(closes.get(end)! / closes.get(d)!, 1 / 3) - 1) * 100);
  }
  const means = acc.map(a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const present = means.filter((m): m is number => m !== null);
  const ordered = present.length >= 2 && present.every((m, i) => i === 0 || m < present[i - 1]);
  return {changes, reversals, means, counts: acc.map(a => a.length), ordered, full: present.length === BAND.length};
}

const fmt = (m: number | null, n: number) => m === null ? '—' : `${m.toFixed(1)}%（${n}）`;
for (const index of RETURN_INDEX_CODES) {
  console.log(`\n### ${VALUATION_INDEXES[index].name}\n`);
  console.log(`| 参数 | 改判次数 | 45 天内反转 | ${BAND.map(b => `${b}区 3 年年化（月初样本数）`).join(' | ')} | 有样本区间依次降低 | 四档齐全 |`);
  console.log(`|---|---|---|${BAND.map(() => '---').join('|')}|---|---|`);
  for (const v of VARIANTS) {
    const r = run(index, v);
    console.log(`| ${v.label} | ${r.changes} | ${r.reversals} | ${r.means.map((m, i) => fmt(m, r.counts[i])).join(' | ')} | ${r.ordered ? '是' : '否'} | ${r.full ? '是' : '否'} |`);
  }
}
