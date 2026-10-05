import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseFundDocumentBody,readFundDocument,requiredFundDocuments} from '../packages/backend/fund-document-bodies.ts';
import {buildResearchSnapshot,evaluateResearchSnapshot,composeFundResearch} from '../packages/backend/fund-research.ts';
import {mergeResearchEvidence} from '../packages/backend/research-service.ts';
import {parseIndexMarketSnapshot,csi500Identity,toOtherDirectionEvidence} from '../packages/backend/market-sources.ts';
import type {FundResearchDocument} from '../packages/contracts/research.ts';
import type {ResearchEvidence} from '../packages/backend/fund-evidence.ts';
import {fundResearchFixture} from './helpers/fund-research-output.ts';
const root=new URL('../evidence/fund-document-bodies-20261005/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const frozen=JSON.parse(await readFile(new URL('../evidence/fund-research-integration-20261005/待发_冻结事实包.json',import.meta.url),'utf8'));
const documents:FundResearchDocument[]=[];
for(const record of manifest.documents){const original=frozen.snapshot.documents.find((d:FundResearchDocument)=>d.url===record.url);const pdf=record.downloads.find((d:any)=>d.file===record.pdf_file);documents.push(parseFundDocumentBody(original,await readFile(new URL(record.text_file,root),'utf8'),{url:pdf.url,sha256:pdf.sha256}));}
function evidence():ResearchEvidence{return {...structuredClone(frozen.snapshot),documents:[...frozen.snapshot.documents.filter((d:FundResearchDocument)=>!documents.some(r=>r.url===d.url)),...structuredClone(documents)]};}

test('四份真实正文保留C类、报告期、页码；不混入A类收益或目标跟踪误差',()=>{
 const [a,as,b,bs]=documents;
 assert.equal(a.body!.facts.period_return_pct!.value,8.17);assert.equal(b.body!.facts.period_return_pct!.value,7.91);
 assert.deepEqual(a.body!.period,{start:'2026-01-01',end:'2026-06-30'});assert.deepEqual(b.body!.period,a.body!.period);
 assert.equal(a.body!.facts.annual_tracking_error_pct!.value,0.37);assert.equal(a.body!.facts.annual_tracking_error_pct!.scope,'fund');assert.equal(b.body!.facts.annual_tracking_error_pct,undefined);
 assert.equal(as.body!.facts.service_pct!.value,0.2);assert.equal(bs.body!.facts.service_pct!.value,0.3);
 assert.equal(as.body!.facts.published_operating_rate_pct!.value,0.4);assert.equal(bs.body!.facts.published_operating_rate_pct!.value,0.5);
 assert.notEqual(a.body!.facts.benchmark!.value,b.body!.facts.benchmark!.value);assert.ok(documents.every(d=>d.body!.fragment_pages.length===d.ref.fragments.length));
 const wrong={...a,code:'999999'};assert.throws(()=>parseFundDocumentBody(wrong,'bad',{url:a.body!.pdf_url,sha256:a.body!.pdf_sha256}));
});
test('最新关键正文齐全后旧目录链接未读不遮住已读；跟踪与执行费用缺项仍独立未知',async()=>{
 const snapshot=buildResearchSnapshot(evidence()),e=evaluateResearchSnapshot(snapshot);
 assert.equal(requiredFundDocuments(snapshot.documents!,['007339','005658']).length,4);assert.equal(e.checks.document_body_read.status,'not_triggered');
 assert.equal(e.checks.tracking_available.status,'not_assessable');assert.equal(e.checks.fee_scope_verified.status,'not_assessable');assert.equal(e.evaluability.new_money.status,'not_assessable');
 assert.equal(e.metrics.find(m=>m.key==='007339_report_relative_difference_pct')!.value,0.97);assert.equal(e.metrics.find(m=>m.key==='005658_report_relative_difference_pct')!.value,0.18);
 assert.equal(e.metrics.find(m=>m.key==='same_period_c_report_return_difference_pct')!.value,-0.26);
 const version=await composeFundResearch(snapshot,null,async input=>fundResearchFixture(input));assert.ok(version);const f=version.article.operation_view!.funds;
 assert.equal(f.find(x=>x.code==='005658')!.tracking_error,'未取得本次证据');assert.match(f.find(x=>x.code==='007339')!.tracking_error,/基金层面/);
});
test('同链接正文临时失败保留原日期；新报告未读取不会冒充当前完整覆盖',()=>{
 const prior=buildResearchSnapshot(evidence()),failed=evidence();failed.captured_at='2026-10-06T10:00:00Z';failed.documents=failed.documents.map(d=>d.url===documents[0].url?{...d,status:'discovered',body:undefined,body_error:'read_timeout'}:d);failed.errors=['007339:interim_body:read_timeout'];
 const kept=buildResearchSnapshot(mergeResearchEvidence(failed,prior));assert.equal(kept.evidence_hash,prior.evidence_hash);assert.equal(kept.documents!.find(d=>d.url===documents[0].url)!.ref.checked_at,documents[0].ref.checked_at);
 failed.documents.push({...documents[0],url:'https://cdn.efunds.com.cn/new-report.pdf',published_at:'2026-10-06',status:'discovered',body:undefined});
 const next=buildResearchSnapshot(mergeResearchEvidence(failed,prior));assert.equal(evaluateResearchSnapshot(next).checks.document_body_read.status,'not_assessable');assert.ok(next.refs.some(r=>r.article_id===documents[2].ref.article_id));
});
test('PDF读取失败只中断当前正文；提取失败不会声明读完',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jingwei-document-test-'));try{await assert.rejects(readFundDocument(documents[0],{archive_dir:dir,fetcher:async()=>new Response('%PDF- fake isolated bytes %%EOF'),extractor:async()=>{throw new Error('pdf_body_unreadable');}}),/pdf_body_unreadable/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('中证500同API按真实代码日期解析，仅可得性覆盖；身份冲突拒绝，估值不推出方向选择',async()=>{
 const folder=new URL('other-direction/',root),probe=JSON.parse(await readFile(new URL('probe.json',folder),'utf8')),raw:any={},source_urls:any={};
 for(const [kind,value]of Object.entries(probe.sources) as [string,any][]){raw[kind]=JSON.parse(await readFile(new URL(value.file,folder),'utf8'));source_urls[kind]=value.url;}
 const parsed=parseIndexMarketSnapshot(raw,{checked_at:probe.checked_at,end_date:'2026-10-06',source_urls},csi500Identity),other=toOtherDirectionEvidence(parsed,csi500Identity);
 assert.equal(other.as_of,'2026-09-30');assert.equal(other.pe_ttm,25.09);assert.equal(other.close,7435.16);assert.equal(other.daily.length,20);
 const e=evidence();e.other_directions=[other];const snapshot=buildResearchSnapshot(e),evaluation=evaluateResearchSnapshot(snapshot);assert.equal(evaluation.evaluability.direction.status,'partial');assert.equal(evaluation.evaluability.new_money.status,'not_assessable');assert.ok(evaluation.metrics.some(m=>m.key==='csi500_pe_ttm'));
 assert.throws(()=>parseIndexMarketSnapshot(raw,{checked_at:probe.checked_at,end_date:'2026-10-06',source_urls},{...csi500Identity,code:'000300'}),/market_index_identity_missing/);
 other.as_of='2026-09-29';assert.throws(()=>buildResearchSnapshot(e),/research_other_direction_invalid/);
});
