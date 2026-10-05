import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSessionUpdater} from '../apps/worker/src/session-update.ts';
import {applyMarketSnapshot} from '../packages/backend/market-updates.ts';
import {toMarketEvidence,type MarketSnapshot} from '../packages/backend/market-sources.ts';
import type {State} from '../packages/backend/storage.ts';
import {FIRST_OPERATION} from '../industry/first-operation.ts';

async function fixture(modelReady:string|null='key_required'){
 const observed=JSON.parse(await readFile(new URL('../references/market-research/market_collector_live.json',import.meta.url),'utf8')) as MarketSnapshot;
 const publication=structuredClone(FIRST_OPERATION);publication.id='integration-published-operation';publication.published_at='2026-10-02T15:50:00Z';publication.article.operation_view!.market=toMarketEvidence(observed);
 const state:State={finance_versions:[publication],materials:[],events:[],tasks:[],collection_runs:[],budget:{id:'isolated-preserved-budget',limit_micro_cny:10000000,reserved_micro_cny:171322,approved_at:'2026-10-02',reservations:[]}};
 // Explicit synthetic condition change; never persisted or mistaken for new public data.
 const changed=structuredClone(observed);changed.checked_at='2026-10-02T16:10:00Z';changed.valuation.pe_ttm=changed.valuation.prior_year_end.pe_ttm;changed.daily.at(-1)!.pe_ttm=changed.valuation.pe_ttm;changed.hash='isolated-integration-condition-change';
 const calls={ready:0,process:0,publish:0,collect:[] as string[],modelSources:[] as string[]};
 const updater=createSessionUpdater({
  collect:async id=>{calls.collect.push(id);const market=id==='csi300-market'?applyMarketSnapshot(state,changed,changed.checked_at):null;return {sources:[{source:id,discovered:id==='csi300-market'?1:0,stored:0,revised:market?.status==='draft_created'?1:0,errors:[]}]};},
  ready:async()=>{calls.ready++;return modelReady;},
  process:async ids=>{calls.process++;calls.modelSources=[...ids];return {processed:false,reason:'no_ready_task'};},
  publish:async()=>{calls.publish++;throw new Error('unexpected_market_integration_publish');},
  now:()=>Date.parse(changed.checked_at),schedule:()=>({}),cancel:()=>{},
 });
 return {state,publication,updater,calls,originalPublication:JSON.stringify(publication),originalBudget:JSON.stringify(state.budget)};
}

test('市场单来源自动草稿跨采集与判断条件生成待审版，无需模型就绪或刊发',async t=>{
 const f=await fixture();t.after(()=>f.updater.stop());
 await f.updater.configure({enabled:true,mode:'draft',interval_minutes:180,source_ids:['csi300-market']});
 await f.updater.tick();assert.deepEqual(f.calls.collect,['csi300-market']);assert.equal(f.calls.ready,0);assert.equal(f.calls.process,0);assert.equal(f.calls.publish,0);assert.equal(f.updater.snapshot().last_result,'draft');
 const draft=f.state.finance_versions.at(-1)!;assert.equal(f.state.finance_versions.length,2);assert.equal(draft.published_at,null);assert.equal(draft.review?.status,'pending');assert.equal(draft.review?.required,true);assert.equal(draft.previous_version_id,f.publication.id);assert.match(draft.review?.condition_changes?.[0]??'',/滚动市盈率.*已不低于/);assert.equal(JSON.stringify(f.publication),f.originalPublication);assert.equal(JSON.stringify(f.state.budget),f.originalBudget);
});

test('市场单来源即使声明刊发授权也拒绝自动发布，尚未开始采集',async t=>{
 const f=await fixture();t.after(()=>f.updater.stop());
 await assert.rejects(f.updater.configure({enabled:true,mode:'publish',publish_authorized:true,interval_minutes:180,source_ids:['csi300-market']}),/operation_automatic_publication_forbidden/);
 assert.equal(f.updater.snapshot().enabled,false);assert.deepEqual(f.calls.collect,[]);assert.equal(f.calls.ready,0);assert.equal(f.calls.process,0);assert.equal(f.calls.publish,0);assert.equal(f.state.finance_versions.length,1);assert.equal(JSON.stringify(f.state.budget),f.originalBudget);
});

test('混合来源的市场待审变化与宏观无新任务保留draft状态，市场草稿不走宏观发布路径',async t=>{
 const f=await fixture(null);t.after(()=>f.updater.stop());
 await f.updater.configure({enabled:true,mode:'publish',publish_authorized:true,interval_minutes:180,source_ids:['csi300-market','fed-monetary']});
 await f.updater.tick();assert.deepEqual(f.calls.collect,['csi300-market','fed-monetary']);assert.deepEqual(f.calls.modelSources,['fed-monetary']);assert.equal(f.calls.process,1);assert.equal(f.calls.publish,0);assert.equal(f.updater.snapshot().last_result,'draft');assert.equal(f.updater.snapshot().enabled,true);
 const pending=f.state.finance_versions.filter(v=>!v.published_at);assert.equal(pending.length,1);assert.equal(pending[0].review?.status,'pending');assert.equal(pending[0].story_id,f.publication.story_id);assert.deepEqual(pending[0].article.operation_view!.held,f.publication.article.operation_view!.held);assert.equal(JSON.stringify(f.publication),f.originalPublication);assert.equal(JSON.stringify(f.state.budget),f.originalBudget);
});
