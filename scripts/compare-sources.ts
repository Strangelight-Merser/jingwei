// Run: node scripts/compare-sources.ts [--as-of YYYY-MM-DD]
// Reads public endpoints only; never reads or writes application state.
import {DANJUAN_PE_URL, PE_HISTORY_URL, parseDanjuanHistory, parsePeHistory, seedHistory, type ValuationPoint} from '../packages/backend/valuation-history.ts';
import {VALUATION_INDEXES, type IndexCode} from '../packages/backend/valuation-indexes.ts';
import {percentileSeries, ruleTimeline, VALUATION_RULE, type PercentilePoint} from '../packages/backend/valuation-rule.ts';

const args = process.argv.slice(2);
const asOf = args.length === 0 ? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) : args.length === 2 && args[0] === '--as-of' ? args[1] : '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) throw new Error('Usage: node scripts/compare-sources.ts [--as-of YYYY-MM-DD]');
const codes: IndexCode[] = ['000300', '000905', '000016', '000852', '000922', '000688'];
async function get(url: string) {
  const response = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 JingweiResearch/0.1'}, signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  if (new URL(response.url).hostname !== new URL(url).hostname) throw new Error('Unexpected source redirect');
  return response.json();
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Linear interpolation at (n - 1) * p.
function quantile(xs: number[], p: number) {
  const sorted = [...xs].sort((a, b) => a - b), pos = (sorted.length - 1) * p, lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
}
function correlation(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b);
  const cov = a.reduce((sum, x, i) => sum + (x - ma) * (b[i] - mb), 0);
  const variance = Math.sqrt(a.reduce((sum, x) => sum + (x - ma) ** 2, 0) * b.reduce((sum, x) => sum + (x - mb) ** 2, 0));
  return variance ? cov / variance : NaN;
}
function bands(series: PercentilePoint[], confirm: number) {
  const changes = ruleTimeline(series, undefined, confirm).changes;
  let at = 0;
  return new Map(series.map(p => {
    while (at + 1 < changes.length && changes[at + 1].date <= p.date) at++;
    return [p.date, changes[at].to];
  }));
}
function compareRules(official: ValuationPoint[], third: ValuationPoint[], confirm: number) {
  const a = percentileSeries(official), b = percentileSeries(third);
  const byDate = new Map(a.map(p => [p.date, p]));
  const matched = b.filter(p => byDate.has(p.date));
  if (!matched.length) throw new Error('No common dates with at least five years of history');
  const ab = bands(a, confirm), bb = bands(b, VALUATION_RULE.confirm_weeks);
  const differences = matched.map(p => p.exact - byDate.get(p.date)!.exact);
  return {n: matched.length, first: matched[0].date, last: matched.at(-1)!.date, bias: mean(differences), mae: mean(differences.map(Math.abs)), p95: quantile(differences.map(Math.abs), .95), agreement: 100 * matched.filter(p => ab.get(p.date) === bb.get(p.date)).length / matched.length};
}
const f = (x: number) => x.toFixed(2);
console.log(`公开接口实取；北京时间截止 ${asOf}；抓取时间 ${new Date().toISOString()}。`);
console.log('\n| 指数 | 同日样本（起止） | PE差均值 | PE差P05 / P50 / P95 | PE相关系数 | 规则周样本（起止） | 分位差均值 / 绝对差均值 / 绝对差P95（百分点） | v2判断一致率 | 同日周采样判断一致率 |');
console.log('|---|---|---:|---|---:|---|---|---:|---:|');
for (const index of codes) {
  const start = seedHistory(index).points[0].date;
  const query = new URLSearchParams({indexCode: index, startDate: start.replaceAll('-', ''), endDate: asOf.replaceAll('-', '')});
  const [csiRaw, djRaw] = await Promise.all([get(`${PE_HISTORY_URL}?${query}`), get(`${DANJUAN_PE_URL}SH${index}?day=all`)]);
  const official = parsePeHistory(csiRaw, asOf, index);
  // The all endpoint can include later rows when reproducing a historical cutoff.
  const rawThird = parseDanjuanHistory(djRaw, '9999-12-31').filter(p => p.date >= start && p.date <= asOf);
  // Match the application's one-reading-per-mainland-week convention: keep the latest date.
  const weeklyRows = new Map<string, ValuationPoint>();
  for (const p of rawThird) {
    const monday = new Date(`${p.date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    weeklyRows.set(monday.toISOString().slice(0, 10), p);
  }
  const third = [...weeklyRows.values()];
  const byDate = new Map(official.map(p => [p.date, p]));
  const paired = third.filter(p => byDate.has(p.date));
  console.error(`${index}: official=${official.length}, rawThird=${rawThird.length}, weeklyThird=${third.length}, matched=${paired.length}, unmatched=${third.length - paired.length}`);
  if (paired.length < 2) throw new Error(`${index}: insufficient same-date overlap`);
  const a = paired.map(p => byDate.get(p.date)!.pe_ttm), b = paired.map(p => p.pe_ttm), delta = b.map((x, i) => x - a[i]);
  const native = compareRules(official, third, VALUATION_RULE.confirm_days);
  // Keep exactly the same weekly dates and beginning for both histories to isolate value differences.
  const weekly = compareRules(paired.map(p => byDate.get(p.date)!), paired, VALUATION_RULE.confirm_weeks);
  console.log(`| ${VALUATION_INDEXES[index].name} | ${paired.length}（${paired[0].date}—${paired.at(-1)!.date}） | ${f(mean(delta))} | ${[.05,.5,.95].map(p => f(quantile(delta, p))).join(' / ')} | ${correlation(a, b).toFixed(4)} | ${native.n}（${native.first}—${native.last}） | ${[native.bias,native.mae,native.p95].map(f).join(' / ')} | ${f(native.agreement)}% | ${f(weekly.agreement)}%（${weekly.n}周） |`);
}
