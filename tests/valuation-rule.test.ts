import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bandOf, percentileSeries, ruleTimeline, boundaryPe, evaluateValuationRule, VALUATION_RULE} from '../packages/backend/valuation-rule.ts';
import {parsePeHistory, mergePeHistory, seedHistory, refreshPeHistory} from '../packages/backend/valuation-history.ts';
import type {ValuationPoint} from '../packages/backend/valuation-history.ts';

/** One point per weekday from `start`, PE given by `pe(i)`. */
function series(start: string, days: number, pe: (i: number) => number): ValuationPoint[] {
  const out: ValuationPoint[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; out.length < days; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({date: d.toISOString().slice(0, 10), pe_ttm: pe(i++)});
  }
  return out;
}

test('分档边界：30、70、90 归入更高一档', () => {
  assert.equal(bandOf(29.9), 'low');
  assert.equal(bandOf(30), 'mid');
  assert.equal(bandOf(69.9), 'mid');
  assert.equal(bandOf(70), 'high');
  assert.equal(bandOf(90), 'extreme');
});

test('不足五年数据不出分位；分位按窗口内不高于当日的比例计算', () => {
  const pts = series('2010-01-01', 260 * 6, i => 10 + (i % 100) / 10);
  const s = percentileSeries(pts);
  assert.ok(s[0].date >= '2015-01-01', '五年之后才开始');
  assert.equal(s[0].full_window, false);
  const p = s.at(-1)!;
  const window = pts.filter(x => x.date >= p.window_start && x.date <= p.date);
  const expected = Math.round(window.filter(x => x.pe_ttm <= p.pe_ttm).length / window.length * 1000) / 10;
  assert.equal(p.percentile, expected);
});

test('新分档须连续确认才改判，中途回到原档则重新计数', () => {
  const pts = (bands: number[]) => bands.map((pct, i) => ({date: `2020-01-${String(i + 1).padStart(2, '0')}`, pe_ttm: 10, percentile: pct, exact: pct, window_start: '2010-01-01', full_window: true}));
  const flicker = ruleTimeline(pts([50, 75, 75, 75, 75, 50, 75, 75]));
  assert.equal(flicker.confirmed, 'mid');
  assert.equal(flicker.changes.length, 1);
  assert.deepEqual(flicker.pending, {band: 'high', days: 2});
  const held = ruleTimeline(pts([50, 75, 75, 75, 75, 75]));
  assert.equal(held.confirmed, 'high');
  assert.equal(held.changes.at(-1)!.date, '2020-01-06');
  assert.equal(VALUATION_RULE.confirm_days, 5);
});

test('分档按未取整分位：显示为30.0的29.98仍属偏低区', () => {
  const day = (exact: number, i: number) => ({date: `2020-01-${String(i + 1).padStart(2, '0')}`, pe_ttm: 10, percentile: Math.round(exact * 10) / 10, exact, window_start: '2010-01-01', full_window: true});
  const t = ruleTimeline([50, 29.98, 29.98, 29.98, 29.98, 29.98].map(day));
  assert.equal(t.confirmed, 'low');
  // 真实历史中2018-12-07等4个交易日取整后恰为边界值，改判记录不受影响
  const s = percentileSeries(seedHistory().points);
  const edge = s.filter(p => p.percentile === 30 && p.exact < 30).map(p => p.date);
  assert.ok(edge.includes('2018-12-07'));
  assert.ok(s.every(p => Math.abs(p.percentile - p.exact) <= 0.05 + 1e-9));
});

test('边界市盈率对应窗口内的分位值', () => {
  const pts = series('2015-01-01', 260 * 11, i => 10 + (i % 1000) / 100);
  const last = pts.at(-1)!.date;
  const b = boundaryPe(pts, last);
  const window = pts.filter(p => p.date >= b.window_start!).map(p => p.pe_ttm);
  const share = (v: number) => window.filter(x => x <= v).length / window.length * 100;
  assert.ok(share(b.low) >= 30 && share(b.low) - 30 < 1);
  assert.ok(share(b.high) >= 70 && share(b.high) - 70 < 1);
});

test('官方真实历史：当前判断与上次改判可复算', () => {
  const r = evaluateValuationRule(seedHistory().points, {live_from: '2026-10-06'})!;
  assert.equal(r.as_of, '2026-09-30');
  assert.equal(r.band, 'mid');
  assert.equal(r.judgment.new_money.action, '持');
  assert.equal(r.last_change.date, '2026-09-07');
  assert.equal(r.last_change.from, 'high');
  assert.ok(r.changes.every(c => c.origin === 'recomputed'));
  assert.ok(r.changes.length > 10, '十年内判断确实发生过变化');
});

test('软件运行后才发生的改判标为实际，此前为回算', () => {
  // 1870 days: the drop starts at index 1860, where the repeating base sits mid-band (60th of each 100).
  const pts = series('2010-01-01', 1870, i => (i < 1860 ? 10 + (i % 100) / 10 : 5));
  const r = evaluateValuationRule(pts, {live_from: pts.at(-10)!.date})!;
  assert.equal(r.band, 'low');
  assert.equal(r.changes[0].origin, 'live');
});

test('官方响应：身份、日期和数值逐项校验', () => {
  const row = (d: string, v: unknown, name = '沪深300') => ({tradeDate: d, indexName: name, indexNameEn: 'CSI 300', peg: v});
  assert.deepEqual(parsePeHistory({code: '200', data: [row('20260930', 13.15), row('20260929', 13.2)]}, '2026-10-01'),
    [{date: '2026-09-29', pe_ttm: 13.2}, {date: '2026-09-30', pe_ttm: 13.15}]);
  assert.throws(() => parsePeHistory({code: '500', data: []}, '2026-10-01'), /unsuccessful/);
  assert.throws(() => parsePeHistory({code: '200', data: [row('20260930', 13, '中证500')]}, '2026-10-01'), /identity/);
  assert.throws(() => parsePeHistory({code: '200', data: [row('20261002', 13)]}, '2026-10-01'), /future/);
  assert.throws(() => parsePeHistory({code: '200', data: [row('20260930', 0)]}, '2026-10-01'), /value/);
  assert.throws(() => parsePeHistory({code: '200', data: [row('20260930', 13), row('20260930', 13)]}, '2026-10-01'), /duplicate/);
});

test('增量更新：同日以新值为准，失败不改动原历史', async () => {
  assert.deepEqual(mergePeHistory([{date: '2026-09-29', pe_ttm: 13}, {date: '2026-09-30', pe_ttm: 13.1}], [{date: '2026-09-30', pe_ttm: 13.15}, {date: '2026-10-08', pe_ttm: 13.3}]),
    [{date: '2026-09-29', pe_ttm: 13}, {date: '2026-09-30', pe_ttm: 13.15}, {date: '2026-10-08', pe_ttm: 13.3}]);
  const base = seedHistory();
  const ok = (async () => new Response(JSON.stringify({code: '200', data: [{tradeDate: '20261009', indexName: '沪深300', indexNameEn: 'CSI 300', peg: 13.4}]}))) as typeof fetch;
  const next = await refreshPeHistory(base, {now: new Date('2026-10-09T08:00:00Z'), fetcher: ok});
  assert.equal(next.points.at(-1)!.date, '2026-10-09');
  assert.equal(next.points.length, base.points.length + 1);
  const failing = (async () => new Response('', {status: 502})) as typeof fetch;
  await assert.rejects(refreshPeHistory(base, {fetcher: failing}), /http_502/);
  assert.equal(base.checked_at, null);
});
