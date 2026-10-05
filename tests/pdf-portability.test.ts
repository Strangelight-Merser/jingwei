import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {extractPDFText,parseFundDocumentBody,downloadOfficialPDF} from '../packages/backend/fund-document-bodies.ts';
const folder=new URL('../evidence/fund-document-bodies-20261005/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8')),frozen=JSON.parse(await readFile(new URL('../evidence/fund-research-integration-20261005/待发_冻结事实包.json',import.meta.url),'utf8'));
test('PATH无系统工具时四份真实PDF仍提取中文、页码和正确C类事实',async()=>{
 const pathBefore=process.env.PATH;process.env.PATH='/jingwei-test-no-system-tools';
 try{for(const record of manifest.documents){const text=await extractPDFText(fileURLToPath(new URL(record.pdf_file,folder))),source=frozen.snapshot.documents.find((d:any)=>d.url===record.url),pdf=record.downloads.find((d:any)=>d.file===record.pdf_file),document=parseFundDocumentBody(source,text,{url:pdf.url,sha256:pdf.sha256});assert.equal(document.body!.page_count,record.pages);assert.match(text,/沪深\s*300/);assert.ok(document.body!.fragment_pages.every(p=>p.every(n=>n>0&&n<=record.pages)));if(document.body!.kind==='interim'){assert.equal(document.body!.facts.period_return_pct!.value,record.code==='007339'?8.17:7.91);assert.ok(document.body!.fragment_pages[document.body!.facts.period_return_pct!.fragment_index].includes(8));const withBlank=parseFundDocumentBody(source,'\f'+text,{url:pdf.url,sha256:pdf.sha256});assert.equal(withBlank.body!.page_count,record.pages+1);assert.ok(withBlank.body!.fragment_pages[withBlank.body!.facts.period_return_pct!.fragment_index].includes(9));}else assert.equal(document.body!.facts.service_pct!.value,record.code==='007339'?0.2:0.3);}}
 finally{process.env.PATH=pathBefore;}
});
test('无文字图像PDF与损坏文件明确不能读取，保留空白页的真实编号',async()=>{
 await assert.rejects(extractPDFText(fileURLToPath(new URL('./fixtures/pdf/image-only.pdf',import.meta.url))),/pdf_text_missing/);
 const dir=await mkdtemp(join(tmpdir(),'jingwei-broken-pdf-'));try{const file=join(dir,'bad.pdf');await writeFile(file,'%PDF-1.7\ncorrupted\n%%EOF');await assert.rejects(extractPDFText(file),/pdf_body_unreadable/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('官方PDF传输中断后按实体校验续传，响应改变时完整重取而不拼接旧字节',async()=>{
 const bytes=new Uint8Array(await readFile(new URL(manifest.documents[1].pdf_file,folder))),dir=await mkdtemp(join(tmpdir(),'jingwei-resume-pdf-')),url=manifest.documents[1].url;
 try{let pull=0;await assert.rejects(downloadOfficialPDF(url,dir,async()=>new Response(new ReadableStream({pull(controller){if(pull++===0)controller.enqueue(bytes.slice(0,100));else controller.error(new Error('isolated_connection_dropped'));}}),{headers:{etag:'"official-v1"','content-length':String(bytes.length)}})),/isolated_connection_dropped/);
 let resumed=false;const actual=await downloadOfficialPDF(url,dir,async(_,init)=>{const headers=new Headers(init?.headers);assert.equal(headers.get('range'),'bytes=100-');assert.equal(headers.get('if-range'),'"official-v1"');resumed=true;return new Response(bytes.slice(100),{status:206,headers:{etag:'"official-v1"','content-range':`bytes 100-${bytes.length-1}/${bytes.length}`}});});assert(resumed);assert.deepEqual(actual,bytes);
 pull=0;await assert.rejects(downloadOfficialPDF(url,dir,async()=>new Response(new ReadableStream({pull(controller){if(pull++===0)controller.enqueue(bytes.slice(0,100));else controller.error(new Error('drop'));}}),{headers:{etag:'"v1"','content-length':String(bytes.length)}})));
 const restarted=await downloadOfficialPDF(url,dir,async()=>new Response(bytes,{headers:{etag:'"v2"','content-length':String(bytes.length)}}));assert.equal(createHash('sha256').update(restarted).digest('hex'),manifest.documents[1].downloads[0].sha256);
 }finally{await rm(dir,{recursive:true,force:true});}
});
