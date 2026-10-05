import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {acceptComposition,financePrompt,type ComposeInput} from '../packages/backend/finance.ts';
import {compositionIssues} from '../packages/backend/finance-quality.ts';
import {parseModelOutput} from '../packages/backend/model-output.ts';
import type {FinanceVersion,ParagraphBasis} from '../packages/contracts/types.ts';

const root=new URL('../',import.meta.url);
const files=['evidence/首次真实生成_公开输入.json','evidence/首次真实生成_任务结果.json','evidence/第二次真实生成_公开输入.json','evidence/第二次真实生成_原始草稿.json','evidence/首次可用真实文章_核对后.json'];
const hashes=await Promise.all(files.map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')})));
const archive=JSON.parse(await readFile(new URL(files[2],root),'utf8'));
const input=JSON.parse(archive.messages.find((message:{role:string})=>message.role==='user').content).input as ComposeInput;
const original=JSON.parse(await readFile(new URL(files[3],root),'utf8')) as FinanceVersion;
const edited=JSON.parse(await readFile(new URL(files[4],root),'utf8')) as FinanceVersion;
// Read this specific public-response archive only; no session, budget or credential files.
const run=JSON.parse(await readFile(new URL('.data/model-runs/9db86391-f909-4559-ae48-5ba94126e774.json',root),'utf8'));
const response=parseModelOutput(run.content,run.finish_reason) as FinanceVersion;
assert.deepEqual(response.article,original.article);
const rawIssues=compositionIssues(input.refs,original.article,original.interpretation);
assert.ok(rawIssues.some(issue=>issue.code==='evidence_year_mismatch'&&issue.path==='article.sections[2].paragraphs[0]'));
const [statement,projection]=input.refs.map(ref=>ref.article_id);
const basis=(kind:ParagraphBasis['kind'],id:string,indexes:number[]):ParagraphBasis=>({kind,refs:indexes.map(fragment_index=>({article_id:id,fragment_index}))});

// Manual evidence annotation of an already edited historical article. No model generated this.
const example=structuredClone(edited);
example.article.sections[0].basis=[basis('fact',statement,[0,1]),basis('fact',statement,[2,3])];
example.article.sections[1].basis=[basis('fact',projection,[4,5]),basis('inference',projection,[4,5,6]),basis('fact',projection,[2,3,5]),basis('inference',projection,[5])];
example.article.sections[2].basis=[basis('inference',statement,[1]),basis('inference',projection,[4,5])];
const exampleIssues=compositionIssues(input.refs,example.article,example.interpretation);
assert.equal(exampleIssues.filter(issue=>issue.severity==='error').length,0);
assert.ok(acceptComposition(input,example));
await writeFile(new URL('evidence/生成质量_证据定位示例_人工标注.json',root),JSON.stringify({status:'manual_annotation_of_already_edited_article_not_generated',source:files[4],article:example.article,interpretation:example.interpretation,input_refs:example.input_refs,issues:exampleIssues},null,2));
const prompt=financePrompt(input),parsedPrompt=JSON.parse(prompt);
assert.equal(parsedPrompt.input.previous.article.sections,undefined);
assert.ok(parsedPrompt.input.related.every((version:FinanceVersion)=>version.interpretation.topic_key===input.topic_key));
await writeFile(new URL('evidence/生成质量_新提示词_公开输入.json',root),prompt);
const after=await Promise.all(hashes.map(async item=>({...item,unchanged:item.sha256===createHash('sha256').update(await readFile(new URL(item.path,root))).digest('hex')})));
assert.ok(after.every(item=>item.unchanged));
const report={checked_at:new Date().toISOString(),mode:'free offline replay; no model requests or publication',first_request:{result:'generation_failed',raw_response_available:false,cause:'unknown; never reconstructed from synthetic tests'},second_request:{raw_response_matches_archived_article:true,finish_reason:run.finish_reason,raw_issues:rawIssues,known_editor_changes:JSON.parse(await readFile(new URL('evidence/首次可用真实文章_编辑核对.json',root),'utf8')).edits},manual_example:{source:files[4],not_model_generated:true,issues:exampleIssues,accepted_as_unpublished_candidate:true,meaning:'Shows that the new evidence interface can express this already edited article; does not measure new generation quality.'},prompt_change:{old_bytes:Buffer.byteLength(archive.messages.find((message:{role:string})=>message.role==='user').content),new_bytes:Buffer.byteLength(prompt),historical_full_articles_removed:true,unrelated_topic_context_removed:true,fragments_numbered:true,paragraph_kinds_and_bindings_required:true},preserved_archives:after,limits:['Binding and year/date checks cannot establish full semantic entailment; source/sample/unit mismatches still need editorial review.','Fee-to-market and unknown-date cases are constructed boundary checks, not mistakes observed in the two real Fed requests.','Chinese style guidance and a review flag do not prove the next model output is readable.','The native-details keyboard check remains unconfirmed; no all-pass claim.']};
await writeFile(new URL('evidence/生成质量_免费离线回放.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({mode:report.mode,raw_known_mismatch:rawIssues.find(issue=>issue.code==='evidence_year_mismatch'),manual_example:report.manual_example,prompt_change:report.prompt_change,preserved_archives:after.every(item=>item.unchanged)},null,2));
