import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateRuleOutcomes, confirmedBandDays, ruleOutcomesForHistory, outcomeConclusion} from '../packages/backend/rule-outcomes.ts';
import {seedHistory, type ValuationPoint} from '../packages/backend/valuation-history.ts';
import {seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {OUTCOME_INDICES, type OutcomeIndex, type TotalReturnPoint} from '../packages/backend/total-return-source.ts';

type Band = 'low' | 'mid' | 'high' | 'extreme';
const bands: Band[] = ['low', 'mid', 'high', 'extreme'];
const shiftYear = (date: string, n: number) => {const d = new Date(date); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10);};

/** Independent plain replay: does not call the outcomes module or any production rule helper. */
function independent(points: ValuationPoint[], prices: TotalReturnPoint[]) {
  let confirmed: Band | null = null;
  const recent: Band[] = [];
  const daily: {date: string; band: Band}[] = [];
  for (const point of points) {
    if (shiftYear(point.date, -5) < points[0].date) continue;
    const cutoff = shiftYear(point.date, -10);
    const window = points.filter(p => p.date >= cutoff && p.date <= point.date);
    const pct = window.filter(p => p.pe_ttm <= point.pe_ttm).length / window.length * 100;
    // v2 buffer: the confirmed band's own edges sit 5 points further out.
    const e = [30, 70, 90], k = confirmed ? (['low', 'mid', 'high', 'extreme'] as Band[]).indexOf(confirmed) : -1;
    if (k >= 1) e[k - 1] -= 5;
    if (k >= 0 && k <= 2) e[k] += 5;
    const raw: Band = pct < e[0] ? 'low' : pct < e[1] ? 'mid' : pct < e[2] ? 'high' : 'extreme';
    recent.push(raw);
    if (recent.length > 5) recent.shift();
    if (confirmed === null || (raw !== confirmed && recent.length === 5 && recent.every(b => b === raw))) {confirmed = raw; recent.length = 0;}
    daily.push({date: point.date, band: confirmed});
  }
  const results = bands.map(band => ({band, horizons: [1, 3].map(years => {
    const samples: {date: string; value: number}[] = [];
    for (const day of daily.filter(d => d.band === band)) {
      const entry = prices.find(p => p.date === day.date);
      const exit = prices.find(p => p.date >= shiftYear(day.date, years));
      if (entry && exit) samples.push({date: day.date, value: (Math.pow(exit.close / entry.close, 1 / years) - 1) * 100});
    }
    const sorted = samples.map(s => s.value).sort((a, b) => a - b);
    const n = sorted.length;
    return {mean: n ? sorted.reduce((a, b) => a + b, 0) / n : null, median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null, positive_pct: n ? sorted.filter(v => v > 0).length / n * 100 : null, sample_days: n, first: samples[0]?.date ?? null, last: samples.at(-1)?.date ?? null};
  })}));
  return {daily, results};
}

for (const index of Object.keys(OUTCOME_INDICES) as OutcomeIndex[]) {
  test(`${index}: independent confirmed-day replay and both return distributions match`, () => {
    const history = seedHistory(index);
    assert.equal(history.index_code, index, 'the PE history must belong to the requested index');
    const pe = history.points;
    const closes = seedTotalReturnHistory(index).points;
    assert.equal(closes[0].date, pe[0].date);
    assert.equal(closes.at(-1)!.date, '2026-09-30');
    assert.equal(new Set(closes.map(p => p.date)).size, closes.length);
    assert.ok(closes.every((p, i) => Number.isFinite(p.close) && p.close > 0 && (i === 0 || closes[i - 1].date < p.date)));
    const replay = independent(pe, closes);
    assert.deepEqual(confirmedBandDays(pe), replay.daily);
    const actual = ruleOutcomesForHistory(pe, closes);
    for (const [i, row] of actual.bands.entries()) {
      for (const [h, key] of ['one_year', 'three_year'].entries()) {
        const got = row[key as 'one_year' | 'three_year'], expected = replay.results[i].horizons[h];
        for (const metric of ['mean', 'median', 'positive_pct'] as const) {
          if (expected[metric] === null) assert.equal(got[metric], null);
          else assert.ok(Math.abs(got[metric]! - expected[metric]!) < 1e-10, `${index}/${row.band}/${key}/${metric}`);
        }
        assert.equal(got.sample_days, expected.sample_days);
        assert.equal(got.first, expected.first);
        assert.equal(got.last, expected.last);
      }
    }
    assert.equal(actual.current_band, replay.daily.at(-1)!.band);
  });
}

test('CSI300 reproduces the published v2 one/three-year means and positive proportions', () => {
  const actual = ruleOutcomesForHistory(seedHistory('000300').points, seedTotalReturnHistory('000300').points);
  assert.deepEqual(actual.bands.map(b => Number(b.one_year.mean!.toFixed(1))), [7, 14.2, -1.8, -4.8]);
  assert.deepEqual(actual.bands.map(b => Number(b.three_year.mean!.toFixed(1))), [9.6, 6.3, 3.7, -5.1]);
  assert.deepEqual(actual.bands.map(b => Math.round(b.three_year.positive_pct!)), [100, 87, 71, 17]);
  assert.match(actual.conclusion, /1 年期没有同样排序/);
});

test('CSI500 has no confirmed extreme-band samples and cannot establish all four bands', () => {
  const actual = ruleOutcomesForHistory(seedHistory('000905').points, seedTotalReturnHistory('000905').points);
  assert.ok(actual.bands[1].three_year.mean! < 0);
  assert.ok(actual.bands[2].three_year.mean! < 0);
  assert.equal(actual.bands[2].three_year.positive_pct, 0);
  assert.equal(actual.bands[3].one_year.sample_days, 0);
  assert.equal(actual.bands[3].three_year.mean, null);
  assert.match(actual.conclusion, /暂不能判断/);
});

test('anniversary exit, missing entry, exact data-end boundary, positive-only and incomplete windows', () => {
  const rows = calculateRuleOutcomes([
    {date: '2020-01-01', band: 'low'}, {date: '2020-01-02', band: 'low'},
    {date: '2020-01-03', band: 'low'}, {date: '2022-01-04', band: 'high'},
    {date: '2023-01-01', band: 'extreme'},
  ], [
    {date: '2020-01-01', close: 100}, {date: '2020-01-02', close: 110},
    {date: '2021-01-04', close: 110}, {date: '2022-01-04', close: 105},
    {date: '2023-01-01', close: 133.1},
  ]);
  assert.equal(rows[0].one_year.sample_days, 2); // Jan 3 has no entry; both Jan 1/2 exit on Jan 4.
  assert.ok(Math.abs(rows[0].one_year.mean! - 5) < 1e-10);
  assert.ok(Math.abs(rows[0].one_year.median! - 5) < 1e-10);
  assert.equal(rows[0].one_year.positive_pct, 50); // Zero return is not positive.
  assert.equal(rows[0].three_year.sample_days, 1); // Jan 1 completes exactly; Jan 2 does not.
  assert.ok(Math.abs(rows[0].three_year.mean! - 10) < 1e-10);
  assert.equal(rows[2].one_year.sample_days, 0);
  assert.equal(rows[3].three_year.mean, null);
  assert.match(outcomeConclusion(rows), /暂不能判断/);
});

test('leap-day anniversaries use the same calendar rollover in production and independent replay', () => {
  const rows = calculateRuleOutcomes([{date: '2020-02-29', band: 'low'}], [{date: '2020-02-29', close: 100}, {date: '2021-02-28', close: 90}, {date: '2021-03-01', close: 120}]);
  assert.ok(Math.abs(rows[0].one_year.mean! - 20) < 1e-10);
});

test('a result outside the expected order is described without changing thresholds', () => {
  const rows = calculateRuleOutcomes(bands.map((band, i) => ({date: `2020-01-0${i + 1}`, band})), [
    ...bands.map((_, i) => ({date: `2020-01-0${i + 1}`, close: 100})),
    ...[110, 130, 105, 120].map((close, i) => ({date: `2023-01-0${i + 1}`, close})),
  ]);
  assert.match(outcomeConclusion(rows), /不支持四个区间完整的收益排序/);
});
