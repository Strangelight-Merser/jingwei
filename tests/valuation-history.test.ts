import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedHistory, refreshPeHistory} from '../packages/backend/valuation-history.ts';
import {currentValuationHistory, refreshValuationState} from '../packages/backend/judgment.ts';
import {readState} from '../packages/backend/storage.ts';
import {INDEX_CODES, sourceOf, VALUATION_INDEXES} from '../packages/backend/valuation-indexes.ts';

const week = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};

test('weekly refresh appends one observation per new mainland week without changing seeded history', async () => {
  for (const index of INDEX_CODES.filter(i => sourceOf(i) === 'danjuan')) {
    const base = seedHistory(index);
    const originalWeeks = new Set(base.points.map(p => week(p.date)));
    const fetcher = (async () => new Response(JSON.stringify({result_code: 0, data: {index_eva_pe_growths: [
      {ts: Date.parse('2026-10-02T00:00:00+08:00'), pe: 99}, // same week as seed's September 30
      {ts: Date.parse('2026-10-08T23:30:00Z'), pe: 31}, // October 9 in Beijing
      {ts: Date.parse('2026-10-10T00:00:00+08:00'), pe: 32}, // same new week
    ]}}))) as typeof fetch;
    const options = {fetcher, now: new Date('2026-10-10T02:00:00Z')};
    const after = await refreshPeHistory(base, options);
    assert.equal(after.points.length, base.points.length + 1);
    assert.deepEqual(after.points.at(-1), {date: '2026-10-10', pe_ttm: 32});
    assert.deepEqual(after.points.slice(0, -1), base.points);
    assert.equal(new Set(after.points.map(p => week(p.date))).size, originalWeeks.size + 1);
    assert.deepEqual((await refreshPeHistory(after, options)).points, after.points);
  }
});

test('one failed valuation source preserves its dates while all other sources persist', async () => {
  const before = await readState();
  const failed = currentValuationHistory(before, 'NDX');
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/NDX')) return new Response('', {status: 503});
    if (url.hostname === 'danjuanfunds.com') return new Response(JSON.stringify({result_code: 0, data: {index_eva_pe_growths: [{ts: Date.parse('2026-10-07T00:00:00+08:00'), pe: 20}]}}));
    const index = url.searchParams.get('indexCode')! as keyof typeof VALUATION_INDEXES;
    const identity = VALUATION_INDEXES[index];
    return new Response(JSON.stringify({code: '200', data: [{indexName: identity.name, indexNameEn: identity.name_en, tradeDate: '20261007', peg: 20}]}));
  }) as typeof fetch;
  await assert.rejects(refreshValuationState(fetcher), /valuation_refresh_failed/);
  const after = await readState();
  assert.deepEqual(currentValuationHistory(after, 'NDX'), failed);
  for (const index of INDEX_CODES.filter(i => i !== 'NDX')) assert.equal(currentValuationHistory(after, index).points.at(-1)!.date, '2026-10-07');
});

test('total-return and bond refresh use Beijing date and persist idempotently across source failure', async () => {
  const {refreshTotalReturnHistory, currentTotalReturnHistory} = await import('../packages/backend/total-return-history.ts');
  const {OUTCOME_INDICES} = await import('../packages/backend/total-return-source.ts');
  const {refreshBondYields, currentBondYields} = await import('../packages/backend/bond-yield-history.ts');
  const now = new Date('2026-10-07T16:30:00Z'); // October 8 in Beijing
  const returnFetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('endDate'), '20261008');
    const info = Object.values(OUTCOME_INDICES).find(i => i.code === url.searchParams.get('indexCode'))!;
    return new Response(JSON.stringify({code: '200', data: [{indexCode: info.code, indexNameCnAll: info.name_cn, indexNameEnAll: info.name_en, tradeDate: '20261008', close: 100}]}));
  }) as typeof fetch;
  const failed = (async () => new Response('', {status: 503})) as typeof fetch;
  for (const index of Object.keys(OUTCOME_INDICES) as (keyof typeof OUTCOME_INDICES)[]) {
    const before = await currentTotalReturnHistory(index);
    const after = await refreshTotalReturnHistory(index, {now, fetcher: returnFetcher});
    assert.deepEqual(after.points.slice(0, -1), before.points);
    assert.equal(after.points.length, before.points.length + 1);
    assert.deepEqual(await refreshTotalReturnHistory(index, {now, fetcher: returnFetcher}), after);
    await assert.rejects(refreshTotalReturnHistory(index, {now, fetcher: failed}), /http_503/);
    assert.deepEqual(await currentTotalReturnHistory(index), after);
  }
  const before = await currentBondYields();
  const bondFetcher = (async (input: string | URL | Request) => {
    assert.equal(new URL(String(input)).searchParams.get('endDate'), '2026-10-08');
    return new Response(JSON.stringify({heList: [{workTime: '2026-10-08', tenYear: '1.8'}]}));
  }) as typeof fetch;
  const after = await refreshBondYields({now, fetcher: bondFetcher});
  assert.deepEqual(after.points.slice(0, -1), before.points);
  assert.deepEqual(await refreshBondYields({now, fetcher: bondFetcher}), after);
  await assert.rejects(refreshBondYields({now, fetcher: failed}), /http_503/);
  assert.deepEqual(await currentBondYields(), after);
});
