import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {READER_ACTION_OPERATION} from '../industry/reader-action-operation.ts';
import type {FinanceVersion} from '../packages/contracts/types.ts';
import type {State} from '../packages/backend/storage.ts';

const dir=process.env.JINGWEI_DATA_DIR!;

const {saveState,readState}=await import('../packages/backend/storage.ts');
const {articlePublication,topicPublication,homePublication}=await import('../packages/backend/publication.ts');
after(async()=>{await rm(dir,{recursive:true,force:true});});
const versions:FinanceVersion[]=[1,2,3].map(number=>{
 const version=structuredClone(READER_ACTION_OPERATION);
 version.id=`non-secret-reading-version-${number}`;
 version.version=number;
 version.previous_version_id=number===1?null:`non-secret-reading-version-${number-1}`;
 version.published_at=`2026-10-03T0${number}:00:00Z`;
 version.input_refs=[{article_id:'non-secret-evidence',revision:number,source:'虚拟测试原文',url:'https://example.com/fixture',published_at:'2026-09-30',fragments:[`不可覆盖的测试快照${number}`]}];
 return version;
});
const pending=structuredClone(versions[2]);
pending.id='non-secret-reading-pending';pending.version=4;pending.previous_version_id=versions[2].id;pending.published_at=null;
pending.review={required:true,status:'pending',reason:'非秘密测试材料待复核',checked_at:'2026-10-03T04:00:00Z',changes:[],condition_changes:['虚拟测试条件变化，尚未刊发新的判断。']};
const fixture={finance_versions:[...versions,pending],materials:[],events:[],tasks:[],budget:null,collection_runs:[{id:'non-secret-market-check',started_at:'2026-10-03T04:00:00Z',finished_at:'2026-10-03T04:01:00Z',sources:[{source:'csi300-market',discovered:0,stored:0,revised:0,errors:['non-secret-fixture-timeout']}]}]};
await saveState(fixture);

test('旧版只列真正较早版本，读原证据快照并保留当前版入口',async()=>{
 const old=await articlePublication(versions[0].article.slug,2);
 assert.equal(old?.version.id,versions[1].id);
 assert.equal(old?.latest.id,versions[2].id);
 assert.deepEqual(old?.history.map(v=>v.version),[1]);
 assert.equal(old?.version.input_refs[0].revision,2);
 assert.deepEqual(old?.version.input_refs[0].fragments,['不可覆盖的测试快照2']);
 assert.equal(old?.fund_review_notice,null);
 assert.equal(old?.market_availability,null);
 assert.equal(old?.market_check,null);
});

test('无效或不存在的版号不能悄悄回落到当前版',async()=>{
 for(const number of [0,-1,NaN,Infinity,1.5,99])assert.equal(await articlePublication(versions[0].article.slug,number),null);
 assert.equal((await articlePublication(versions[0].article.slug))?.version.version,3);
});

test('专题与当前文章用同一公开版，保留独立日期并提示待复核',async()=>{
 const topic=await topicPublication('china-equity-index');
 const current=await articlePublication(versions[0].article.slug);
 assert.equal(topic?.latest?.id,current?.version.id);
 assert.equal(topic?.latest?.article.operation_view?.market?.as_of,'2026-09-30');
 assert.equal(topic?.latest?.article.operation_view?.reviewed_on,'2026-10-03');
 assert.equal(topic?.fund_review_notice?.published_version_id,versions[2].id);
 assert.equal(topic?.market_availability?.status,'check_failed');
 assert.equal(topic?.market_check?.status,'failed');
 assert.equal(current?.fund_review_notice?.published_version_id,versions[2].id);
 assert.equal(current?.market_check?.status,'failed');
 assert.deepEqual(current?.history.map(v=>v.version),[2,1]);
});

test('阅读所有入口不刊发待审稿，不覆盖历史证据或改变存储',async()=>{
 await homePublication();await topicPublication('china-equity-index');await articlePublication(versions[0].article.slug,1);
 assert.deepEqual(await readState(),fixture);
});

test('同日同刊发时刻不同版号仍各取当时材料，不被最新原文revision或核查失败污染',async()=>{
 const isolated:State=structuredClone(fixture);
 for(const version of isolated.finance_versions)if(version.published_at)version.published_at='2026-10-03T02:00:00Z';
 isolated.materials=[{id:'non-secret-evidence',source_id:'official',url:'https://example.com/fixture',title:'后来订正的原文',published_at:'2026-09-30',revision:99,content_hash:'later-fixture',paragraphs:['后来内容不应覆盖旧版'],collected_at:'2026-10-03T04:00:00Z',topic_keys:['china-equity-index']}];
 isolated.finance_versions[0].input_refs[0].published_at='';
 isolated.finance_versions[0].input_refs[0].data_as_of='2026-08-31';
 isolated.finance_versions[0].input_refs[0].checked_at='2026-10-03T01:00:00Z';
 await saveState(isolated);
 for(const number of [1,2,3]){
  const page=await articlePublication(versions[0].article.slug,number);
  assert.equal(page?.version.input_refs[0].revision,number);
  assert.equal(page?.version.input_refs[0].fragments[0],`不可覆盖的测试快照${number}`);
  assert.deepEqual(page?.history.map(v=>v.version),Array.from({length:number-1},(_,i)=>number-1-i));
  if(number<3){assert.equal(page?.market_check,null);assert.equal(page?.fund_review_notice,null);}
  else {assert.equal(page?.market_check?.status,'failed');assert.deepEqual(page?.version.article.operation_view?.held,versions[2].article.operation_view?.held);}
 }
 const old=await articlePublication(versions[0].article.slug,1);
 assert.equal(old?.version.input_refs[0].published_at,'');assert.equal(old?.version.input_refs[0].data_as_of,'2026-08-31');
 assert.deepEqual(await readState(),isolated);
 await saveState(fixture);
});


test('没有已刊分析的专题不把模板展望冒充当前进展',async()=>{
 const empty:State={...structuredClone(fixture),finance_versions:[]};
 await saveState(empty);
 const topic=await topicPublication('china-equity-index');
 assert.equal(topic?.current,'目前还没有已刊分析。');
 assert.equal(topic?.latest,undefined);
 assert.equal(topic?.as_of,undefined);
 assert.deepEqual(await readState(),empty);
 await saveState(fixture);
});
