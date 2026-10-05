import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptComposition,inputHash,selectFragments,type ComposeInput } from '../packages/backend/finance.ts';
import { relatedClaims } from '../packages/backend/recall.ts';
import { SEED } from '../packages/backend/seed.ts';
import type { Material } from '../packages/contracts/types.ts';
const initial=SEED[0];
const refs=initial.input_refs.map(r=>({...r,revision:r.revision+1}));
const input:ComposeInput={story_id:initial.story_id,topic_key:initial.interpretation.topic_key,claim_key:initial.interpretation.claim_key,refs,previous:{...initial,input_hash:inputHash(initial.input_refs)},related:[]};
// Routing/version fixtures carry explicit test-only bindings; not evidence of model quality.
const fixtureArticle={...initial.article,sections:initial.article.sections.map(section=>{const ids=section.refs?.length?section.refs:[refs[0].article_id];return {...section,refs:ids,basis:section.paragraphs.map(()=>({kind:'inference' as const,refs:ids.map(article_id=>({article_id,fragment_index:0}))}))};})};
const raw=(kind:'maintain'|'supplement'|'revise')=>({article:fixtureArticle,interpretation:initial.interpretation,changes:{kind,summary:'新证据补充合同适用条件',evidence_ids:[refs[0].article_id]}});
test('重复输入与维持判断不产生新公开版本',()=>{assert.equal(acceptComposition({...input,refs:initial.input_refs},raw('supplement')),null);assert.equal(acceptComposition(input,raw('maintain')),null);});
test('补充保存同事件上一版、原文revision和独立草稿',()=>{const v=acceptComposition(input,raw('supplement'))!;assert.equal(v.version,2);assert.equal(v.previous_version_id,initial.id);assert.equal(v.story_id,initial.story_id);assert.equal(v.input_refs[0].revision,2);assert.equal(v.published_at,null);});
test('观点承接允许引用同事件上一版本，但拒绝不存在的版本',()=>{const out=raw('supplement');out.interpretation={...out.interpretation,previous_claim_version_ids:[initial.id]};assert.equal(acceptComposition(input,out)?.previous_version_id,initial.id);out.interpretation.previous_claim_version_ids=['invented-version'];assert.throws(()=>acceptComposition(input,out),/unknown_related_claim/);});
test('结构错误给出可辨别的失败原因',()=>{assert.throws(()=>acceptComposition(input,{output:raw('supplement')}),/invalid_model_structure/);});
test('关键结论改变必须标记修正',()=>{const out=raw('supplement');out.interpretation={...out.interpretation,claim:'旧判断适用范围收窄，传导尚不足以支持原结论'};assert.throws(()=>acceptComposition(input,out),/claim_change_requires_revision/);assert.equal(acceptComposition(input,{...out,changes:{...out.changes,kind:'revise'}})?.version,2);});
test('新事件不能把旧事件版本当同事件previous',()=>{assert.throws(()=>acceptComposition({...input,story_id:'new-rate-event'},raw('supplement')),/same_event/);});
test('原文不足或引用不存在时拒绝生成',()=>{assert.throws(()=>acceptComposition({...input,refs:[]},raw('supplement')),/original_evidence_required/);const out=raw('supplement');out.changes.evidence_ids=['invented-source'];assert.throws(()=>acceptComposition(input,out),/unknown_evidence/);});
test('超过14天的活跃主题仍召回为相关上下文',()=>{const material:Material={id:'new',source_id:'official',url:'https://example.com',title:'LPR新报价',published_at:'2026-09-20',revision:1,content_hash:'abc',paragraphs:['LPR报价公告与贷款重定价条件'],collected_at:'2026-10-02',topic_keys:['rate-transmission']};assert.ok(relatedClaims(material,SEED).some(v=>v.story_id===initial.story_id));assert.equal(selectFragments(material,['LPR']).fragments[0],material.paragraphs[0]);assert.throws(()=>selectFragments({...material,paragraphs:[]},['LPR']),/no_relevant_original/);});

test('资料所属日期订正进入输入比较，重复核查时间不制造新输入',()=>{
 const original=[{...refs[0],data_as_of:'2026-08-31',checked_at:'2026-10-03T01:00:00Z'}];
 assert.notEqual(inputHash(original),inputHash([{...original[0],data_as_of:'2026-09-30'}]));
 assert.equal(inputHash(original),inputHash([{...original[0],checked_at:'2026-10-03T02:00:00Z'}]));
});

test('形成文章后输入对象再改动不能改写该版引用快照',()=>{
 const local={...input,refs:structuredClone(input.refs)};
 const version=acceptComposition(local,raw('supplement'))!;
 const saved=structuredClone(version.input_refs);
 local.refs[0].fragments[0]='后来订正的原文';local.refs[0].revision++;
 assert.deepEqual(version.input_refs,saved);
});

test('来源发布日期未知时保留空值，资料截至用原数据日期而非生成或核查日',()=>{
 const local={...input,refs:input.refs.map(ref=>({...ref,published_at:'',data_as_of:'2026-09-30',checked_at:'2026-10-03'}))};
 const version=acceptComposition(local,raw('supplement'),'2026-10-03T05:00:00Z')!;
 assert.equal(version.as_of,'2026-09-30');assert.ok(version.input_refs.every(ref=>ref.published_at===''));
});
