import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compositionIssues} from '../packages/backend/finance-quality.ts';
import {acceptComposition,financePrompt,type ComposeInput} from '../packages/backend/finance.ts';
import {parseModelOutput} from '../packages/backend/model-output.ts';
import type {FinanceVersion,Article} from '../packages/contracts/types.ts';

const raw=JSON.parse(await readFile(new URL('../evidence/第二次真实生成_原始草稿.json',import.meta.url),'utf8')) as FinanceVersion;
const archive=JSON.parse(await readFile(new URL('../evidence/第二次真实生成_公开输入.json',import.meta.url),'utf8'));
const input=JSON.parse(archive.messages.find((message:{role:string})=>message.role==='user').content).input as ComposeInput;
const bound=structuredClone(raw);
for(const section of bound.article.sections)section.basis=section.paragraphs.map(()=>({kind:'fact',refs:(section.refs??[]).map(article_id=>({article_id,fragment_index:0}))}));

test('真实合法ID错引2025事实在回放中被发现，旧输出不被改写',()=>{
 const before=JSON.stringify(raw);
 const issues=compositionIssues(input.refs,raw.article,raw.interpretation);
 assert.ok(issues.some(issue=>issue.code==='evidence_year_mismatch'&&issue.path==='article.sections[2].paragraphs[0]'));
 assert.ok(issues.some(issue=>issue.code==='absence_claim_needs_full_text'));
 assert.throws(()=>acceptComposition(input,bound),/evidence_year_mismatch/);
 assert.equal(JSON.stringify(raw),before);
});

test('生成输入只传承旧主张，不把旧稿全文或异主题文章当当前原文',()=>{
 const prompt=JSON.parse(financePrompt(input));
 assert.equal(prompt.input.previous.article.sections,undefined);
 assert.ok(prompt.input.related.every((version:FinanceVersion)=>version.interpretation.topic_key===input.topic_key));
 assert.deepEqual(prompt.input.refs[0].fragments[0],{fragment_index:0,text:input.refs[0].fragments[0]});
 assert.ok(prompt.schema.properties.article.properties.sections.items.required.includes('basis'));
});

test('未知日期不补成生成日；非法日历、错具体日期和不存在片段可辨别',()=>{
 const article:Article={slug:'date-fixture',title:'政策参考及核查条件',deck:'根据给出的材料可以确认政策方向，后续变化仍需要对应原文。',category:'测试',kind:'analysis',read_minutes:1,sections:[{heading:'原文',paragraphs:['利率保持不变。'],refs:[input.refs[0].article_id],basis:[{kind:'fact',refs:[{article_id:input.refs[0].article_id,fragment_index:0}]}]},{heading:'推断',paragraphs:['后续尚需材料。'],refs:[input.refs[0].article_id],basis:[{kind:'inference',refs:[{article_id:input.refs[0].article_id,fragment_index:0}]}]}]};
 const refs=[{...input.refs[0],published_at:'',fragments:['利率保持不变。']}];
 assert.equal(compositionIssues(refs,article,raw.interpretation).length,0);
 article.sections[0].paragraphs[0]='2026年10月3日发布，利率保持不变。';
 assert.ok(compositionIssues(refs,article,raw.interpretation).some(issue=>issue.code==='evidence_date_mismatch'));
 assert.ok(compositionIssues([{...refs[0],published_at:'2026-02-30'}],article,raw.interpretation).some(issue=>issue.code==='invalid_evidence_date'));
 article.sections[0].basis![0].refs[0].fragment_index=99;
 assert.ok(compositionIssues(refs,article,raw.interpretation).some(issue=>issue.code==='invalid_fragment_reference'));
});

test('同方向费用材料不能成为追加信号，指出不能据此追加的解释可保留',()=>{
 const refs=[{article_id:'fee-fixture',revision:1,source:'基金公司 · C类概要',url:'https://example.com/fund/summary',published_at:'',fragments:['C类销售服务费为0.20%，持有少于7日赎回费1.50%。']}];
 const article={...raw.article,title:'两只同方向工具的费用条件',deck:'服务费与赎回条款影响工具比较，需要结合持有期限和渠道核对。',sections:[]} as Article;
 const interpretation={...raw.interpretation,evidence_ids:['fee-fixture'],claim:'服务费较低，所以建议追加沪深300。'};
 assert.ok(compositionIssues(refs,article,interpretation).some(issue=>issue.code==='fund_terms_cannot_support_market_action'));
 interpretation.claim='服务费较低不足以支持追加；先核对期限与渠道。';
 assert.equal(compositionIssues(refs,article,interpretation).length,0);
});

test('截断、空响应与非法JSON区分，完整公共JSON不自动重写',()=>{
 assert.throws(()=>parseModelOutput('{}','length'),/model_output_truncated/);
 assert.throws(()=>parseModelOutput('','stop'),/empty_model_output/);
 assert.throws(()=>parseModelOutput('{broken','stop'),/invalid_model_json/);
 assert.deepEqual(parseModelOutput('{"article":"original"}','stop'),{article:'original'});
});

const dir=process.env.JINGWEI_DATA_DIR!;
const {saveState,readState}=await import('../packages/backend/storage.ts');
const {publishVersion}=await import('../packages/backend/compose.ts');
after(async()=>{await rm(dir,{recursive:true,force:true});});
test('既有坏草稿不能绕过生成检查直接刊发，人工选项也不能盖过来源错误',async()=>{
 await saveState({finance_versions:[bound],materials:[],events:[],tasks:[],budget:null,collection_runs:[]});
 await assert.rejects(publishVersion(bound.id,{manual_review:true,review_note:'测试复核不能允许一个合法ID支持另一年的政策事实。'}),/evidence_year_mismatch/);
 assert.equal((await readState()).finance_versions[0].published_at,null);
});
