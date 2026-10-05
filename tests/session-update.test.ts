import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionUpdater } from '../apps/worker/src/session-update.ts';
import type { Material,FinanceVersion } from '../packages/contracts/types.ts';

function fixture(overrides:Partial<Parameters<typeof createSessionUpdater>[0]>={}){
 const scheduled:{fn:()=>void;ms:number;cancelled:boolean}[]=[];
 const calls={collect:0,process:0,publish:0};
 const updater=createSessionUpdater({
  collect:async id=>{calls.collect++;return {sources:[{source:id,discovered:0,stored:0,revised:0,errors:[]}]};},
  process:async()=>{calls.process++;return {processed:false,reason:'no_ready_task'};},
  publish:async()=>{calls.publish++;},ready:async()=>null,now:()=>Date.parse('2026-10-02T12:00:00Z'),
  schedule:(fn,ms)=>{const timer={fn,ms,cancelled:false};scheduled.push(timer);return timer;},
  cancel:timer=>{(timer as typeof scheduled[number]).cancelled=true;},...overrides
 });
 return {updater,calls,scheduled};
}
const config=(mode:'collect'|'draft'|'publish'='collect')=>({enabled:true,mode,interval_minutes:180,source_ids:['fed-monetary'],publish_authorized:mode==='publish'});

test('默认关闭，无计时或工作；显式启用先检查一次，再按周期检查',async()=>{
 const {updater,calls,scheduled}=fixture();assert.equal(updater.snapshot().enabled,false);await updater.tick();assert.equal(calls.collect,0);assert.equal(scheduled.length,0);
 await updater.configure(config());assert.equal(scheduled[0].ms,1000);await updater.tick();assert.equal(calls.collect,1);assert.equal(calls.process,0);assert.equal(calls.publish,0);assert.equal(scheduled.at(-1)?.ms,180*60000);assert.equal(updater.snapshot().last_result,'collected');
 updater.stop();scheduled.at(-1)?.fn();await Promise.resolve();assert.equal(calls.collect,1);assert.equal(updater.snapshot().enabled,false);
});
test('自动草稿不刊发；直接刊发需明确选择与授权',async()=>{
 let published=0;const {updater}=fixture({process:async()=>({processed:true,updated:true,id:'draft-one'}),publish:async()=>{published++;}});
 await assert.rejects(updater.configure({...config('publish'),publish_authorized:false}),/automatic_publication_not_authorized/);assert.equal(updater.snapshot().enabled,false);
 await updater.configure(config('draft'));await updater.tick();assert.equal(updater.snapshot().last_result,'draft');assert.equal(published,0);
 await updater.configure(config('publish'));await updater.tick();assert.equal(published,1);assert.equal(updater.snapshot().last_result,'published');updater.stop();
});
test('缺少会话授权不启动生成模式，官方源请求失败时暂停且不生成',async()=>{
 const blocked=fixture({ready:async()=> 'key_required'});await assert.rejects(blocked.updater.configure(config('draft')),/key_required/);assert.equal(blocked.calls.collect,0);
 const failed=fixture({collect:async id=>({sources:[{source:id,discovered:1,stored:0,revised:0,errors:['source timeout']}]})});
 await failed.updater.configure(config('publish'));await failed.updater.tick();assert.equal(failed.updater.snapshot().reason,'collection_failed');assert.equal(failed.updater.snapshot().status,'paused');assert.equal(failed.calls.process,0);await failed.updater.tick();assert.equal(failed.calls.process,0);
});
test('预算或生成失败暂停，不自动重试；每轮重新检查授权',async()=>{
 let attempts=0;const exhausted=fixture({process:async()=>{attempts++;return {processed:false,reason:'budget_exhausted'};}});
 await exhausted.updater.configure(config('draft'));await exhausted.updater.tick();await exhausted.updater.tick();assert.equal(attempts,1);assert.equal(exhausted.updater.snapshot().reason,'budget_exhausted');
 let ready:string|null=null;const deauthorized=fixture({ready:async()=>ready});await deauthorized.updater.configure(config('publish'));ready='budget_approval_required';await deauthorized.updater.tick();assert.equal(deauthorized.calls.collect,0);assert.equal(deauthorized.updater.snapshot().enabled,false);
});
test('不重叠处理；运行中关闭后不启动刊发或下一轮',async()=>{
 let finish!:(v:{processed:boolean;updated:boolean;id:string})=>void;let started!:()=>void;let published=0;
 const began=new Promise<void>(r=>{started=r;});const pending=new Promise<{processed:boolean;updated:boolean;id:string}>(r=>{finish=r;});
 const {updater,calls}=fixture({process:async()=>{started();return pending;},publish:async()=>{published++;}});
 await updater.configure(config('publish'));const work=updater.tick();await began;await updater.tick();assert.equal(calls.collect,1);updater.stop();finish({processed:true,updated:true,id:'in-flight-draft'});await work;assert.equal(published,0);assert.equal(updater.snapshot().status,'off');assert.equal(updater.snapshot().next_run_at,null);
});
test('复用既有公开输出免费走完整队列和刊发，同一证据后续检查不重复生成',async()=>{
 const dir=process.env.JINGWEI_DATA_DIR!;
 const {mutateState,readState}=await import('../packages/backend/storage.ts');
 const {syncCandidates}=await import('../packages/backend/events.ts');
 const {processNext,publishDraft}=await import('../packages/backend/pipeline.ts');
 const {configureSession,clearSession,setupWaitingReason}=await import('../packages/backend/budget.ts');
 const approved=JSON.parse(await readFile(new URL('../evidence/首次可用真实文章_核对后.json',import.meta.url),'utf8')) as FinanceVersion;
 const materials:Material[]=approved.input_refs.map((r,i)=>({id:r.article_id,revision:r.revision,source_id:'fed-monetary',url:r.url,published_at:r.published_at,title:i?'Federal Reserve issues economic projections from the FOMC meeting':'Federal Reserve issues FOMC statement',content_hash:'isolated-public-fixture-'+i,paragraphs:r.fragments,collected_at:'2026-10-02T12:00:00Z',topic_keys:['global-rates']}));
 let providerCalls=0;
 try{
  await configureSession({key:'isolated-automatic-fixture-key',limit_cny:1,authorize:true});
  const provider=async(input:Parameters<typeof processNext>[1] extends ((input:infer T)=>Promise<unknown>)|undefined?T:never)=>{
   // Test-only provenance annotation of an already edited article; not fresh generation.
   const article={...approved.article,sections:approved.article.sections.map(section=>{const ids=section.refs?.length?section.refs:[input.refs[0].article_id];return {...section,refs:ids,basis:section.paragraphs.map(()=>({kind:'inference' as const,refs:ids.map(article_id=>({article_id,fragment_index:0}))}))};})};
   providerCalls++;return {article,interpretation:{...approved.interpretation,topic_key:input.topic_key,claim_key:input.claim_key,related_story_ids:[],previous_claim_version_ids:[]},changes:{...approved.changes,kind:'initial'}};
  };
  const {updater}=fixture({
   collect:async id=>{await mutateState(async s=>{s.materials=structuredClone(materials);syncCandidates(s);});return {sources:[{source:id,discovered:2,stored:0,revised:0,errors:[]}]};},
   process:ids=>processNext(ids,provider),publish:publishDraft,ready:setupWaitingReason
  });
  await updater.configure(config('publish'));await updater.tick();let s=await readState();const published=s.finance_versions.find(v=>v.article.slug===approved.article.slug)!;assert.ok(published.published_at);assert.equal(s.tasks[0].status,'done');assert.equal(providerCalls,1);
  await updater.tick();assert.equal(providerCalls,1);assert.equal(updater.snapshot().last_result,'unchanged');s=await readState();assert.equal(s.budget?.reservations.length,0);assert.equal(s.budget?.reserved_micro_cny,0);updater.stop();
 }finally{clearSession();await rm(dir,{recursive:true,force:true});}
});
