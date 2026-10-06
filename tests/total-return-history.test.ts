import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseTotalReturnHistory, fetchTotalReturnHistory, OUTCOME_INDICES, type OutcomeIndex} from '../packages/backend/total-return-source.ts';
import {currentTotalReturnHistory, refreshTotalReturnHistory, seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {storageConfiguration} from '../packages/backend/storage.ts';

function row(index: OutcomeIndex, tradeDate: string, close = 100) {
  const info = OUTCOME_INDICES[index];
  return {indexCode: info.code, indexNameCnAll: info.name_cn, indexNameEnAll: info.name_en, tradeDate, close};
}
const body = (data: unknown[]) => ({code: '200', data});

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
