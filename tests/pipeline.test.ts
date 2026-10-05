import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=process.env.JINGWEI_DATA_DIR!;
const {readState,saveState}=await import('../packages/backend/storage.ts');
const {identifyEvent,syncCandidates}=await import('../packages/backend/events.ts');
const {processTask,publishDraft,pipelineSnapshot}=await import('../packages/backend/pipeline.ts');
const {configureSession,clearSession,reserveCost,estimateReservation}=await import('../packages/backend/budget.ts');
const {projectionRows}=await import('../packages/backend/collect.ts');
const {verifyPriceTable}=await import('../packages/backend/model.ts');
import type { Material } from '../packages/contracts/types.ts';
const material:Material={id:'test-official-material',source_id:'fed-monetary',url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260819a.htm',title:'Test fixture FOMC statement',published_at:'2026-08-19T18:00:00Z',revision:1,content_hash:'fixture-one',paragraphs:['The Committee decided to keep the target range for the federal funds rate unchanged. Inflation remains elevated.'],collected_at:'2026-10-02T00:00:00Z',topic_keys:['global-rates']};
after(async()=>{clearSession();await rm(dir,{recursive:true,force:true});});
test('同一政策决定跨日材料沿用事件，新决定与未识别材料保留独立边界',()=>{
 assert.equal(identifyEvent(material).key,identifyEvent({...material,published_at:'2026-08-20T18:00:00Z'}).key);
 assert.notEqual(identifyEvent(material).key,identifyEvent({...material,url:material.url.replace('0819','0916')}).key);
 assert.equal(identifyEvent({...material,url:'https://www.federalreserve.gov/newsevents/pressreleases/other.htm'}).period,null);
 assert.equal(identifyEvent({...material,title:"Minutes of the Board's discount rate meetings on July 20 and July 29, 2026",paragraphs:['The Board process is distinct from the FOMC target range for the federal funds rate.']}).period,null);
 assert.equal(identifyEvent({...material,url:material.url.replace('a.htm','b.htm'),paragraphs:['Projections (PDF) | Accessible Materials']}).ready,false);
});
test('采集材料持久化进入队列；缺密钥不调用provider，重复证据不重复排队',async()=>{
 const state=await readState();state.materials=[material];syncCandidates(state);syncCandidates(state);assert.equal(state.tasks.length,1);await saveState(state);
 let calls=0;const task=state.tasks[0];await processTask(task.id,async()=>{calls++;return {};});assert.equal(calls,0);
 const saved=await readState();assert.equal(saved.tasks[0].status,'pending');assert.equal(saved.tasks[0].waiting_reason,'key_required');assert.equal(saved.budget,null);
});
test('mock provider完成草稿到显式刊发，公开阅读前不泄露草稿，密钥不写文件',async()=>{
 await configureSession({key:'test-fixture-never-a-real-key',limit_cny:1,authorize:true});
 const state=await readState();const task=state.tasks[0];
 const result=await processTask(task.id,async input=>({article:{slug:'test-new-policy',title:'测试材料对应的政策分析',deck:'这是隔离测试中的原文证据组合，检查草稿不会在处理完成时自动进入公开阅读页。',category:'海外观察',read_minutes:3,kind:'analysis',sections:[{heading:'事实',paragraphs:['原文称利率不变。'],refs:[material.id],basis:[{kind:'fact',refs:[{article_id:material.id,fragment_index:0}]}]},{heading:'条件',paragraphs:['后续仍看通胀。'],refs:[material.id],basis:[{kind:'inference',refs:[{article_id:material.id,fragment_index:0}]}]}]},interpretation:{topic_key:input.topic_key,claim_key:input.claim_key,claim:'原文不变的利率仍需结合通胀条件观察。',evidence_ids:[material.id],mechanism:['政策利率影响融资定价'],conditions:['后续通胀材料继续观察'],alternatives:[],related_story_ids:[],previous_claim_version_ids:[]},changes:{kind:'initial',summary:'独立的新政策决定',evidence_ids:[material.id]}}));
 assert.equal(result.processed,true);let saved=await readState();const draft=saved.finance_versions.find(v=>v.article.slug==='test-new-policy')!;assert.equal(draft.published_at,null);assert.equal(saved.tasks[0].status,'draft');
 await publishDraft(draft.id);saved=await readState();assert.ok(saved.finance_versions.find(v=>v.id===draft.id)?.published_at);assert.equal(saved.tasks[0].status,'done');
 assert.ok(!(await readFile(join(dir,'content.json'),'utf8')).includes('test-fixture-never-a-real-key'));
 clearSession();assert.equal((await pipelineSnapshot()).session.has_key,false);
});
test('本轮额度在并发预留下不被超支，重新保存或暂停不能抹掉占用',async()=>{
 await configureSession({key:'test-fixture-never-a-real-key',limit_cny:0.01,authorize:true});
 const outcomes=await Promise.allSettled([reserveCost(7000,'one'),reserveCost(7000,'two')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await configureSession({limit_cny:0.01,authorize:true});assert.equal((await readState()).budget?.reserved_micro_cny,7000);
 await assert.rejects(configureSession({limit_cny:0.005,authorize:true}),/budget_below_reserved/);
 assert.ok(estimateReservation('中文')>40000);clearSession();await assert.rejects(reserveCost(1,'three'),/model_setup_required/);
});
test('预测表保留每个统计口径和年份，布局与费率变化时停止猜测',()=>{
 const headers='<tr><th rowspan="2">Variable</th><th colspan="5">Median1</th><th colspan="5">Central Tendency2</th><th colspan="5">Range3</th></tr><tr>'+Array.from({length:3},()=>['2026','2027','2028','2029','Longer run'].map(y=>`<th>${y}</th>`).join('')).join('')+'</tr>';
 const row='<tr><td>PCE inflation</td>'+Array.from({length:15},(_,i)=>`<td>${i===0?'3.7':'2.0'}</td>`).join('')+'</tr>';
 const parsed=projectionRows(`<table>${headers}${row}</table>`,'https://official.example/table');assert.match(parsed[0],/Median1: 2026=3.7/);assert.match(parsed[0],/Range3: 2026=2.0/);
 assert.throws(()=>projectionRows('<table></table>','x'),/structure_changed/);
 const price='<table><tr><th>模型</th><th>deepseek-flash</th></tr><tr><td>百万tokens输入</td></tr><tr><td>百万tokens输出</td></tr>'+['0.04元','2元','8元'].map(v=>`<tr><td>高峰时段</td><td>${v}</td></tr>`).join('')+'</table>';
 assert.doesNotThrow(()=>verifyPriceTable(price));assert.throws(()=>verifyPriceTable(price.replace('8元','9元')),/pricing_verification_failed/);
});
