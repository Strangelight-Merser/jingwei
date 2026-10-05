import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {initializeStorage,initializeState,mutateState,readState} from '../packages/backend/storage.ts';
import {createResearchService,defaultResearchState} from '../packages/backend/research-service.ts';
import {buildResearchSnapshot,evaluateResearchSnapshot} from '../packages/backend/fund-research.ts';
import type {ResearchEvidence} from '../packages/backend/fund-evidence.ts';
import {fundResearchFixture} from '../tests/helpers/fund-research-output.ts';

const root=resolve(import.meta.dirname,'..'),target=join(root,'evidence/fund-research-integration-20261005');await mkdir(target,{recursive:true});
const actual=JSON.parse(await readFile(join(root,'evidence/fund-research-live-20261005/research-evidence.json'),'utf8')) as ResearchEvidence;
const dir=await mkdtemp(join(tmpdir(),'jingwei-research-history-'));await initializeStorage({dataDir:dir,testMode:true});await initializeState({finance_versions:[],materials:[],events:[],tasks:[],collection_runs:[],budget:null,research_state:defaultResearchState()});
// Consecutive rows from actual downloaded official history. Dates and prices are never invented.
function historyWindow(days:number):ResearchEvidence{
 const series=actual.fund_series.map(s=>{const nav=s.nav.slice(0,days),end=nav.at(-1)!.date;const ref={...s.ref,article_id:s.ref.article_id+`-first-${days}`,data_as_of:end,fragments:[s.ref.fragments[0],JSON.stringify(nav)]};return {...s,nav,ref};});
 return {captured_at:actual.captured_at,refs:series.map(s=>s.ref),funds:[],market:null,errors:[],fund_series:series,documents:[]};
}
let current=historyWindow(100),mode:'initial'|'maintain'|'supplement'|'revise'='initial',providerCalls=0;
const service=createResearchService({collector:async()=>current,provider:async input=>{providerCalls++;const output=fundResearchFixture(input,mode);output.article.title='联接基金工具研究与待核条件';if(mode==='revise')output.interpretation.claim+='后续真实净值样本进入了新的工具核查范围。';return output;}});
const results=[];
for(const [days,kind]of [[100,'initial'],[110,'maintain'],[120,'supplement'],[130,'revise']] as const){current=historyWindow(days);mode=kind;await service.check();const result=await service.processLatest();results.push({days,kind,last_date:current.fund_series[0].nav.at(-1)!.date,...result});}
const state=await readState();assert.equal(state.finance_versions.length,3);assert.deepEqual(state.finance_versions.map(v=>v.changes.kind),['initial','supplement','revise']);assert.equal(providerCalls,4);assert.equal((await service.processLatest()).status,'unchanged');assert.equal(providerCalls,4);assert.equal(state.budget,null);assert.equal(state.finance_versions[1].previous_version_id,state.finance_versions[0].id);assert.equal(state.finance_versions[2].previous_version_id,state.finance_versions[1].id);service.stop();
const snapshot=buildResearchSnapshot(actual),evaluation=evaluateResearchSnapshot(snapshot);
await writeFile(join(target,'实际历史证据_隔离研究机制核验.json'),JSON.stringify({checked_at:new Date().toISOString(),scope:'Actual official historical NAV rows; isolated deterministic provider fixture exercises version branches. No real model request or market change claimed.',isolated_directory:dir,results,provider_fixture_calls:providerCalls,new_paid_model_calls:0,published_fixture_versions:state.finance_versions.map(v=>({id:v.id,version:v.version,as_of:v.as_of,previous_version_id:v.previous_version_id,kind:v.changes.kind})),actual_current_coverage:{captured_at:actual.captured_at,market_as_of:actual.market?.as_of,series:actual.fund_series.map(s=>({code:s.code,rows:s.nav.length,first:s.nav[0].date,last:s.nav.at(-1)!.date})),metrics:evaluation.metrics,checks:evaluation.checks,data_status:evaluation.data_status},production_touched:false},null,2));
console.log(JSON.stringify({history_results:results,published_fixture_versions:state.finance_versions.length,new_paid_model_calls:0,actual_metric_count:evaluation.metrics.length,report:join(target,'实际历史证据_隔离研究机制核验.json')},null,2));
