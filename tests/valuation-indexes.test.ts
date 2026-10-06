import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INDEX_CODES, VALUATION_INDEXES} from '../packages/backend/valuation-indexes.ts';
import {seedHistory, parsePeHistory, refreshPeHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule, VALUATION_RULE} from '../packages/backend/valuation-rule.ts';
import {currentValuationHistory, judgmentPublication, refreshValuationState, valuationRuleEvidence} from '../packages/backend/judgment.ts';
import {mutateState, readState} from '../packages/backend/storage.ts';

const CURRENT = {
  '000300': {pe:13.15,percentile:48.8,band:'mid',changes:31,rows:3788,boundaries:[12.42,14.24,15.33]},
  '000905': {pe:25.09,percentile:71.6,band:'high',changes:17,rows:3785,boundaries:[18.49,24.35,30.43]},
  '000016': {pe:10.95,percentile:61.2,band:'mid',changes:42,rows:3785,boundaries:[10.19,11.35,12.15]},
} as const;

for (const index of INDEX_CODES) test(`${index}：各自官方历史、当前判断与固定规则参数`, () => {
  const history = seedHistory(index);
  const expected = CURRENT[index];
  const result = evaluateValuationRule(history.points, {index})!;
  assert.equal(history.index_code,index);
  assert.equal(history.points[0].date,'2011-06-28');
  assert.equal(history.points.at(-1)!.date,'2026-09-30');
  assert.equal(result.index_name,VALUATION_INDEXES[index].name);
  assert.equal(result.pe_ttm,expected.pe);
  assert.equal(result.percentile,expected.percentile);
  assert.equal(result.band,expected.band);
  assert.equal(result.changes.filter(c => c.from !== null).length,expected.changes);
  assert.equal(result.rows,expected.rows);
  assert.deepEqual([result.boundaries.low,result.boundaries.high,result.boundaries.extreme],expected.boundaries);
  for (const key of ['window_years','min_years','low','high','extreme','confirm_days','live_from'] as const) assert.equal(result.rule[key],VALUATION_RULE[key]);
  assert.equal(new Set(history.points.map(p => p.date)).size,history.points.length);
  assert.ok(history.points.every(p => p.pe_ttm > 0 && Number.isFinite(p.pe_ttm)));
});

test('三个指数的官方响应不能混用中英文身份；英文名也逐项校验', () => {
  for (const index of INDEX_CODES) {
    const identity = VALUATION_INDEXES[index];
    const row = {tradeDate:'20260930',indexName:identity.name,indexNameEn:identity.name_en,peg:CURRENT[index].pe};
    assert.deepEqual(parsePeHistory({code:'200',data:[row]},'2026-09-30',index),[{date:'2026-09-30',pe_ttm:CURRENT[index].pe}]);
    for (const other of INDEX_CODES.filter(code => code !== index)) assert.throws(() => parsePeHistory({code:'200',data:[row]},'2026-09-30',other),/identity/);
    assert.throws(() => parsePeHistory({code:'200',data:[{...row,indexNameEn:'Other'}]},'2026-09-30',index),/identity/);
  }
});

test('联网增量：请求自身指数，并从已知数据日重读，避免非交易日起点复制行', async () => {
  for (const index of INDEX_CODES) {
    const base = seedHistory(index);
    // 2026-09-28 minus 30 days is Saturday 2026-08-29; request the next known data date.
    base.points = base.points.filter(p => p.date <= '2026-09-28');
    const last = base.points.at(-1)!;
    const cutoff = new Date(`${last.date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate()-30);
    const identity = VALUATION_INDEXES[index];
    const fetcher = (async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('indexCode'),index);
      const start = url.searchParams.get('startDate');
      assert.equal(start,base.points.find(p => p.date >= cutoff.toISOString().slice(0,10))!.date.replaceAll('-',''));
      return new Response(JSON.stringify({code:'200',data:[{tradeDate:'20260930',indexName:identity.name,indexNameEn:identity.name_en,peg:CURRENT[index].pe}]}));
    }) as typeof fetch;
    const next = await refreshPeHistory(base,{fetcher,now:new Date('2026-10-06T10:00:00Z')});
    assert.equal(next.index_code,index);
    assert.equal(next.points.at(-1)!.pe_ttm,CURRENT[index].pe);
    assert.equal(next.checked_at,'2026-10-06T10:00:00.000Z');
    assert.equal(base.checked_at,null);
  }
});

test('三个联网核查独立保存：一组失败保留旧数据，成功组保留修订；AI证据仍为沪深300', async () => {
  const original = await readState();
  const beforeEvidence = valuationRuleEvidence(original);
  const requested: string[] = [];
  const fetcher = (async (input) => {
    const index = new URL(String(input)).searchParams.get('indexCode') as keyof typeof VALUATION_INDEXES;
    requested.push(index);
    if (index === '000016') return new Response('',{status:502});
    const identity = VALUATION_INDEXES[index];
    const pe = index === '000905' ? 26 : CURRENT[index].pe;
    return new Response(JSON.stringify({code:'200',data:[{tradeDate:'20260930',indexName:identity.name,indexNameEn:identity.name_en,peg:pe}]}));
  }) as typeof fetch;
  try {
    await assert.rejects(refreshValuationState(fetcher),/valuation_refresh_failed/);
    assert.deepEqual(requested.toSorted(),INDEX_CODES.toSorted());
    const state = await readState();
    assert.equal(currentValuationHistory(state,'000905').points.at(-1)!.pe_ttm,26);
    assert.ok(currentValuationHistory(state,'000905').checked_at);
    assert.deepEqual(currentValuationHistory(state,'000016'),currentValuationHistory(original,'000016'));
    const afterEvidence = valuationRuleEvidence(state)!;
    assert.equal(afterEvidence.pe_ttm,beforeEvidence!.pe_ttm);
    assert.equal(afterEvidence.percentile,beforeEvidence!.percentile);
    assert.equal(afterEvidence.rule_id,'csi300-pe-ttm-10y-v1');
    assert.equal((await judgmentPublication())!.index_code,'000300');
    assert.equal((await judgmentPublication('000905'))!.pe_ttm,26);
  } finally {
    await mutateState(async state => {
      state.valuation_history = original.valuation_history;
      state.valuation_histories = original.valuation_histories;
    });
  }
});
