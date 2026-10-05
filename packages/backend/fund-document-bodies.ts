import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,open,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {load} from 'cheerio';
import type {FundResearchDocument,FundDocumentBody} from '../contracts/research.ts';

const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const compact=(v:string)=>v.replace(/\s+/g,'').replaceAll('＋','+');
const plain=(v:string)=>v.replace(/\s+/g,' ').trim();
export function documentKind(d:FundResearchDocument):FundDocumentBody['kind']|null{
 return /中期报告/.test(d.title)?'interim':/资料概要/.test(d.title)?'summary':null;
}
/** Required coverage is the latest report and C summary, not every historical directory link. */
export function requiredFundDocuments(documents:FundResearchDocument[],codes:string[]):FundResearchDocument[]{
 return codes.flatMap(code=>(['interim','summary'] as const).flatMap(kind=>{
  const matches=documents.filter(d=>d.code===code&&documentKind(d)===kind&&(kind!=='summary'||/联接\s*C|联接[（(]C[)）]/.test(d.title)));
  const latest=matches.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.url.localeCompare(b.url))[0];return latest?[latest]:[];
 }));
}

/** Narrow, source-bound extraction. Unknown or changed layouts remain unknown. */
export function parseFundDocumentBody(document:FundResearchDocument,text:string,pdf:{url:string;sha256:string}):FundResearchDocument{
 const kind=documentKind(document);if(!kind||!['007339','005658'].includes(document.code))throw new Error('fund_document_kind_unknown');
 const rawPages=text.split('\f');if(!rawPages.at(-1)?.trim())rawPages.pop();
 const pages=rawPages.map(p=>p.split('\n').filter(line=>!/^\s*\d+\s*$/.test(line)&&!/^\d+\/\d+$/.test(compact(line))&&!/^第\d+页共\d+页$/.test(compact(line))&&!/证券投资基金联接基金20\d{2}年中期报告$/.test(compact(line))).join('\n')),all=pages.map(compact).join('');
 if(!pages.length||!all.includes(document.code)||!all.includes('沪深300')||!all.includes('联接C'))throw new Error('fund_document_identity_missing');
 const fragments:string[]=[],fragment_pages:number[][]=[];
 const add=(excerpt:string,indices:number[])=>{const index=fragments.length;fragment_pages.push(indices);fragments.push(`PDF第${indices.join('、')}页：${plain(excerpt)}`);return index;};
 const identity=pages.findIndex(p=>compact(p).includes(document.code)),identityText=plain(pages[identity]),codeAt=identityText.indexOf(document.code);add(identityText.slice(Math.max(0,codeAt-650),codeAt+180), [identity+1]);
 const facts:FundDocumentBody['facts']={};
 for(const [i,page]of pages.entries()){
  const p=compact(page).replaceAll('业绩比较基准',''),joined=p+compact(pages[i+1]??'').replaceAll('业绩比较基准',''),match=joined.match(/沪深300指数收益率×95%\+(?:活期存款利率[（(]税后[)）]×5%|1%[（(]指年收益率，评价时应按期间折算[)）])/);
  if(match){const start=joined.indexOf(match[0]),indices=start+match[0].length>p.length?[i+1,i+2]:[i+1];facts.benchmark={value:match[0],fragment_index:add(`业绩比较基准：${match[0]}`,indices)};break;}
 }
 let period:FundDocumentBody['period'];
 if(kind==='interim'){
  const reportPeriod=all.match(/本报告期自(20\d{2})年(\d{1,2})月(\d{1,2})日起至(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日止/);
  if(!reportPeriod)throw new Error('fund_report_period_missing');
  const [,year,m,d,endYear,em,ed]=reportPeriod,iso=(y:string,m:string,d:string)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  period={start:iso(year,m,d),end:iso(endYear??year,em,ed)};
  const periodPage=pages.findIndex(p=>compact(p).includes(reportPeriod[0]));add(reportPeriod[0],[periodPage+1]);
  // Select the C section before the six-month row. Never take the first A/Y table.
  for(const [i,page]of pages.entries()){
   const p=compact(page),c=p.match(/(?:易方达|华夏)沪深300ETF联接C[：:]?([^]*?)(?=(?:易方达|华夏)沪深300ETF联接Y|$)/);
   const row=c?.[1].match(/过去六个月([-+]?\d+(?:\.\d+)?)%([-+]?\d+(?:\.\d+)?)%([-+]?\d+(?:\.\d+)?)%/);
   if(row){const fragment_index=add(`C类份额，过去六个月：份额净值增长率${row[1]}%；份额净值增长率标准差${row[2]}%；业绩比较基准收益率${row[3]}%。原表片段：${c![0].slice(0,120)}；${row[0]}`,[i+1]);facts.period_return_pct={value:Number(row[1]),fragment_index};facts.benchmark_return_pct={value:Number(row[3]),fragment_index};break;}
  }
  if(!facts.period_return_pct||!facts.benchmark_return_pct)throw new Error('fund_c_performance_table_missing');
  for(const [i,page]of pages.entries()){
   const p=compact(page)+compact(pages[i+1]??''),performance=p.match(/4\.4\.2报告期内基金的业绩表现([^]*?)(?=4\.5|$)/);
   if(!performance)continue;
   const actual=performance[1].match(/年化跟踪误差(?:为)?([-+]?\d+(?:\.\d+)?)%/);
   const start=p.indexOf(performance[0]),indices=start+performance[0].length>compact(page).length?[i+1,i+2]:[i+1];
   if(actual){facts.annual_tracking_error_pct={value:Number(actual[1]),scope:'fund',fragment_index:add(performance[0],indices)};break;}
   if(/跟踪偏离度/.test(performance[1])){add(performance[0],indices);break;}
  }
 }else{
  const feePage=pages.findIndex(p=>/销售服务费/.test(p)&&/管理费/.test(p)&&/托管费/.test(p));
  if(feePage>=0){const p=compact(pages[feePage]),table=p.slice(p.indexOf('基金运作相关费用')),fragment_index=add(pages[feePage],[feePage+1]);
   for(const [key,label]of [['management_pct','管理费'],['custody_pct','托管费'],['service_pct','销售服务费']] as const){const m=table.match(new RegExp(label+'[^%]{0,110}?(\\d+(?:\\.\\d+)?)%'));if(m)facts[key]={value:Number(m[1]),fragment_index};}
   const redemption=p.match(/(?:0天<N≤6天|N<7天)[^]*?(?:0\.00%)/);if(redemption)facts.redemption_terms={value:redemption[0],fragment_index};
   if(/(?:不对基金财产中投资于目标ETF|扣除基金资产.{0,10}中目标ETF)/.test(p))facts.fee_exclusion={value:'管理费和托管费计提排除投资于目标ETF的部分。',fragment_index};
  }
  const compositePage=pages.findIndex(p=>/基金运作综合费率/.test(p)&&/最近一次基金年报/.test(p));
  if(compositePage>=0){const p=compact(pages[compositePage]),prior=compact(pages[compositePage-1]??''),m=(p.includes('基金运作综合费率（年化）')?p:prior+p).match(/基金运作综合费率[（(]年化[)）](\d+(?:\.\d+)?)%/);if(m)facts.published_operating_rate_pct={value:Number(m[1]),fragment_index:add(pages[compositePage],[compositePage+1])};}
  if(!facts.service_pct||!facts.fee_exclusion)throw new Error('fund_fee_terms_missing');
 }
 const pdf_url=new URL(pdf.url);if(pdf_url.protocol!=='https:'||!['cdn.efunds.com.cn','www.efunds.com.cn','www.chinaamc.com'].includes(pdf_url.hostname)||!/^([a-f0-9]{64})$/.test(pdf.sha256))throw new Error('fund_document_source_invalid');
 const body:FundDocumentBody={kind,read_scope:'full_text',pdf_url:pdf.url,pdf_sha256:pdf.sha256,text_sha256:sha(text),page_count:pages.length,fragment_pages,share_class:'C',facts,...(period?{period}:{})};
 return {...document,status:'read',body,body_error:undefined,ref:{...document.ref,article_id:`fund-body-${document.code}-${pdf.sha256.slice(0,16)}`,revision:1,source:`${document.code==='007339'?'易方达':'华夏'}基金 · ${kind==='interim'?'中期报告':'C类产品资料概要'}正文`,url:pdf.url,data_as_of:period?.end??document.published_at,fragments}};
}

export async function extractPDFText(path:string):Promise<string>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const packageURL=import.meta.resolve('pdfjs-dist/package.json');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./legacy/build/pdf.worker.mjs',packageURL).href;
 const task=pdfjs.getDocument({data:new Uint8Array(await readFile(path)),cMapUrl:fileURLToPath(new URL('./cmaps/',packageURL)),cMapPacked:true,standardFontDataUrl:fileURLToPath(new URL('./standard_fonts/',packageURL)),useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,useWasm:false,stopAtErrors:true,verbosity:0});
 try{
  const pdf=await task.promise,pages:string[]=[];if(pdf.numPages>300)throw new Error('fund_document_too_many_pages');
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),content=await page.getTextContent();
   const items=content.items.filter((i):i is import('pdfjs-dist/types/src/display/api.js').TextItem=>'str' in i&&!!i.str.trim()).sort((a,b)=>Math.abs(a.transform[5]-b.transform[5])>2?b.transform[5]-a.transform[5]:a.transform[4]-b.transform[4]);
   let lineY:number|null=null,text='';for(const item of items){const y=item.transform[5];text+=(lineY!==null&&Math.abs(y-lineY)>2?'\n':text?' ':'')+item.str;lineY=y;}
   pages.push(text);page.cleanup();
  }
  if(pages.join('').replace(/\s/g,'').length<20)throw new Error('pdf_text_missing');
  return pages.join('\f')+'\f';
 }catch(e){if(e instanceof Error&&e.message==='pdf_text_missing')throw e;throw new Error('pdf_body_unreadable');}
 finally{await task.destroy();}
}
/** Slow official PDFs can continue at the next free check, with an HTTP entity validator. */
export async function downloadOfficialPDF(url:string,archive:string,fetcher:typeof fetch=fetch):Promise<Uint8Array>{
 await mkdir(archive,{recursive:true});const stem=join(archive,sha(url)),partial=stem+'.partial',metaPath=stem+'.download.json';
 let saved:{validator:string;total:number}|null=await readFile(metaPath,'utf8').then(s=>JSON.parse(s)).catch(()=>null),offset=await stat(partial).then(s=>s.size).catch(()=>0);
 if(offset&&(!saved?.validator||offset>saved.total)){await rm(partial,{force:true});offset=0;saved=null;}
 const response=await fetcher(url,{signal:AbortSignal.timeout(90000),headers:offset?{Range:`bytes=${offset}-`,'If-Range':saved!.validator}:{}});
 const final=new URL(response.url||url);if(final.protocol!=='https:'||!['cdn.efunds.com.cn','www.efunds.com.cn','www.chinaamc.com'].includes(final.hostname))throw new Error('fund_document_redirect_invalid');
 if(response.status!==200&&response.status!==206){if(response.status===416){await rm(partial,{force:true});await rm(metaPath,{force:true});}throw new Error(`fund_document_http_${response.status}`);}
 const range=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/),validator=response.headers.get('etag')??response.headers.get('last-modified')??'';
 if(response.status===206&&(!range||Number(range[1])!==offset||Number(range[2])<offset||saved&&saved.validator!==validator))throw new Error('fund_document_resume_mismatch');
 if(response.status===200)offset=0;
 const total=response.status===206?Number(range![3]):Number(response.headers.get('content-length')??0);if(total>8*1024*1024)throw new Error('fund_document_pdf_invalid');
 await writeFile(metaPath,JSON.stringify({validator,total}));const file=await open(partial,offset?'a':'w');let size=offset;
 try{if(!response.body)throw new Error('fund_document_body_missing');for await(const chunk of response.body){size+=chunk.byteLength;if(size>8*1024*1024)throw new Error('fund_document_pdf_invalid');await file.write(chunk);}}
 finally{await file.close();}
 if(total&&size!==total)throw new Error('fund_document_download_incomplete');
 const bytes=new Uint8Array(await readFile(partial));if(Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-'||!Buffer.from(bytes.subarray(Math.max(0,bytes.length-2048))).toString().includes('%%EOF')){await rm(partial,{force:true});await rm(metaPath,{force:true});throw new Error('fund_document_pdf_invalid');}
 await rm(partial,{force:true});await rm(metaPath,{force:true});return bytes;
}
export async function readFundDocument(document:FundResearchDocument,options:{fetcher?:typeof fetch;archive_dir:string;extractor?:(path:string)=>Promise<string>;previous?:FundResearchDocument}):Promise<FundResearchDocument>{
 const fetcher=options.fetcher??fetch;
 async function get(url:string){const r=await fetcher(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`fund_document_http_${r.status}`);const final=new URL(r.url||url);if(!['cdn.efunds.com.cn','www.efunds.com.cn','www.chinaamc.com'].includes(final.hostname))throw new Error('fund_document_redirect_invalid');return r;}
 let pdfURL=document.url;
 if(!/\.pdf(?:\?|$)/.test(pdfURL)){
  const $=load(await(await get(document.url)).text()),links=$('a[href]').toArray().map(el=>new URL($(el).attr('href')!,document.url)).filter(u=>u.protocol==='https:'&&['www.chinaamc.com','cdn.efunds.com.cn','www.efunds.com.cn'].includes(u.hostname)&&/\.pdf(?:\?|$)/.test(u.href));
  if(links.length!==1)throw new Error('fund_document_pdf_link_ambiguous');pdfURL=links[0].href;
 }
 const bytes=await downloadOfficialPDF(pdfURL,options.archive_dir,fetcher);
 const hash=sha(bytes);await mkdir(options.archive_dir,{recursive:true});const path=join(options.archive_dir,hash+'.pdf');await writeFile(path,bytes);
 if(options.previous?.status==='read'&&options.previous.body?.pdf_sha256===hash)return {...structuredClone(options.previous),ref:{...options.previous.ref,checked_at:document.ref.checked_at}};
 const text=await(options.extractor??extractPDFText)(path);await writeFile(join(options.archive_dir,hash+'.txt'),text);
 return parseFundDocumentBody(document,text,{url:pdfURL,sha256:hash});
}
