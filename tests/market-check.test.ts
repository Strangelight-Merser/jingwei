import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {READER_ACTION_OPERATION} from '../industry/reader-action-operation.ts';
import {marketCheck} from '../packages/backend/market-availability.ts';
import {applyMarketSnapshot} from '../packages/backend/market-updates.ts';
import type {MarketSnapshot} from '../packages/backend/market-sources.ts';
import type {State} from '../packages/backend/storage.ts';

const original=JSON.parse(await readFile(new URL('../references/market-research/market_collector_live.json',import.meta.url),'utf8')) as MarketSnapshot;
function fixture():State {
 const publication=structuredClone(READER_ACTION_OPERATION);
 publication.published_at='2026-10-03T03:29:54Z';
 return {finance_versions:[publication],materials:[],events:[],tasks:[],budget:null,collection_runs:[{id:'non-secret-check-fixture',started_at:'2026-10-08T04:00:00Z',finished_at:'2026-10-08T04:01:00Z',sources:[{source:'csi300-market',discovered:1,stored:0,revised:0,errors:[]}]}]};
}
function snapshot():MarketSnapshot {
 const observed=structuredClone(original);
 // Hypothetical non-secret test observation, never a real published market update.
 observed.hash='non-secret-check-fixture';observed.as_of='2026-10-08';observed.checked_at='2026-10-08T04:00:30Z';observed.valuation.as_of=observed.as_of;
 observed.daily.at(-1)!.date=observed.as_of;
 for(const source of observed.sources)source.as_of=observed.as_of;
 return observed;
}

test('同估值事实条件的新资料日只展示核查结果，不生成或覆盖判断版',()=>{
 const state=fixture(),published=JSON.stringify(state.finance_versions);
 assert.equal(applyMarketSnapshot(state,snapshot()).status,'unchanged');
 const result=marketCheck(state,state.finance_versions[0]);
 assert.equal(result?.status,'no_change');
 assert.equal(result?.scope,'valuation_comparison');
 assert.equal(result?.checked_at,'2026-10-08T04:01:00Z');
 assert.equal(result?.observation_as_of,'2026-10-08');
 assert.equal(result?.published_data_as_of,'2026-09-30');
 assert.equal(JSON.stringify(state.finance_versions),published);
 const before=JSON.stringify(state);marketCheck(state,state.finance_versions[0]);assert.equal(JSON.stringify(state),before);
});

test('核查失败保留已刊资料日，不把旧观测冒充本次取得的新资料',()=>{
 const state=fixture();state.market_observations=[snapshot()];
 state.collection_runs[0].sources[0].errors=['non-secret-fixture-timeout'];
 const before=JSON.stringify(state),result=marketCheck(state,state.finance_versions[0]);
 assert.equal(result?.status,'failed');assert.equal(result?.observation_as_of,null);
 assert.equal(result?.published_data_as_of,'2026-09-30');assert.equal(JSON.stringify(state),before);
});

test('估值事实边界变化待复核，不改变公开动作或刊发草稿',()=>{
 const state=fixture(),observed=snapshot(),publication=JSON.stringify(state.finance_versions[0]);
 observed.valuation.pe_ttm=observed.valuation.prior_year_end.pe_ttm;
 assert.equal(applyMarketSnapshot(state,observed).status,'draft_created');
 const result=marketCheck(state,state.finance_versions[0]);assert.equal(result?.status,'pending_review');
 assert.equal(JSON.stringify(state.finance_versions[0]),publication);assert.equal(state.finance_versions[1].published_at,null);
});

test('成功记录没有对应观测，或重复hash保留旧核查时间，均保守不宣称本次已复核',()=>{
 const state=fixture();assert.equal(marketCheck(state,state.finance_versions[0]),null);
 const observed=snapshot();observed.checked_at='2026-10-07T04:00:30Z';state.market_observations=[observed];
 assert.equal(marketCheck(state,state.finance_versions[0]),null);
 observed.checked_at='2026-10-08T04:02:00Z';assert.equal(marketCheck(state,state.finance_versions[0]),null);
});

test('同hash再次真实核查只刷新观测核查时间，可显示未变结果，旧版证据不动',()=>{
 const state=fixture(),observed=snapshot();observed.checked_at='2026-10-08T03:00:30Z';state.market_observations=[observed];
 const earlier=structuredClone(observed),publication=JSON.stringify(state.finance_versions);
 assert.equal(marketCheck(state,state.finance_versions[0]),null);
 const invalid=snapshot();invalid.valuation.pe_ttm=NaN;
 assert.throws(()=>applyMarketSnapshot(state,invalid),/invalid_market_value/);
 assert.deepEqual(state.market_observations?.[0],earlier);
 assert.equal(applyMarketSnapshot(state,snapshot()).status,'unchanged');
 assert.deepEqual(state.market_observations?.[0],{...earlier,checked_at:'2026-10-08T04:00:30Z'});
 assert.equal(marketCheck(state,state.finance_versions[0])?.status,'no_change');
 assert.equal(JSON.stringify(state.finance_versions),publication);
});
