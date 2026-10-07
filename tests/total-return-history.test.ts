import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseTotalReturnHistory, fetchTotalReturnHistory, OUTCOME_INDICES, type OutcomeIndex} from '../packages/backend/total-return-source.ts';
import {currentTotalReturnHistory, refreshTotalReturnHistory, seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {storageConfiguration} from '../packages/backend/storage.ts';
import {RETURN_INDEX_CODES, hasReturns, INDEX_CODES} from '../packages/backend/valuation-indexes.ts';

function row(index: OutcomeIndex, tradeDate: string, close = 100) {
  const info = OUTCOME_INDICES[index];
  return {indexCode: info.code, indexNameCnAll: info.name_cn, indexNameEnAll: info.name_en, tradeDate, close};
}
const body = (data: unknown[]) => ({code: '200', data});

test('return coverage includes exactly the five supported total-return series', () => {
  assert.deepEqual(RETURN_INDEX_CODES, ['000300', '000905', '000016', '000852', '000922']);
  assert.deepEqual(Object.keys(OUTCOME_INDICES).sort(), [...RETURN_INDEX_CODES].sort());
  for (const index of INDEX_CODES) assert.equal(hasReturns(index), Object.hasOwn(OUTCOME_INDICES, index));
});

test('CSI1000 and CSI Dividend validate the official full names and reject price or other return series', () => {
  const identities = [
    {index: '000852', code: 'H00852', name_cn: '中证1000全收益指数', name_en: 'CSI 1000 Total Return Index', close: 8463.63},
    {index: '000922', code: 'H00922', name_cn: '中证红利全收益指数', name_en: 'CSI Dividend Total Return Index', close: 11935.19},
  ] as const;
  for (const info of identities) {
    const official = {indexCode: info.code, indexNameCnAll: info.name_cn, indexNameEnAll: info.name_en, tradeDate: '20260930', close: info.close};
    const parse = (data: unknown[]) => parseTotalReturnHistory(body(data), info.index, '2026-09-30', '2026-09-30');
    assert.deepEqual(parse([official]), [{date: '2026-09-30', close: info.close}]);
    for (const patch of [{indexCode: info.index}, {indexNameCnAll: info.name_cn.replace('全收益', '')}, {indexNameEnAll: info.name_en.replace('Total Return ', '')}]) {
      assert.throws(() => parse([{...official, ...patch}]), /identity_mismatch/);
    }
    for (const other of RETURN_INDEX_CODES.filter(code => code !== info.index)) assert.throws(() => parse([row(other, '20260930')]), /identity_mismatch/);
    const seed = seedTotalReturnHistory(info.index);
    assert.equal(seed.total_return_code, info.code);
    assert.deepEqual(seed.points.at(-1), {date: '2026-09-30', close: info.close});
    assert.equal(seed.points[0].date, info.index === '000852' ? '2014-09-25' : '2011-06-28');
  }
});

test('official parser validates total-return identity, real dates, bounds and positive closes', () => {
  const valid = row('000300', '20260930');
  const parse = (raw: unknown) => parseTotalReturnHistory(raw, '000300', '2026-09-01', '2026-09-30');
  assert.deepEqual(parse(body([valid])), [{date: '2026-09-30', close: 100}]);
  for (const bad of [null, {code: '500', data: []}, {code: '200', data: {}}]) assert.throws(() => parse(bad), /unsuccessful/);
  for (const patch of [{indexCode: '000300'}, {indexNameCnAll: '沪深300指数'}, {indexNameEnAll: 'CSI 300 Index'}]) assert.throws(() => parse(body([{...valid, ...patch}])), /identity_mismatch/);
  for (const tradeDate of ['20260230', '20261301', '20260931', '2026-09-30', null]) assert.throws(() => parse(body([{...valid, tradeDate}])), /date_invalid/);
  for (const tradeDate of ['20260831', '20261001']) assert.throws(() => parse(body([{...valid, tradeDate}])), /outside_request/);
  for (const close of [0, -1, null, '100', NaN, Infinity]) assert.throws(() => parse(body([{...valid, close}])), /close_invalid/);
  assert.throws(() => parse(body([valid, valid])), /duplicate_date/);
});

test('requests are split at calendar-year boundaries and every index has its own identity', async () => {
  for (const index of Object.keys(OUTCOME_INDICES) as OutcomeIndex[]) {
    const requests: URL[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = new URL(String(input)); requests.push(url);
      assert.equal(url.searchParams.get('indexCode'), OUTCOME_INDICES[index].code);
      return new Response(JSON.stringify(body([row(index, url.searchParams.get('endDate')!)])));
    }) as typeof fetch;
    const points = await fetchTotalReturnHistory(index, '2025-12-01', '2026-09-30', fetcher);
    assert.deepEqual(requests.map(u => [u.searchParams.get('startDate'), u.searchParams.get('endDate')]), [['20251201', '20251231'], ['20260101', '20260930']]);
    assert.deepEqual(points.map(p => p.date), ['2025-12-31', '2026-09-30']);
  }
  await assert.rejects(fetchTotalReturnHistory('000300', '2026-01-01', '2026-09-30', (async () => new Response('', {status: 503})) as typeof fetch), /http_503/);
});

test('incremental check persists recent revisions and new rows; a failed fetch preserves last data', async () => {
  const index = '000905', seed = seedTotalReturnHistory(index);
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('startDate'), '20260831');
    return new Response(JSON.stringify(body([row(index, '20260930', 999), row(index, '20261009', 1001)])));
  }) as typeof fetch;
  const after = await refreshTotalReturnHistory(index, {now: new Date('2026-10-09T10:00:00Z'), fetcher});
  assert.equal(after.points.length, seed.points.length + 1);
  assert.equal(after.points.find(p => p.date === '2026-09-30')!.close, 999);
  const file = join(storageConfiguration().dataDir, `${index}-total-return.json`);
  const saved = await readFile(file, 'utf8');
  assert.ok(JSON.parse(saved).points.length < 40);
  assert.deepEqual(await currentTotalReturnHistory(index), after);
  await assert.rejects(refreshTotalReturnHistory(index, {fetcher: (async () => {throw new Error('network_failed');}) as typeof fetch}), /network_failed/);
  assert.equal(await readFile(file, 'utf8'), saved);
  assert.equal((await currentTotalReturnHistory('000300')).points.at(-1)!.date, '2026-09-30');
});
