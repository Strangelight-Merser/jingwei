import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {bandOf, evaluateValuationRule, percentileSeries} from '../packages/backend/valuation-rule.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {replayRule, replaySeed, type ReplayResult} from '../scripts/replay-rule.ts';

const tolerance = 1e-9;
function near(actual: number, expected: number, field: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${field}: replay=${actual}, API=${expected}`);
}

function matchesApi(replay: ReplayResult, actual: NonNullable<ReturnType<typeof evaluateValuationRule>>) {
  // The API lists newest first; the replay exports the order of calculation.
  const expectedChanges = actual.changes.toReversed();
  assert.equal(replay.changes.length, expectedChanges.length, 'change record count');
  for (let i = 0; i < expectedChanges.length; i++) {
    const expected = expectedChanges[i];
    const row = replay.changes[i];
    const context = `change[${i}] ${expected.date}`;
    assert.equal(row.date, expected.date, `${context} confirmation date`);
    assert.equal(row.from, expected.from, `${context} previous band`);
    assert.equal(row.to, expected.to, `${context} new band`);
    assert.equal(row.full_window, expected.full_window, `${context} full window`);
    near(row.pe_ttm, expected.pe_ttm, `${context} PE`);
    near(row.percentile, expected.percentile, `${context} percentile`);
  }
  assert.ok(replay.current);
  assert.ok(replay.current.percentile !== null);
  assert.equal(replay.daily.length, actual.rows, 'data row count');
  assert.equal(replay.daily[0].date, actual.history_first, 'first data date');
  assert.equal(replay.current.date, actual.as_of, 'current date');
  assert.equal(replay.current.raw_band, actual.raw_band, 'current raw band');
  assert.equal(replay.current.band, actual.band, 'current confirmed band');
  assert.equal(replay.current.window_start, actual.window_start, 'current window start');
  near(replay.current.pe_ttm, actual.pe_ttm, 'current PE');
  near(replay.current.percentile, actual.percentile, 'current percentile');
}

test('独立规则复算：改判列表、当前分位、每日分位和区间逐项一致（容差 1e-9）', () => {
  const points = seedHistory().points;
  assert.deepEqual(replaySeed(), points, 'independent seed parser');
  const replay = replayRule();
  const actual = evaluateValuationRule(points);
  assert.ok(actual);
  matchesApi(replay, actual);

  const computedDays = replay.daily.filter(row => row.percentile !== null);
  const expectedDays = percentileSeries(points);
  const expectedChanges = actual.changes.toReversed();
  let changeIndex = 0;
  let confirmed = expectedChanges[0].to;
  assert.equal(computedDays.length, expectedDays.length);
  for (let i = 0; i < expectedDays.length; i++) {
    const row = computedDays[i];
    const expected = expectedDays[i];
    assert.equal(row.date, expected.date, `daily[${i}] date`);
    assert.equal(row.window_start, expected.window_start, `${row.date} window start`);
    assert.equal(row.full_window, expected.full_window, `${row.date} full window`);
    assert.equal(row.raw_band, bandOf(expected.exact), `${row.date} unrounded raw band`);
    if (expectedChanges[changeIndex]?.date === row.date) confirmed = expectedChanges[changeIndex++].to;
    assert.equal(row.band, confirmed, `${row.date} confirmed band`);
    near(row.pe_ttm, expected.pe_ttm, `${row.date} PE`);
    near(row.percentile!, expected.percentile, `${row.date} percentile`);
    near(row.exact!, expected.exact, `${row.date} exact percentile`);
  }
  assert.equal(changeIndex, expectedChanges.length, 'all changes appear in daily timeline');
  const roundingEdges = expectedDays.filter(row => bandOf(row.exact) !== bandOf(row.percentile));
  assert.equal(roundingEdges.length, 4, 'four real-data days affected by rounding before banding');
  assert.ok(roundingEdges.some(row => row.date === '2018-12-07'));
});

test('复算 CLI：三份导出完整、warm-up 留空、每日原始分档与确认区间分开', async () => {
  const root = new URL('../', import.meta.url);
  const output = execFileSync(process.execPath, ['scripts/replay-rule.ts'], {cwd: fileURLToPath(root), encoding: 'utf8'});
  const replay = replayRule();
  const destination = new URL('exports/rule-replay/', root);
  const json = JSON.parse(await readFile(new URL('changes.json', destination), 'utf8'));
  assert.deepEqual(json, replay.changes);
  const changes = (await readFile(new URL('changes.csv', destination), 'utf8')).trimEnd().split('\n');
  assert.equal(changes.shift(), 'date,from,to,pe_ttm,percentile,full_window');
  assert.deepEqual(changes, replay.changes.map(row => [row.date, row.from ?? '', row.to, row.pe_ttm, row.percentile, row.full_window].join(',')));
  const daily = (await readFile(new URL('daily.csv', destination), 'utf8')).trimEnd().split('\n');
  assert.equal(daily.shift(), 'date,pe_ttm,percentile,exact,raw_band,band,window_start,full_window');
  assert.deepEqual(daily, replay.daily.map(row => [row.date, row.pe_ttm, row.percentile ?? '', row.exact ?? '', row.raw_band ?? '', row.band ?? '', row.window_start ?? '', row.full_window].join(',')));
  assert.match(output, /数据日数：3788/);
  assert.match(output, /数据起止：2011-06-28 至 2026-09-30/);
  assert.match(output, /改判次数：31（导出 32 条记录，含首次初始化）/);
  assert.match(output, /中间区（mid），第 48\.8 百分位/);
});

test('当前 GET /publication/judgment 与离线种子复算一致（隔离存储，无取数）', async () => {
  const {startApi} = await import('../apps/api/src/main.ts');
  const app = await startApi({port: 0, mode: 'read_only', restoreSavedKey: false, valuationRefresh: null});
  try {
    const response = await app.inject({method: 'GET', url: '/publication/judgment'});
    assert.equal(response.statusCode, 200);
    matchesApi(replayRule(), response.json<NonNullable<ReturnType<typeof evaluateValuationRule>>>());
  } finally {
    await app.close();
  }
});
