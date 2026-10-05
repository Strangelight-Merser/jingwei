import {load} from 'cheerio';
import type {SourceRef} from '../contracts/types.ts';
import type {FundCode,FundField,FundSnapshot} from './fund-updates.ts';
import {normalizeFundValue} from './fund-updates.ts';
import {readState} from './storage.ts';
export const fundPages={ '007339':'https://www.efunds.com.cn/fund/007339.shtml', '005658':'https://www.chinaamc.com/fund/005658/jijinfeilv.shtml?source=click' };
const feeKeys={管理费:'management',基金管理费:'management',托管费:'custody',基金托管费:'custody',销售服务费:'service'} as const;
type ParsedFields=Partial<Record<FundField,string>>;
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const percent=(s:string)=>/^\d+(?:\.\d+)?%$/.test(clean(s))?clean(s):null;

// Read labeled official fee rows only. Missing or changed markup is not a zero rate.
export function parseFundPage(code:FundCode,html:string):ParsedFields{
 const $=load(html),fields:ParsedFields={};
 const feeRegion=code==='007339'?$('.feilv_content').map((_,el)=>$(el).text()).get().join('。'):$('.tit').filter((_,el)=>/管理费|销售服务费|运作费用|基金费用/.test($(el).text())).map((_,el)=>$(el).next('.liner3').text()).get().join('。');
 if(!$('body').text().includes(code))throw new Error('fund_page_identity_missing');
 if(code==='007339'){
  $('.table_feilv tr').each((_,row)=>{const label=clean($(row).find('.table_left').text());const key=feeKeys[label as keyof typeof feeKeys];const value=percent($(row).find('.table_right').text());if(key&&value)fields[key]=value;});
  const redeemRows:Record<string,string>={};$('.table_feilv tr').each((_,r)=>{const cells=$(r).find('td');const rate=percent(cells.last().text());if(rate)redeemRows[clean(cells.first().text())]=rate;});if(redeemRows['0-6']&&redeemRows['7及以上'])fields.redemption=`不足7日${redeemRows['0-6']}；满7日${parseFloat(redeemRows['7及以上'])===0?'0':redeemRows['7及以上']}`;
  $('.feilv_content').each((_,block)=>{const title=clean($(block).find('.content_title').first().text());if(title==='申购费率'&&$(block).text().includes('不收取申购费'))fields.subscription='0';if(title==='赎回费率'){const rows:Record<string,string>={};$(block).find('tr').each((_,r)=>{const cells=$(r).find('td');const rate=percent(cells.last().text());if(rate)rows[clean(cells.first().text())]=rate;});if(rows['0-6']&&rows['7及以上'])fields.redemption=`不足7日${rows['0-6']}；满7日${parseFloat(rows['7及以上'])===0?'0':rows['7及以上']}`;}});
 }else{
  $('.liner3 .li').each((_,row)=>{const label=clean($(row).find('.txt').text());const key=feeKeys[label as keyof typeof feeKeys];const value=percent($(row).find('.middle-cont .item').text());if(key&&value)fields[key]=value;});
  $('.tit').each((_,heading)=>{const title=clean($(heading).text()),block=$(heading).next('.liner3');if(title.includes('申购费率')&&/前端\s*0\.00%/.test(clean(block.text())))fields.subscription='0';if(title.includes('赎回费率')){const rows:Record<string,string>={};block.find('.li .div').each((_,r)=>{const cells=$(r).find('.item'),rate=percent(cells.last().text());if(rate)rows[clean(cells.first().text()).replaceAll(' ','')]=rate;});if(rows['持有期限<7日']&&rows['持有期限≥7日'])fields.redemption=`不足7日${rows['持有期限<7日']}；满7日${parseFloat(rows['持有期限≥7日'])===0?'0':rows['持有期限≥7日']}`;}});
  const body=clean($('body').text());if(body.includes('交易状态')&&body.includes('开放申购'))fields.trade_status='官网显示开放申购；当日赎回状态待核实';
 }
 const sentences=feeRegion.split(/[。；\n]/).map(clean).filter(t=>t.length>3&&t.length<400&&/本基金|本类|该类|C类/.test(t));
 const holding=sentences.filter(t=>/销售服务/.test(t)&&/持有/.test(t)&&/一年|1年|十二个月|12个月|365/.test(t));if(holding.length)fields.fee_holding_terms=holding.join('；');
 const channel=sentences.filter(t=>/销售服务/.test(t)&&/直销|代销|渠道|销售机构/.test(t));if(channel.length)fields.fee_channel_scope=channel.join('；');
 const effective=sentences.filter(t=>/生效|实施|调整/.test(t)&&/202\d[年\-/]/.test(t)&&/费/.test(t)&&!/本规定/.test(t));if(effective.length){const dates=effective.map(t=>t.match(/(202\d)[年\-/](\d{1,2})[月\-/](\d{1,2})日?/)).filter((m):m is RegExpMatchArray=>Boolean(m)).map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);if(new Set(dates).size===1&&dates.length===effective.length&&new Date(`${dates[0]}T00:00:00Z`).toISOString().slice(0,10)===dates[0])fields.fee_effective_from=dates[0];}
 if(!fields.management||!fields.custody||!fields.service)throw new Error('fund_fee_structure_changed');
 return fields;
}
export function parseEfundTrade(data:unknown):string{
 const d=data as {status?:number;data?:{individual?:{subscription?:boolean;redemption?:boolean;agencyName?:string;limit?:string}[]}};
 const rows=d?.data?.individual;if(d?.status!==1||!rows?.length||rows.some(r=>typeof r.subscription!=='boolean'||typeof r.redemption!=='boolean'))throw new Error('fund_trade_structure_changed');
 if(rows.every(r=>r.subscription&&r.redemption&&!r.limit))return '官网数据：申购、赎回开放；确认日以渠道开放日为准';
 return rows.map(r=>`${r.agencyName??'渠道'}：申购${r.subscription?'开放':'暂停'}、赎回${r.redemption?'开放':'暂停'}${r.limit?`，限制${r.limit}`:''}`).join('；')+'；确认日以渠道开放日为准';
}
export type FundSourceOptions={now?:Date;fetcher?:typeof fetch;priorSnapshots?:FundSnapshot[]};
export function decodeOfficial(bytes:Uint8Array):string{
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('gb18030').decode(bytes);}
}
export async function fetchFundText(url:string,fetcher:typeof fetch=fetch,body?:Record<string,unknown>){
 const response=await fetcher(url,{signal:AbortSignal.timeout(25000),method:body?'POST':'GET',headers:{'User-Agent':'JingweiResearch/0.1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(`source_http_${response.status}`);
 if(response.url&&new URL(response.url).hostname!==new URL(url).hostname)throw new Error('unexpected_source_redirect');
 return decodeOfficial(new Uint8Array(await response.arrayBuffer()));
}
/** Exact labeled source rows; no synthetic sentence is substituted for the source. */
export function fundFieldFragments(code:FundCode,html:string,field:FundField):string[]{
 const $=load(html),text=(el:Parameters<typeof $>[0])=>clean($(el).text());
 const label=Object.entries(feeKeys).filter(([,key])=>key===field).map(([name])=>name);
 if(label.length)return $(code==='007339'?'.table_feilv tr':'.liner3 .li').filter((_,el)=>label.includes(clean($(el).find(code==='007339'?'.table_left':'.txt').text()))).map((_,el)=>text(el)).get();
 if(field==='benchmark')return $('tr').filter((_,el)=>/^业绩比较基准[:：]/.test(text(el))).map((_,el)=>text(el)).get();
 const terms:Partial<Record<FundField,RegExp>>={subscription:/申购费率/,redemption:/赎回费率/,fee_holding_terms:/销售服务.*持有/,fee_channel_scope:/销售服务.*(?:直销|代销|渠道|销售机构)/,fee_effective_from:/(?:生效|实施|调整).*202\d|202\d.*(?:生效|实施|调整)/,trade_status:/交易状态/};
 const match=terms[field];if(!match)return [];
 if(code==='007339')return $('.feilv_content').filter((_,el)=>match.test(text(el))).map((_,el)=>text(el)).get().map(s=>s.slice(0,1800));
 const blocks=$('.tit').filter((_,el)=>match.test(text(el))).map((_,el)=>clean(text(el)+' '+$(el).next('.liner3').text())).get();
 return blocks.length?blocks:$('.t2,.trade-state,.transaction').filter((_,el)=>match.test(text(el))).map((_,el)=>text(el)).get();
}
export async function collectFundSnapshots(options:FundSourceOptions={}){
 const checked_at=(options.now??new Date()).toISOString();const previous=options.priorSnapshots??(await readState()).fund_observations??[];const snapshots:FundSnapshot[]=[],errors:string[]=[];
 for(const code of ['007339','005658'] as const){
  const snapshot:FundSnapshot={code,checked_at,fields:{}};
  const put=(field:FundField,value:string,fragments:string[],url:string)=>{
   if(!fragments.length){errors.push(`${code}:${field}_original_fragment_missing`);return;}
   const prior=previous.find(f=>f.code===code)?.fields[field];const unchanged=prior&&normalizeFundValue(prior.value)===normalizeFundValue(value);
   const ref:SourceRef={article_id:`fund-${code}-${field}`,revision:prior?(unchanged?prior.source.revision:prior.source.revision+1):1,source:`${code==='007339'?'易方达':'华夏'}基金 · 官方产品字段`,url,published_at:'',checked_at,fragments};snapshot.fields[field]={value,source:ref};
  };
  try{
   const html=await fetchFundText(fundPages[code],options.fetcher);const fields=parseFundPage(code,html);
   const $=load(html);const benchmark=$('tr').filter((_,el)=>/^业绩比较基准[:：]/.test(clean($(el).text()))).first();if(benchmark.length)fields.benchmark=clean(benchmark.text()).replace(/^业绩比较基准[:：]\s*/,'');
   for(const [field,value]of Object.entries(fields) as [FundField,string][]){if(code==='007339'&&field==='trade_status')continue;put(field,value,fundFieldFragments(code,html,field),fundPages[code]);}
  }catch(e){errors.push(`${code}:${e instanceof Error?e.message:'fund_source_failed'}`);}
  // Business status is an independent source. A failed fee page never suppresses it.
  if(code==='007339')try{
   const day=new Date((options.now??new Date()).getTime()+8*60*60*1000).toISOString().slice(0,10),url=`https://api.efunds.com.cn/xcowch/front/fund/tradestatus/${code}?date=${day}`;
   const raw=await fetchFundText(url,options.fetcher),data=JSON.parse(raw);put('trade_status',parseEfundTrade(data),[JSON.stringify(data)],url);
  }catch(e){errors.push(`${code}:fund_trade_unverified:${e instanceof Error?e.message:'failed'}`);}
  if(Object.keys(snapshot.fields).length)snapshots.push(snapshot);
 }
 return {snapshots,errors};
}
