import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {FinanceVersion} from '../packages/contracts/types.ts';
import {fundTimeline,FUND_TIMELINE_STORY_ID} from '../packages/backend/fund-timeline.ts';

// Public export only. This test never imports storage or starts a worker/provider.
const seed=JSON.parse(await readFile(new URL('../desktop/reading-seed.json',import.meta.url),'utf8')) as {finance_versions:FinanceVersion[]};
const versions=seed.finance_versions.filter(version=>version.story_id===FUND_TIMELINE_STORY_ID).sort((a,b)=>a.version-b.version);
const timeline=fundTimeline(seed.finance_versions);
const entry=(number:number)=>timeline.entries.find(item=>item.version===number)!;

test('公开七版按父链比较、最新优先，人工研究及各日期保持原记录',()=>{
 assert.deepEqual(timeline.entries.map(item=>item.version),[7,6,5,4,3,2,1]);
 for(const item of timeline.entries){
  const original=versions[item.version-1];
  assert.equal(item.origin_label,'历史人工研究');
  assert.equal(item.dates.as_of,original.as_of);
  assert.equal(item.dates.reviewed_on,original.article.operation_view!.reviewed_on);
  assert.equal(item.dates.published_at,original.published_at);
  assert.equal(item.compared_version_id,original.previous_version_id);
  assert.equal(item.diff.actions.held.new_action,'持');
  assert.equal(item.diff.actions.new_money.new_action,'观察');
  assert.equal(item.trigger_evidence.status,'not_recorded');
  assert.match(item.trigger_evidence.message,/实际触发证据未记录/);
  assert.deepEqual(item.recorded_changes,original.changes);
 }
 assert.equal(entry(1).comparison_status,'initial');
});

test('第二版为条件及说明收窄，不能因引用或摘要当作新市场事件',()=>{
 const item=entry(2);
 assert.equal(item.diff.actions.held.action_changed,false);
 assert.equal(item.diff.actions.new_money.action_changed,false);
 assert.equal(item.diff.actions.held.text_changed,true);
 assert.match(item.diff.actions.held.old_text!,/原有长期配置继续持有/);
 assert.match(item.diff.actions.held.new_text!,/仅当已有长期/);
 assert.ok(item.diff.conditions.length);
 assert.ok(item.diff.reasons.length);
 assert.deepEqual(item.diff.sources,[]);
 assert.deepEqual(item.diff.market,[]);
 assert.match(item.recorded_changes.summary,/没有新增市场证据/);
});

test('第三至第五版资料补充与工具改判按真实字段显示，日期和URL可展开',()=>{
 assert.equal(entry(3).diff.sources.filter(source=>source.kind==='added').length,6);
 assert.ok(entry(3).diff.market.some(field=>field.new_value!==null));
 const official=entry(3).diff.sources.find(source=>source.article_id==='csi300-official-market-20260930')!;
 assert.equal(official.new_ref!.data_as_of,'2026-09-30');
 assert.equal(official.new_ref!.checked_at,'2026-10-02');
 assert.match(official.new_ref!.url,/csindex.com.cn/);
 assert.equal(entry(4).diff.sources.filter(source=>source.kind==='added').length,2);
 assert.match(entry(4).diff.actions.new_money.new_text!,/不据旧年费确定长期优先级/);
 assert.equal(entry(5).diff.sources.filter(source=>source.kind==='added').length,2);
 assert.ok(entry(5).diff.funds.some(field=>field.path.includes('a_class')));
 assert.equal(entry(5).summary_consistency.status,'not_assessed');
 assert.deepEqual(entry(4).diff.market,[]);
 assert.deepEqual(entry(5).diff.market,[]);
});

test('第六版只有正文PE口径删除，摘要不能重复第五版的A类补充',()=>{
 const item=entry(6);
 assert.equal(item.diff.body.length,1);
 assert.equal(item.diff.body[0].path,'article.sections[1].paragraphs[2]');
 const before=item.diff.body[0].old_value as string,after=item.diff.body[0].new_value as string;
 assert.equal(before.replace('官网说明市盈率剔除亏损股票；',''),after);
 assert.deepEqual(item.diff.funds,[]);
 assert.deepEqual(item.diff.sources,[]);
 assert.deepEqual(item.diff.research,[]);
 assert.equal(item.summary_consistency.status,'incomplete_match');
 assert.match(item.summary_consistency.message!,/没有新增A类条款或来源/);
 assert.doesNotMatch(item.actual_summary,/新增.*A类/);
});

test('第七版同ID同revision摘记纠错可见，市场数值与判断未变',()=>{
 const item=entry(7);
 assert.equal(item.diff.sources.length,1);
 const source=item.diff.sources[0];
 assert.equal(source.kind,'modified');
 assert.equal(source.old_ref!.article_id,source.new_ref!.article_id);
 assert.equal(source.old_ref!.revision,source.new_ref!.revision);
 assert.equal(source.fragments_changed,true);
 assert.equal(source.old_ref!.fragments[1].replace('市盈率计算剔除亏损股票；净资产采用最新一期财报。',''),source.new_ref!.fragments[1]);
 for(const group of ['conditions','reasons','funds','body','market','research'] as const)assert.deepEqual(item.diff[group],[]);
 assert.equal(item.diff.actions.held.text_changed,false);
 assert.equal(item.diff.actions.new_money.text_changed,false);
 assert.match(timeline.latest_summary!,/未新增来源，市场数值未变/);
});

test('未来版本比较真实旧新动作、基金字段和来源增删，不依赖摘要或input_hash',()=>{
 const next=structuredClone(versions.at(-1)!);
 next.id='public-fixture-v8';next.version=8;next.previous_version_id=versions.at(-1)!.id;
 next.published_at='2026-10-08T01:00:00Z';next.origin='model';
 next.article.operation_view!.unheld={action:'加',text:'虚拟测试：条件已核对后的新增说明。'};
 next.article.operation_view!.funds.reverse();
 next.article.operation_view!.funds.find(fund=>fund.code==='007339')!.service='0.10%';
 next.input_refs=next.input_refs.slice(1);
 next.input_refs.push({article_id:'public-fixture-new',revision:1,source:'虚拟公开资料',url:'https://example.com/new',published_at:'2026-10-08',fragments:['虚拟测试内容']});
 const actual=fundTimeline([...versions,next]).entries[0];
 assert.equal(actual.origin_label,'已刊模型研究');
 assert.equal(actual.diff.actions.new_money.old_action,'观察');
 assert.equal(actual.diff.actions.new_money.new_action,'加');
 assert.equal(actual.diff.actions.new_money.action_changed,true);
 assert.deepEqual(actual.diff.funds.filter(field=>field.path.endsWith('.service')),[{path:'funds.items.007339.service',old_value:'0.20%',new_value:'0.10%'}]);
 assert.equal(actual.diff.sources.filter(source=>source.kind==='removed').length,1);
 assert.equal(actual.diff.sources.filter(source=>source.kind==='added').length,1);
 assert.equal(actual.trigger_evidence.status,'not_recorded');
});

test('只变时钟、输入hash及父版本引用不会产生判断或市场数值差异',()=>{
 const next=structuredClone(versions.at(-1)!);
 next.id='public-fixture-dates';next.version=8;next.previous_version_id=versions.at(-1)!.id;
 next.as_of='2026-10-08';next.generated_at=next.published_at='2026-10-08T01:00:00Z';next.input_hash='different-clock-fixture';
 next.article.operation_view!.reviewed_on='2026-10-08';next.article.operation_view!.market!.as_of='2026-10-08';
 next.article.operation_view!.funds[0].document_date='2026-10-08';
 next.interpretation.previous_claim_version_ids=[versions.at(-1)!.id];
 const actual=fundTimeline([...versions,next]).entries[0];
 for(const group of ['conditions','reasons','funds','body','market','research'] as const)assert.deepEqual(actual.diff[group],[]);
 assert.equal(actual.diff.actions.held.action_changed,false);
 assert.equal(actual.diff.actions.new_money.action_changed,false);
});

test('过滤未刊与别的story；缺失父版明确不能比较；输出不共享输入引用',()=>{
 const input=structuredClone(seed.finance_versions),saved=structuredClone(input);
 const pending=structuredClone(versions.at(-1)!);pending.id='public-fixture-pending';pending.version=8;pending.published_at=null;
 assert.equal(fundTimeline([...input,pending]).entries.length,7);
 const missing=fundTimeline([versions.at(-1)!]).entries[0];
 assert.equal(missing.comparison_status,'previous_missing');
 assert.equal(missing.compared_version_id,null);
 assert.match(missing.actual_summary,/无法核对实际变化/);
 assert.equal(missing.diff.actions.held.action_changed,false);
 assert.equal(missing.diff.actions.new_money.text_changed,false);
 assert.deepEqual(missing.diff.sources,[]);
 assert.deepEqual(fundTimeline([],FUND_TIMELINE_STORY_ID),{story_id:FUND_TIMELINE_STORY_ID,article_slug:null,entries:[],latest_summary:null});
 const result=fundTimeline(input);
 result.entries[0].diff.sources[0].new_ref!.fragments[0]='changed output only';
 result.entries[0].recorded_changes.summary='changed output only';
 assert.deepEqual(input,saved);
});
