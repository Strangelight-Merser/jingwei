import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {load} from 'cheerio';
import type {SourceRef} from '../contracts/types.ts';
import type {FundCode,FundSnapshot} from './fund-updates.ts';
import {collectFundSnapshots,fetchFundText,fundPages} from './fund-sources.ts';
import {collectMarketSnapshot,toMarketEvidence,collectIndexMarketSnapshot,csi500Identity,toOtherDirectionEvidence,type MarketSnapshot} from './market-sources.ts';
import {storageConfiguration} from './storage.ts';
import type {FundResearchDocument,OtherDirectionEvidence} from '../contracts/research.ts';
import {requiredFundDocuments,readFundDocument} from './fund-document-bodies.ts';

export type FundSeries={code:FundCode;nav:{date:string;nav:number;accumulated_nav?:number}[];ref:SourceRef};
export type FundDocument=FundResearchDocument;
export type ResearchEvidence={refs:SourceRef[];funds:FundSnapshot[];market:MarketSnapshot|null;errors:string[];captured_at:string;fund_series:FundSeries[];documents:FundDocument[];other_directions?:OtherDirectionEvidence[];valuation_rule?:import('../contracts/research.ts').ValuationRuleEvidence};
export type ResearchEvidenceOptions={now?:Date;fetcher?:typeof fetch;archive_dir?:string;priorSnapshots?:FundSnapshot[];priorDocuments?:FundDocument[];pdfExtractor?:(path:string)=>Promise<string>};
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
function isoDate(v:unknown,end:string){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v||v>end)throw new Error('fund_nav_date_invalid');return v;
}
function positive(v:unknown){if((typeof v!=='string'&&typeof v!=='number')||!String(v).trim()||!Number.isFinite(Number(v))||Number(v)<=0)throw new Error('fund_nav_value_missing');return Number(v);}
/** Official JSON only, never evaluate the site's JavaScript. Preserve dates, gaps and distinct NAV concepts. */
export function parseFundSeries(code:FundCode,raw:unknown,end:string):FundSeries['nav']{
 const r=raw as Record<string,any>;let items:{date:unknown;nav:unknown;accumulated_nav?:unknown}[];
 if(code==='007339'){
  if(r?.status!==1||!Array.isArray(r.data?.data)||!r.data.data.length)throw new Error('fund_nav_structure_changed');
  if(r.data.data.some((x:Record<string,unknown>)=>typeof x.shortName!=='string'||!x.shortName.includes('沪深300')||!x.shortName.includes('C')))throw new Error('fund_nav_identity_missing');
  items=r.data.data.map((x:Record<string,unknown>)=>({date:x.navDate,nav:x.netValue,accumulated_nav:x.totalNetValue}));
 }else{
  if(!Array.isArray(r?.ShowData)||!r.ShowData.length||!Array.isArray(r.danweijingzhiName)||!Array.isArray(r.leijiJingzhiName)||r.ShowData.length!==r.danweijingzhiName.length||r.ShowData.length!==r.leijiJingzhiName.length)throw new Error('fund_nav_structure_changed');
  items=r.ShowData.map((date:string,i:number)=>({date,nav:r.danweijingzhiName[i],accumulated_nav:r.leijiJingzhiName[i]}));
 }
 const seen=new Set<string>();return items.map(x=>{const date=isoDate(x.date,end);if(seen.has(date))throw new Error('fund_nav_duplicate_date');seen.add(date);return {date,nav:positive(x.nav),...(x.accumulated_nav!==undefined?{accumulated_nav:positive(x.accumulated_nav)}:{})};}).sort((a,b)=>a.date.localeCompare(b.date)).slice(-150);
}
function navRef(code:FundCode,nav:FundSeries['nav'],url:string,checked_at:string):SourceRef{
 const latest=nav.at(-1)!;return {article_id:`fund-nav-${code}-${hash(JSON.stringify(nav)).slice(0,16)}`,revision:1,source:`${code==='007339'?'易方达':'华夏'}基金 · 官方净值`,url,published_at:'',checked_at,data_as_of:latest.date,display_fragments:[`本次取得的净值记录截至${latest.date}。单位净值变化不等于含分红再投资收益。`,...nav.slice(-3).map(row=>`${row.date}：单位净值${row.nav}${row.accumulated_nav!==undefined?`，累计净值${row.accumulated_nav}`:''}。`)],fragments:[`官网净值字段，${code}；单位净值为nav，累计净值为accumulated_nav，二者不是现金分红再投资收益指数。`,JSON.stringify(nav)]};
}
/** Link discovery is deliberately distinguished from having read a report's contents. */
export function parseFundDocuments(code:FundCode,html:string,pageURL:string,checked_at:string):FundDocument[]{
 const $=load(html),result:FundDocument[]=[];
 $('a[href]').each((_,el)=>{const title=clean($(el).text()),href=$(el).attr('href');if(!href||!/(?:报告|资料概要|费率|销售服务费|费用调整)/.test(title))return;
  let url:URL;try{url=new URL(href,pageURL);}catch{return;}
  if(url.protocol!=='https:'||!(code==='007339'?['www.efunds.com.cn','cdn.efunds.com.cn']:['www.chinaamc.com']).includes(url.hostname)||!/(?:\.pdf|\.shtml)(?:\?|$)/.test(url.href))return;
  const nearby=clean($(el).closest('.li,tr').text()),match=nearby.match(/(20\d{2}-\d{2}-\d{2})/)??url.pathname.match(/(20\d{2})-(\d{2})-(\d{2})/);let published_at='';
  if(match)published_at=match.length===2?match[1]:`${match[1]}-${match[2]}-${match[3]}`;
  if(!published_at){const compact=url.pathname.match(/\/(20\d{6})\//);if(compact)published_at=`${compact[1].slice(0,4)}-${compact[1].slice(4,6)}-${compact[1].slice(6)}`;}
  if(result.some(x=>x.url===url.href))return;
  result.push({code,title,url:url.href,published_at,status:'discovered',ref:{article_id:`fund-document-${code}-${hash(url.href).slice(0,16)}`,revision:1,source:`${code==='007339'?'易方达':'华夏'}基金 · 官方披露目录（尚未读取正文）`,url:pageURL,published_at,checked_at,fragments:[`${title}；原网页链接：${url.href}${published_at?`；目录公布日期：${published_at}`:''}。此证据仅证明官网列出该文件，不证明报告中的指标。`]}});
 });return result.slice(0,12);
}

/** All sources settle independently. Raw public responses are saved outside the content store. */
export async function collectResearchEvidence(options:ResearchEvidenceOptions={}):Promise<ResearchEvidence>{
 const now=options.now??new Date(),captured_at=now.toISOString(),end=new Date(now.getTime()+8*60*60*1000).toISOString().slice(0,10);
 const archive=options.archive_dir??join(storageConfiguration().dataDir,'evidence','fund-research');await mkdir(archive,{recursive:true});
 const baseFetcher=options.fetcher??fetch,cache=new Map<string,Promise<Response>>();const captured:{url:string;method:string;request_body:string|null;status:number;sha256:string;bytes:number;file:string}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input),key=(init?.method??'GET')+' '+url+' '+(init?.body??'');let pending=cache.get(key);
  if(!pending){pending=(async()=>{let response:Response;try{response=await baseFetcher(input,init);}catch{response=await baseFetcher(input,init);}
   if(response.url&&new URL(response.url).hostname!==new URL(url).hostname)throw new Error('unexpected_source_redirect');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw new Error('fund_source_too_large');const sha256=hash(bytes),file=sha256+'.raw';await writeFile(join(archive,file),bytes);captured.push({url,method:init?.method??'GET',request_body:typeof init?.body==='string'?init.body:null,status:response.status,sha256,bytes:bytes.length,file});const copy=new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});Object.defineProperty(copy,'url',{value:response.url});return copy;})();cache.set(key,pending);}
  return (await pending).clone();
 };
 const errors:string[]=[],fund_series:FundSeries[]=[],documents:FundDocument[]=[],other_directions:OtherDirectionEvidence[]=[];
 const sourceTasks=[
  (async()=>{try{return await collectFundSnapshots({now,fetcher,priorSnapshots:options.priorSnapshots});}catch(e){errors.push(`fund_fields:${e instanceof Error?e.message:'failed'}`);return {snapshots:[],errors:[]};}})(),
  (async()=>{try{return await collectMarketSnapshot({now,fetcher});}catch(e){errors.push(`csi300:${e instanceof Error?e.message:'failed'}`);return null;}})(),
  ...(['007339','005658'] as const).map(async code=>{
   const pageURL=code==='007339'?fundPages[code]:'https://www.chinaamc.com/fund/005658/index.shtml';
   try{
    const html=await fetchFundText(pageURL,fetcher);if(!html.includes(code))throw new Error('fund_page_identity_missing');
    if(code==='007339')documents.push(...parseFundDocuments(code,html,pageURL,captured_at));
    // Product page also provides one dated NAV if the history API is unavailable.
    if(code==='007339'){
     const $=load(html),nav=[{date:isoDate(clean($('.nav-update').first().text()),end),nav:positive(clean($('#net-today').text())),accumulated_nav:positive(clean($('#net-totsl').text()))}];
     fund_series.push({code,nav,ref:navRef(code,nav,pageURL,captured_at)});
    }else{
     const $=load(html),nav:FundSeries['nav']=[];$('.table2 .tb .tr').each((_,el)=>{const cells=$(el).find('.td');if(cells.length!==3)return;nav.push({date:isoDate(clean(cells.eq(0).text()),end),nav:positive(clean(cells.eq(1).text())),accumulated_nav:positive(clean(cells.eq(2).text()))});});
     if(nav.length){nav.sort((a,b)=>a.date.localeCompare(b.date));fund_series.push({code,nav,ref:navRef(code,nav,pageURL,captured_at)});}
    }
   }catch(e){errors.push(`${code}:product:${e instanceof Error?e.message:'failed'}`);}
   const url=code==='007339'?'https://api.efunds.com.cn/xcowch/front/fund/nav':'https://www.chinaamc.com/fund/005658/zoust_all.js';
   try{const body=code==='007339'?{fundCode:code,pageIndex:0,pageSize:150,startDate:'',endDate:end,siteID:'1'}:undefined;const nav=parseFundSeries(code,JSON.parse(await fetchFundText(url,fetcher,body)),end);const at=fund_series.findIndex(x=>x.code===code),page=at>=0?fund_series[at]:undefined;
    if(page){
     for(const row of page.nav){const other=nav.find(x=>x.date===row.date);if(other&&(other.nav!==row.nav||other.accumulated_nav!==row.accumulated_nav))throw new Error('fund_nav_source_conflict');}
     const combined=[...nav,...page.nav.filter(x=>!nav.some(r=>r.date===x.date))].sort((a,b)=>a.date.localeCompare(b.date)).slice(-150),primary=page.nav.at(-1)!.date>nav.at(-1)!.date?page.ref.url:url;
     const ref=navRef(code,combined,primary,captured_at);ref.fragments.push(`净值历史查询原址：${url}；历史响应截至${nav.at(-1)!.date}。产品页原址：${page.ref.url}；页面净值截至${page.nav.at(-1)!.date}。重合日期净值一致后合并，仅收录原文已有日期。`);
     fund_series[at]={code,nav:combined,ref};
    }else fund_series.push({code,nav,ref:navRef(code,nav,url,captured_at)});}
   catch(e){errors.push(`${code}:nav_history:${e instanceof Error?e.message:'failed'}`);}
   if(code==='005658')try{const url='https://www.chinaamc.com/product/publishGgList.do?fundcode=005658';documents.push(...parseFundDocuments(code,await fetchFundText(url,fetcher),url,captured_at));}catch(e){errors.push(`${code}:documents:${e instanceof Error?e.message:'failed'}`);}
  }),
  (async()=>{try{other_directions.push(toOtherDirectionEvidence(await collectIndexMarketSnapshot(csi500Identity,{now,fetcher}),csi500Identity));}catch(e){errors.push(`csi500:${e instanceof Error?e.message:'failed'}`);}})()
 ];
 const settled=await Promise.all(sourceTasks);const fundResult=settled[0] as Awaited<ReturnType<typeof collectFundSnapshots>>,market=settled[1] as MarketSnapshot|null;errors.push(...fundResult.errors);
 const required=requiredFundDocuments(documents,['007339','005658']);
 await Promise.all(required.map(async document=>{
  const index=documents.indexOf(document);
  // PDF bodies stream to a resumable archive; the small-JSON response cache must not buffer them first.
  try{documents[index]=await readFundDocument(document,{fetcher:baseFetcher,archive_dir:join(archive,'documents'),extractor:options.pdfExtractor,previous:options.priorDocuments?.find(d=>d.url===document.url)});}
  catch(e){const error=e instanceof Error?e.message:'failed';documents[index]={...document,body_error:error};errors.push(`${document.code}:${/中期报告/.test(document.title)?'interim':'summary'}_body:${error}`);}
 }));
 const refs=[...fundResult.snapshots.flatMap(x=>Object.values(x.fields).flatMap(f=>f?[f.source]:[])),...fund_series.map(x=>x.ref),...documents.map(x=>x.ref),...other_directions.map(x=>x.ref),...(market?[toMarketEvidence(market).source]:[])];
 const result={refs,funds:fundResult.snapshots,market,errors,captured_at,fund_series,documents,other_directions};
 await writeFile(join(archive,`capture-${captured_at.replace(/[:.]/g,'-')}.json`),JSON.stringify({captured_at,captured,errors,coverage:{funds:result.funds.map(x=>({code:x.code,fields:Object.keys(x.fields)})),series:fund_series.map(x=>({code:x.code,rows:x.nav.length,as_of:x.ref.data_as_of})),documents:documents.length,market_as_of:market?.as_of??null}},null,2));
 return result;
}
