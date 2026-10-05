import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readState,mutateState} from '../packages/backend/storage.ts';
import {createResearchService,defaultResearchState,mergeResearchEvidence} from '../packages/backend/research-service.ts';
import {buildResearchSnapshot,evaluateResearchSnapshot} from '../packages/backend/fund-research.ts';
import type {ResearchEvidence} from '../packages/backend/fund-evidence.ts';
import {fundResearchFixture} from './helpers/fund-research-output.ts';
import {startApi} from '../apps/api/src/main.ts';

const actual=JSON.parse(await readFile(new URL('../evidence/fund-research-live-20261005/research-evidence.json',import.meta.url),'utf8')) as ResearchEvidence;
const reset=()=>mutateState(async state=>{state.research_state=defaultResearchState();});
test('部分来源失败保留最后成功证据及原核查日期，不引入重复付费输入或冒充当前业务状态',()=>{
 const previous=buildResearchSnapshot(actual),failed={...structuredClone(actual),captured_at:'2026-10-05T20:00:00Z',funds:[],fund_series:[],documents:[],refs:[],market:null,errors:['all_fund_sources_failed']};
 const merged=buildResearchSnapshot(mergeResearchEvidence(failed,previous));assert.equal(merged.evidence_hash,previous.evidence_hash);assert.equal(merged.fund_series!.length,2);assert.equal(merged.funds[0].fields.service?.source.checked_at,previous.funds[0].fields.service?.source.checked_at);assert.deepEqual(merged.market,previous.market);assert.equal(evaluateResearchSnapshot(merged).checks.trade_status_verified.status,'not_assessable');
});
test('待发真实事实包可预留费用；未读披露明确无法检查，旧输入保护在provider之前阻止调用',async()=>{
 await reset();let calls=0;
 const service=createResearchService({collector:async()=>structuredClone(actual),provider:async input=>{calls++;return fundResearchFixture(input);}});
 await service.check();const preview=await service.preview();assert.equal(preview.ready,true);if(!preview.ready)throw new Error('missing_preview');
 assert.ok(preview.input_bytes<97952);assert.equal(preview.reservation_cny,((preview.input_bytes+2048)*2+5000*8)/1e6);
 assert.equal(preview.summary.documents_read,false);assert.equal(preview.evaluation.checks.document_body_read.status,'not_assessable');assert.deepEqual(preview.evaluation.checks.document_body_read.refs,[]);
 assert.ok(preview.evaluation.limitations.some(s=>s.includes('现金分红')));assert.equal('key' in preview.session,false);
 assert.equal((await service.processLatest({explicit:true,expected_hash:'0'.repeat(64)})).status,'failed');assert.equal(calls,0);
 assert.equal((await service.processLatest({explicit:true,expected_hash:preview.evidence_hash,expected_previous_id:'wrong-version'})).status,'failed');assert.equal(calls,0);assert.equal((await service.processLatest({explicit:true,expected_hash:preview.evidence_hash,expected_previous_id:preview.previous_version_id,expected_request_hash:'0'.repeat(64)})).status,'failed');assert.equal(calls,0);service.stop();
});
test('真实公开输入经过隔离provider到研究版本，同证据和并发不重复生成，旧版与预算保留',async()=>{
 await reset();const before=await readState(),old=JSON.stringify(before.finance_versions),budget=JSON.stringify(before.budget);let calls=0;
 const service=createResearchService({collector:async()=>structuredClone(actual),provider:async input=>{calls++;await new Promise(r=>setTimeout(r,15));return fundResearchFixture(input);}});
 await service.check();const results=await Promise.all([service.processLatest(),service.processLatest()]);
 assert.ok(results.some(r=>r.status==='updated'));assert.equal(calls,1);
 const state=await readState(),version=state.finance_versions.at(-1)!;assert.ok(version.research);assert.equal(version.origin,'model');assert.equal(version.as_of,'2026-09-30');assert.equal(JSON.stringify(state.finance_versions.slice(0,-1)),old);assert.equal(JSON.stringify(state.budget),budget);
 assert.equal((await service.processLatest()).status,'unchanged');assert.equal(calls,1);
 const restart=createResearchService({collector:async()=>({...structuredClone(actual),captured_at:'2026-10-05T23:00:00Z'}),provider:async input=>{calls++;return fundResearchFixture(input);}});
 await restart.check();assert.equal((await restart.processLatest()).status,'unchanged');assert.equal(calls,1);service.stop();restart.stop();
});
test('单来源失败仍保留可用事实；没有Key可免费核查，模型失败不覆盖旧日期且不自动重试',async()=>{
 await reset();const before=await readState();const current=before.finance_versions.length;
 const partial={...structuredClone(actual),errors:['007339:product:source_http_503']};
 const free=createResearchService({collector:async()=>partial});assert.equal((await free.check()).status,'partial');assert.equal((await free.processLatest()).status,'model_waiting');assert.ok((await readState()).research_state?.latest_snapshot?.market);assert.equal((await readState()).finance_versions.length,current);
 // Change a real field in this isolated fixture to exercise failure, not claim a live finance change.
 partial.funds[0].fields.service!.value='0.123%';partial.funds[0].fields.service!.source.revision++;let calls=0;const failing=createResearchService({collector:async()=>partial,provider:async()=>{calls++;throw new Error('isolated_provider_failure');}});
 await failing.check();assert.equal((await failing.processLatest()).status,'failed');assert.equal((await failing.processLatest()).status,'failed');assert.equal(calls,1);assert.equal((await readState()).finance_versions.length,current);assert.deepEqual((await readState()).budget,before.budget);free.stop();failing.stop();
});
test('下次打开按持久核查时间补查；免费失败计划重试且关注跨API启动保留',async()=>{
 await reset();const scheduled:number[]=[];let callback:()=>void=()=>{};
 const service=createResearchService({collector:async()=>actual,now:()=>new Date('2026-10-06T23:00:00Z'),schedule:(fn,ms)=>{callback=fn;scheduled.push(ms);return 1;},cancel:()=>{}});
 await mutateState(async state=>{state.research_state!.checks.push({id:'prior',started_at:'2026-10-05T15:00:00Z',finished_at:'2026-10-05T15:00:00Z',status:'partial',evidence_hash:'old',source_errors:['one_source_failed'],version_id:null,message:'隔离检查'});});
 await service.start();assert.equal(scheduled[0],1000);service.stop();
 const capability=async()=>({supported:true,available:true,stored:false,error:null});
 const api=await startApi({port:0,restoreSavedKey:false,credentialCapability:capability});
 const origin=`http://127.0.0.1:${(api.server.address() as {port:number}).port}`;
 assert.equal((await fetch(origin+'/reading/followed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic_key:'china-equity-index',followed:true})})).status,403);
 const saved=await fetch(origin+'/reading/followed',{method:'POST',headers:{'content-type':'application/json','x-jingwei-reader':'local'},body:JSON.stringify({topic_key:'china-equity-index',followed:true})});assert.equal(saved.status,200);await api.close();
 const restarted=await startApi({port:0,restoreSavedKey:false,credentialCapability:capability});const root=`http://127.0.0.1:${(restarted.server.address() as {port:number}).port}`;assert.deepEqual(await(await fetch(root+'/reading/followed')).json(),{topic_keys:['china-equity-index']});await restarted.close();
});

test('免费核查时间和同数据查询日期变化不改冻结请求，不重复付费；实际内容改变才重生成',async()=>{
 await reset();await mutateState(async state=>{state.finance_versions=state.finance_versions.filter(v=>v.origin!=='model');});let current=structuredClone(actual),calls=0;
 const service=createResearchService({collector:async()=>structuredClone(current),provider:async input=>{calls++;return fundResearchFixture(input);}});
 await service.check();const first=await service.preview();assert(first.ready);
 current.captured_at='2026-10-06T15:26:26.472Z';current.market!.checked_at=current.captured_at;
 current.market!.sources=current.market!.sources.map(s=>({...s,url:s.url.replace('20261005','20261006')}));
 current.funds.forEach(f=>{f.checked_at=current.captured_at;Object.values(f.fields).forEach(v=>{if(v)v.source.checked_at=current.captured_at;});});current.fund_series.forEach(s=>s.ref.checked_at=current.captured_at);
 await service.check();const second=await service.preview();assert(second.ready);assert.equal(second.evidence_hash,first.evidence_hash,'evidence_hash');assert.equal(second.request_hash,first.request_hash,'request_hash');assert.notEqual(second.captured_at,first.captured_at);
 assert.equal((await service.processLatest({explicit:true,expected_hash:first.evidence_hash,expected_previous_id:first.previous_version_id,expected_request_hash:first.request_hash})).status,'updated');assert.equal(calls,1);
 current.captured_at='2026-10-07T15:26:26.472Z';await service.check();assert.equal((await service.processLatest()).status,'unchanged');assert.equal(calls,1);
 current.funds[0].fields.service!.value='0.123%';current.funds[0].fields.service!.source.revision++;await service.check();assert.equal((await service.processLatest()).status,'updated');assert.equal(calls,2);service.stop();
});
