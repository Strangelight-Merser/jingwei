import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyErp, erpPercentiles, erpGroup, erpForHistory, seedBondYields} from '../packages/backend/erp.ts';
import {BOND_YIELD_SOURCE} from '../packages/backend/government-bond-yield-seed.ts';
import {seedHistory, type ValuationPoint} from '../packages/backend/valuation-history.ts';
import {seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {INDEX_CODES} from '../packages/backend/valuation-indexes.ts';
import type {ValuationBand} from '../packages/backend/valuation-rule.ts';
import type {TotalReturnPoint} from '../packages/backend/total-return-source.ts';

const shift = (date: string, years: number) => {const d = new Date(date); d.setUTCFullYear(d.getUTCFullYear() + years); return d.toISOString().slice(0, 10);};
const bands: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];
// Independent replay uses plain scans; no production percentile, grouping, PE or return helpers.
function independent(pe: ValuationPoint[], prices: TotalReturnPoint[]) {
  const bonds = seedBondYields();
  const bondMap = new Map(bonds.map(p => [p.date, p.yield_pct / 100]));
  const daily = pe.filter(p => bondMap.has(p.date)).map(p => ({date: p.date, pe_ttm: p.pe_ttm, bond_yield_pct: bondMap.get(p.date)! * 100, erp_pct: (1 / p.pe_ttm - bondMap.get(p.date)!) * 100}));
  const ranks = daily.filter(p => shift(p.date, -5) >= daily[0].date).map(p => {
    const window = daily.filter(day => day.date >= shift(p.date, -10) && day.date <= p.date);
    const exact = window.filter(day => day.erp_pct <= p.erp_pct).length / window.length * 100;
    return {...p, exact, percentile: Math.round(exact * 10) / 10, window_start: window[0].date, full_window: shift(p.date, -10) >= daily[0].date};
  });
  const group = (pct: number): ValuationBand => pct < 10 ? 'extreme' : pct < 30 ? 'high' : pct < 70 ? 'mid' : 'low';
  const confirmed = new Map<string, ValuationBand>();
  let current: ValuationBand | null = null;
  const recent: ValuationBand[] = [];
  for (const day of pe) {
    if (shift(day.date, -5) < pe[0].date) continue;
    const window = pe.filter(p => p.date >= shift(day.date, -10) && p.date <= day.date);
    const pct = window.filter(p => p.pe_ttm <= day.pe_ttm).length / window.length * 100;
    const e = [30, 70, 90], k = current ? bands.indexOf(current) : -1;
    if (k >= 1) e[k - 1] -= 5;
    if (k >= 0 && k <= 2) e[k] += 5;
    const raw: ValuationBand = bands[pct < e[0] ? 0 : pct < e[1] ? 1 : pct < e[2] ? 2 : 3];
    recent.push(raw); if (recent.length > 5) recent.shift();
    if (!current || raw !== current && recent.length === 5 && recent.every(band => band === raw)) {current = raw; recent.length = 0;}
    confirmed.set(day.date, current);
  }
  const compared = ranks.filter(p => confirmed.has(p.date));
  const byBand = bands.map(band => {
    const days = compared.filter(p => confirmed.get(p.date) === band);
    const matching_days = days.filter(p => group(p.exact) === band).length;
    return {days: days.length, matching_days, matching_pct: days.length ? matching_days / days.length * 100 : null};
  });
  const entryPrices = new Map(prices.map(p => [p.date, p.close]));
  const rows = bands.map(band => [1, 3].map(years => {
    const samples = ranks.filter(p => group(p.exact) === band).flatMap(day => {
      const entry = entryPrices.get(day.date);
      const target = shift(day.date, years);
      const exit = prices.find(p => p.date >= target && p.date <= compared.at(-1)!.date);
      return entry !== undefined && exit ? [{date: day.date, value: (Math.pow(exit.close / entry, 1 / years) - 1) * 100}] : [];
    });
    const values = samples.map(p => p.value).sort((a, b) => a - b);
    const n = values.length;
    return {mean: n ? values.reduce((a, b) => a + b, 0) / n : null, median: n ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2 : null, positive_pct: n ? values.filter(v => v > 0).length / n * 100 : null, sample_days: n, first: samples[0]?.date ?? null, last: samples.at(-1)?.date ?? null};
  }));
  return {daily, ranks, confirmed, byBand, rows};
}

test('official bond seed covers every requested year, is ordered and has only unique finite yields', () => {
  const rows = seedBondYields();
  assert.match(BOND_YIELD_SOURCE.source_url, /^https:\/\/yield\.chinabond\.com\.cn\//);
  assert.equal(BOND_YIELD_SOURCE.fetched_at.slice(0, 10), '2026-10-06');
  assert.equal(rows.length, 3936);
  assert.equal(rows[0].date, '2011-01-04');
  assert.equal(rows.at(-1)!.date, '2026-09-30');
  assert.equal(rows.at(-1)!.yield_pct, 1.68);
  assert.equal(new Set(rows.map(p => p.date)).size, rows.length);
  assert.ok(rows.every((p, i) => p.yield_pct > 0 && Number.isFinite(p.yield_pct) && (!i || rows[i - 1].date < p.date)));
  for (let year = 2011; year <= 2026; year++) assert.ok(rows.filter(p => p.date.startsWith(String(year))).length >= (year === 2026 ? 160 : 220));
});

for (const index of INDEX_CODES) test(`${index}: independently recomputed ERP, rolling ranks, agreement and full-return distributions`, () => {
  const pe = seedHistory(index).points, closes = seedTotalReturnHistory(index).points;
  const actual = erpForHistory(pe, seedBondYields(), closes)!;
  const expected = independent(pe, closes);
  assert.equal(actual.as_of, '2026-09-30');
  assert.equal(actual.daily.length, expected.daily.length);
  for (const [i, p] of actual.daily.entries()) {
    assert.equal(p.date, expected.daily[i].date);
    assert.ok(Math.abs(p.erp_pct - expected.daily[i].erp_pct) < 1e-12);
  }
  assert.equal(actual.percentiles.length, expected.ranks.length);
  for (const [i, p] of actual.percentiles.entries()) {
    const other = expected.ranks[i];
    for (const key of ['date', 'exact', 'percentile', 'window_start', 'full_window'] as const) assert.equal(p[key], other[key], `${index}/${p.date}/${key}`);
  }
  assert.equal(actual.current.pe_band, expected.confirmed.get(actual.as_of));
  assert.equal(actual.current.consistent, actual.current.pe_band === actual.current.erp_group);
  actual.consistency.by_pe_band.forEach((row, i) => {for (const key of ['days', 'matching_days', 'matching_pct'] as const) assert.equal(row[key], expected.byBand[i][key]);});
  assert.equal(actual.consistency.compared_days, expected.byBand.reduce((sum, row) => sum + row.days, 0));
  assert.equal(actual.consistency.matching_days, expected.byBand.reduce((sum, row) => sum + row.matching_days, 0));
  assert.equal(actual.consistency.matching_pct, actual.consistency.matching_days / actual.consistency.compared_days * 100);
  actual.outcomes.forEach((row, i) => (['one_year', 'three_year'] as const).forEach((key, h) => {
    const expectedStats = expected.rows[i][h];
    for (const metric of ['mean', 'median', 'positive_pct'] as const) {
      if (expectedStats[metric] === null) assert.equal(row[key][metric], null);
      else assert.ok(Math.abs(row[key][metric]! - expectedStats[metric]!) < 1e-10, `${index}/${key}/${metric}`);
    }
    for (const metric of ['sample_days', 'first', 'last'] as const) assert.equal(row[key][metric], expectedStats[metric]);
  }));
});

test('units, exact-date join, missing-yield exclusion, negative ERP and group boundaries', () => {
  const joined = dailyErp([{date: '2020-01-01', pe_ttm: 20}, {date: '2020-01-02', pe_ttm: 100}, {date: '2020-01-03', pe_ttm: 10}], [{date: '2020-01-01', yield_pct: 3}, {date: '2020-01-02', yield_pct: 3}]);
  assert.deepEqual(joined.map(p => p.erp_pct), [2, -2]);
  assert.deepEqual([0, 9.999, 10, 29.999, 30, 69.999, 70, 100].map(erpGroup), ['extreme', 'extreme', 'high', 'high', 'mid', 'mid', 'low', 'low']);
  assert.deepEqual(erpPercentiles([]), []);
  assert.equal(erpForHistory([], [], []), null);
});

test('inclusive ties, five-year minimum and ten-year cutoff use only past observations', () => {
  const raw = [{date: '2010-01-01', erp_pct: 2}, {date: '2014-12-31', erp_pct: 4}, {date: '2015-01-01', erp_pct: 2}, {date: '2020-01-02', erp_pct: -1}, {date: '2021-01-01', erp_pct: 2}].map(p => ({...p, pe_ttm: 20, bond_yield_pct: 3}));
  const ranks = erpPercentiles(raw);
  assert.deepEqual(ranks.map(p => p.date), ['2015-01-01', '2020-01-02', '2021-01-01']);
  assert.equal(ranks[0].exact, 2 / 3 * 100);
  assert.equal(ranks[0].full_window, false);
  assert.equal(ranks[1].window_start, '2014-12-31');
  assert.equal(ranks[1].exact, 1 / 3 * 100);
  assert.equal(ranks[2].exact, 3 / 4 * 100);
  assert.equal(ranks[2].full_window, true);
  assert.deepEqual(erpPercentiles(raw.slice(0, -1)), ranks.slice(0, -1));
});

test('anniversary exits and return data appended after the ERP evidence date cannot shorten samples', () => {
  const pe = ['2010-01-01', '2015-01-01', '2016-01-01', '2017-01-01'].map(date => ({date, pe_ttm: 20}));
  const bonds = pe.map(p => ({date: p.date, yield_pct: 3}));
  const prices = [{date: '2015-01-01', close: 100}, {date: '2016-01-04', close: 110}, {date: '2018-01-01', close: 133.1}];
  const result = erpForHistory(pe, bonds, prices)!;
  assert.equal(result.outcomes[0].one_year.sample_days, 1);
  assert.ok(Math.abs(result.outcomes[0].one_year.mean! - 10) < 1e-10);
  assert.equal(result.outcomes[0].three_year.sample_days, 0);
  assert.equal(result.outcomes[0].three_year.mean, null);
  assert.match(result.outcome_conclusion, /没有完整/);
});
