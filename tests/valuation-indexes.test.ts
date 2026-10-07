import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INDEX_CODES, RETURN_INDEX_CODES, VALUATION_INDEXES, frequencyOf, sourceOf} from '../packages/backend/valuation-indexes.ts';
import {seedHistory, parsePeHistory, parseDanjuanHistory, refreshPeHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule, VALUATION_RULE} from '../packages/backend/valuation-rule.ts';
import {currentValuationHistory, judgmentPublication, refreshValuationState, valuationRuleEvidence} from '../packages/backend/judgment.ts';
import {mutateState, readState} from '../packages/backend/storage.ts';

const CURRENT = {
  '000300': {first:'2011-06-28',pe:13.15,percentile:48.8,band:'mid',changes:17,rows:3788,boundaries:[12.22,14.41,15.33]},
  '000905': {first:'2011-06-28',pe:25.09,percentile:71.6,band:'high',changes:9,rows:3785,boundaries:[18.49,23.48,36.51]},
  '000016': {first:'2011-06-28',pe:10.95,percentile:61.2,band:'mid',changes:22,rows:3785,boundaries:[10.07,11.56,12.15]},
  '000852': {first:'2014-09-25',pe:29.59,percentile:66.3,band:'high',changes:6,rows:3057,boundaries:[23.39,29.34,47.05]},
  '000922': {first:'2011-06-28',pe:8.6,percentile:75.6,band:'high',changes:17,rows:3786,boundaries:[7.17,8.25,10.45]},
} as const;

for (const index of RETURN_INDEX_CODES) test(`${index}：各自官方历史、当前判断与固定规则参数`, () => {
  const history = seedHistory(index);
  const expected = CURRENT[index];
  const result = evaluateValuationRule(history.points, {index})!;
  assert.equal(history.index_code,index);
  assert.equal(history.points[0].date,expected.first);
  assert.equal(history.points.at(-1)!.date,'2026-09-30');
  assert.equal(result.index_name,VALUATION_INDEXES[index].name);
  assert.equal(result.pe_ttm,expected.pe);
  assert.equal(result.percentile,expected.percentile);
  assert.equal(result.band,expected.band);
  assert.equal(result.changes.filter(c => c.from !== null).length,expected.changes);
  assert.equal(result.rows,expected.rows);
  assert.deepEqual([result.boundaries.low,result.boundaries.high,result.boundaries.extreme],expected.boundaries);
  for (const key of ['window_years','min_years','low','high','extreme','confirm_days','buffer','live_from'] as const) assert.equal(result.rule[key],VALUATION_RULE[key]);
  assert.equal(new Set(history.points.map(p => p.date)).size,history.points.length);
  assert.ok(history.points.every(p => p.pe_ttm > 0 && Number.isFinite(p.pe_ttm)));
});

test('五个收益回放指数的官方响应不能混用中英文身份；英文名也逐项校验', () => {
  for (const index of RETURN_INDEX_CODES) {
    const identity = VALUATION_INDEXES[index];
    const row = {tradeDate:'20260930',indexName:identity.name,indexNameEn:identity.name_en,peg:CURRENT[index].pe};
    assert.deepEqual(parsePeHistory({code:'200',data:[row]},'2026-09-30',index),[{date:'2026-09-30',pe_ttm:CURRENT[index].pe}]);
    for (const other of INDEX_CODES.filter(code => code !== index && sourceOf(code) === 'csi')) assert.throws(() => parsePeHistory({code:'200',data:[row]},'2026-09-30',other),/identity/);
    assert.throws(() => parsePeHistory({code:'200',data:[{...row,indexNameEn:'Other'}]},'2026-09-30',index),/identity/);
  }
});

test('联网增量：请求自身指数，并从已知数据日重读，避免非交易日起点复制行', async () => {
  for (const index of RETURN_INDEX_CODES) {
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
    const url = new URL(String(input));
    // 蛋卷 indices fail here too; each index is saved or kept on its own.
    if (url.hostname === 'danjuanfunds.com') {requested.push(url.pathname.split('/').at(-1)!); return new Response('',{status:502});}
    const index = url.searchParams.get('indexCode') as keyof typeof VALUATION_INDEXES;
    requested.push(index);
    if (index === '000016') return new Response('',{status:502});
    const identity = VALUATION_INDEXES[index];
    const pe = index === '000905' ? 26 : (CURRENT as Record<string, {pe: number}>)[index]?.pe ?? 20;
    return new Response(JSON.stringify({code:'200',data:[{tradeDate:'20260930',indexName:identity.name,indexNameEn:identity.name_en,peg:pe}]}));
  }) as typeof fetch;
  try {
    await assert.rejects(refreshValuationState(fetcher),/valuation_refresh_failed/);
    assert.deepEqual(requested.toSorted(),INDEX_CODES.map(code => VALUATION_INDEXES[code].source_code).toSorted());
    const state = await readState();
    assert.equal(currentValuationHistory(state,'000905').points.at(-1)!.pe_ttm,26);
    assert.ok(currentValuationHistory(state,'000905').checked_at);
    assert.deepEqual(currentValuationHistory(state,'000016'),currentValuationHistory(original,'000016'));
    const afterEvidence = valuationRuleEvidence(state)!;
    assert.equal(afterEvidence.pe_ttm,beforeEvidence!.pe_ttm);
    assert.equal(afterEvidence.percentile,beforeEvidence!.percentile);
    assert.equal(afterEvidence.rule_id,'csi300-pe-ttm-10y-v2');
    assert.equal((await judgmentPublication())!.index_code,'000300');
    assert.equal((await judgmentPublication('000905'))!.pe_ttm,26);
  } finally {
    await mutateState(async state => {
      state.valuation_history = original.valuation_history;
      state.valuation_histories = original.valuation_histories;
    });
  }
});

test('新增指数：种子连续、无重复，周数据按 2 个周读数确认、日数据按 5 个交易日确认', () => {
  for (const index of INDEX_CODES.filter(code => !(RETURN_INDEX_CODES as readonly string[]).includes(code))) {
    const history = seedHistory(index);
    const result = evaluateValuationRule(history.points, {index})!;
    assert.ok(result, index);
    assert.equal(history.points.at(-1)!.date, '2026-09-30', index);
    assert.equal(new Set(history.points.map(p => p.date)).size, history.points.length, index);
    assert.ok(history.points.every(p => p.pe_ttm > 0), index);
    // No gap longer than a holiday break inside the series (CSI's own 2012-01/02 gap is in every CSI seed).
    for (let i = 1; i < history.points.length; i++) if (history.points[i].date !== '2012-03-08') assert.ok(Date.parse(history.points[i].date) - Date.parse(history.points[i - 1].date) <= 21 * 86_400_000, `${index} ${history.points[i].date}`);
    assert.equal(result.rule.confirm_days, frequencyOf(index) === 'weekly' ? 2 : 5, index);
    assert.equal(result.rule.source, sourceOf(index));
    assert.equal(result.rule.unit, frequencyOf(index) === 'weekly' ? '个周读数' : '个数据日');
  }
  assert.equal(seedHistory('000852').points[0].date, '2014-09-25');
  assert.equal(seedHistory('000688').points[0].date, '2020-07-06');
});

test('蛋卷周估值：按北京时间取日期，拒绝失败响应、重复日期、未来日期与非正估值', () => {
  const ok = (rows: unknown[]) => ({result_code: 0, data: {index_eva_pe_growths: rows}});
  const ts = Date.parse('2026-09-29T16:00:00Z');
  assert.deepEqual(parseDanjuanHistory(ok([{pe: 30.9494, ts}]), '2026-09-30'), [{date: '2026-09-30', pe_ttm: 30.95}]);
  assert.throws(() => parseDanjuanHistory({result_code: 1, data: {}}, '2026-09-30'), /unsuccessful/);
  assert.throws(() => parseDanjuanHistory(ok([{pe: 30, ts}, {pe: 31, ts}]), '2026-09-30'), /duplicate/);
  assert.throws(() => parseDanjuanHistory(ok([{pe: 30, ts}]), '2026-09-29'), /future/);
  assert.throws(() => parseDanjuanHistory(ok([{pe: 0, ts}]), '2026-09-30'), /value/);
});

test('蛋卷指数联网增量：请求自身代码的近三年周数据（1y 不返回数据），合并后不重复', async () => {
  const base = seedHistory('NDX');
  const fetcher = (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'danjuanfunds.com');
    assert.equal(url.pathname, '/djapi/index_eva/pe_history/NDX');
    assert.equal(url.searchParams.get('day'), '3y');
    return new Response(JSON.stringify({result_code: 0, data: {index_eva_pe_growths: [
      {pe: base.points.at(-1)!.pe_ttm, ts: Date.parse(`${base.points.at(-1)!.date}T00:00:00+08:00`)},
      {pe: 31.2, ts: Date.parse('2026-10-09T00:00:00+08:00')},
    ]}}));
  }) as typeof fetch;
  const next = await refreshPeHistory(base, {fetcher, now: new Date('2026-10-10T02:00:00Z')});
  assert.equal(next.points.length, base.points.length + 1);
  assert.deepEqual(next.points.at(-1), {date: '2026-10-09', pe_ttm: 31.2});
});
