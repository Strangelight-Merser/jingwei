import {createHash} from 'node:crypto';
import type {MarketEvidence} from '../contracts/types.ts';
import type {OtherDirectionEvidence} from '../contracts/research.ts';

const base='https://www.csindex.com.cn/csindex-home';
export const marketValuationURL=`${base}/data-service/indexValuation`;
export type MarketDay={date:string;open:number;high:number;low:number;close:number;price_change:number;price_change_pct:number;pe_ttm:number};
export type MarketSnapshot={
 index_code:'000300';index_name:'沪深300';checked_at:string;as_of:string;close:number;
 valuation:{as_of:string;pe_static:number;pe_ttm:number;pb:number;dividend_yield_pct:number;prior_year_end:{pe_static:number;pe_ttm:number;pb:number}};
 daily:MarketDay[];sources:{kind:'valuation'|'daily'|'daily_valuation';url:string;as_of:string}[];warnings:string[];hash:string;
};
type Raw={valuation:unknown;daily:unknown;daily_valuation:unknown};
type ParseOptions={checked_at:string;end_date:string;source_urls:{valuation:string;daily:string;daily_valuation:string}};
export type IndexIdentity={code:string;name:string;name_en:string;direction_key:string};
export type IndexMarketSnapshot=Omit<MarketSnapshot,'index_code'|'index_name'>&{index_code:string;index_name:string};
export const csi500Identity:IndexIdentity={code:'000905',name:'中证500',name_en:'CSI 500',direction_key:'csi500'};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('market_source_structure_changed');return v as Record<string,unknown>;};
const payload=(v:unknown)=>{const p=object(v);if(p.code!=='200'||p.data===undefined)throw new Error('market_source_unsuccessful');return p.data;};
const number=(v:unknown,positive=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||(positive&&v<=0))throw new Error('market_numeric_field_missing');return v;};
function date(v:unknown){
 if(typeof v!=='string')throw new Error('market_date_missing');
 const compact=v.replaceAll('-','');if(!/^\d{8}$/.test(compact))throw new Error('market_date_invalid');
 const iso=`${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6)}`;
 const parsed=new Date(`${iso}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw new Error('market_date_invalid');return iso;
}
function rows(v:unknown){if(!Array.isArray(v)||!v.length)throw new Error('market_daily_missing');return v.map(object);}
function datedRows(v:unknown,end:string):Array<Record<string,unknown>&{date:string}>{
 const seen=new Set<string>();return rows(v).map(r=>{const d=date(r.tradeDate);if(d>end)throw new Error('market_future_data');if(seen.has(d))throw new Error('market_duplicate_date');seen.add(d);return {...r,date:d};});
}

// CSI's field "peg" is displayed as PETTM/滚动市盈率, not a growth-adjusted PEG ratio.
// A source update is evidence for reassessment; this collector defines no buy/sell threshold.
export function parseMarketSnapshot(raw:Raw,options:ParseOptions):MarketSnapshot{
 return parseIndexMarketSnapshot(raw,options,{code:'000300',name:'沪深300',name_en:'CSI 300',direction_key:'csi300'}) as MarketSnapshot;
}
export function parseIndexMarketSnapshot(raw:Raw,options:ParseOptions,identity:IndexIdentity):IndexMarketSnapshot{
 const end=date(options.end_date),data=object(payload(raw.valuation));
 const valuationRows=rows(data.indexValuations).filter(r=>r.indexName===identity.name&&r.indexNameEn===identity.name_en);
 if(valuationRows.length!==1)throw new Error('market_index_identity_missing');
 const val=valuationRows[0],as_of=date(data.tradeDate);if(as_of>end||date(val.tradeDate)!==as_of)throw new Error('market_valuation_date_invalid');
 const prices=datedRows(payload(raw.daily),end).sort((a,b)=>a.date.localeCompare(b.date));
 const valuations=datedRows(payload(raw.daily_valuation),end);
 const peByDate=new Map(valuations.map(r=>{
  if(r.indexName!==identity.name||r.indexNameEn!==identity.name_en)throw new Error('market_index_identity_missing');
  return [r.date,number(r.peg,true)] as const;
 }));
 const daily=prices.map(r=>{
  if(r.indexCode!==identity.code)throw new Error('market_index_identity_missing');
  const pe_ttm=number(r.peg,true),other=peByDate.get(r.date);if(other===undefined||other!==pe_ttm)throw new Error('market_pe_date_or_value_mismatch');
  const row:MarketDay={date:r.date,open:number(r.open,true),high:number(r.high,true),low:number(r.low,true),close:number(r.close,true),price_change:number(r.change),price_change_pct:number(r.changePct),pe_ttm};
  if(row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close))throw new Error('market_ohlc_invalid');return row;
 }).slice(-20);
 const latest=daily.at(-1)!;
 const valuation:MarketSnapshot['valuation']={as_of,pe_static:number(val.pe,true),pe_ttm:number(val.peg,true),pb:number(val.pb,true),dividend_yield_pct:number(val.dp),prior_year_end:{pe_static:number(val.peLastYear,true),pe_ttm:number(val.pegLastYear,true),pb:number(val.pbLastYear,true)}};
 if(valuation.dividend_yield_pct<0)throw new Error('market_numeric_field_missing');
 if(latest.date!==as_of)throw new Error('market_price_valuation_date_mismatch');
 if(latest.pe_ttm!==valuation.pe_ttm)throw new Error('market_latest_pe_mismatch');
 const warnings:string[]=[];
 if(daily.length<20)warnings.push(`market_daily_insufficient:${daily.length}/20`);
 if(valuations.some(r=>!prices.some(p=>p.date===r.date)))warnings.push('market_nontrading_valuation_rows_excluded');
 const canonical={index_code:identity.code,index_name:identity.name,as_of,close:latest.close,valuation,daily};
 return {...canonical,checked_at:options.checked_at,sources:([['valuation',as_of],['daily',latest.date],['daily_valuation',latest.date]] as const).map(([kind,sourceDate])=>({kind,url:options.source_urls[kind],as_of:sourceDate})),warnings,hash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
}

export async function collectMarketSnapshot(options:{now?:Date;end_date?:string;fetcher?:typeof fetch}={}):Promise<MarketSnapshot>{
 return collectIndexMarketSnapshot({code:'000300',name:'沪深300',name_en:'CSI 300',direction_key:'csi300'},options) as Promise<MarketSnapshot>;
}
export async function collectIndexMarketSnapshot(identity:IndexIdentity,options:{now?:Date;end_date?:string;fetcher?:typeof fetch}={}):Promise<IndexMarketSnapshot>{
 const now=options.now??new Date();if(!Number.isFinite(now.getTime()))throw new Error('market_date_invalid');
 // Date boundary belongs to mainland market time, even if the machine is in UTC.
 const end=date(options.end_date??new Date(now.getTime()+8*60*60*1000).toISOString().slice(0,10));
 const start=new Date(`${end}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-60);
 const query=new URLSearchParams({indexCode:identity.code,startDate:start.toISOString().slice(0,10).replaceAll('-',''),endDate:end.replaceAll('-','')});
 const source_urls={valuation:marketValuationURL,daily:`${base}/perf/index-perf?${query}`,daily_valuation:`${base}/perf/indexCsiDsPe?${query}`};
 const fetcher=options.fetcher??fetch;
 const get=async(url:string)=>{
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'JingweiResearch/0.1'}});
  if(!response.ok)throw new Error(`market_source_http_${response.status}`);
  if(response.url&&new URL(response.url).hostname!=='www.csindex.com.cn')throw new Error('market_unexpected_source_redirect');
  try{return JSON.parse(await response.text()) as unknown;}catch{throw new Error('market_source_json_invalid');}
 };
 const [valuation,daily,daily_valuation]=await Promise.all([get(source_urls.valuation),get(source_urls.daily),get(source_urls.daily_valuation)]);
 return parseIndexMarketSnapshot({valuation,daily,daily_valuation},{checked_at:now.toISOString(),end_date:end,source_urls},identity);
}

export function toOtherDirectionEvidence(snapshot:IndexMarketSnapshot,identity:IndexIdentity):OtherDirectionEvidence{
 if(snapshot.index_code!==identity.code||snapshot.index_name!==identity.name)throw new Error('market_index_identity_missing');
 const ref={article_id:`market-${identity.direction_key}-${snapshot.as_of}-${snapshot.hash.slice(0,12)}`,revision:1,source:`中证指数 · ${snapshot.index_name}官方行情与估值`,url:marketValuationURL,published_at:'',checked_at:snapshot.checked_at,data_as_of:snapshot.as_of,fragments:[`数据截至${snapshot.as_of}：${snapshot.index_name}（${snapshot.index_code}）价格指数收盘${snapshot.close}点；滚动市盈率${snapshot.valuation.pe_ttm}倍，市净率${snapshot.valuation.pb}倍，股息率${snapshot.valuation.dividend_yield_pct}%。这份资料只覆盖价格与估值；不含基金条款、盈利预测或长期历史分位。`,...snapshot.sources.map(s=>`${s.kind}原始查询：${s.url}`)]};
 return {direction_key:identity.direction_key,index_code:snapshot.index_code,index_name:snapshot.index_name,as_of:snapshot.as_of,checked_at:snapshot.checked_at,close:snapshot.close,pe_ttm:snapshot.valuation.pe_ttm,pb:snapshot.valuation.pb,dividend_yield_pct:snapshot.valuation.dividend_yield_pct,daily:snapshot.daily.map(r=>({date:r.date,close:r.close})),ref,coverage:'price_and_valuation_only'};
}

export function toMarketEvidence(snapshot:MarketSnapshot):MarketEvidence{
 return {as_of:snapshot.as_of,close:snapshot.close,pe_ttm:snapshot.valuation.pe_ttm,pb:snapshot.valuation.pb,dividend_yield:snapshot.valuation.dividend_yield_pct,previous_year_end:{pe_ttm:snapshot.valuation.prior_year_end.pe_ttm,pb:snapshot.valuation.prior_year_end.pb},daily:snapshot.daily.map(r=>({date:r.date,close:r.close})),source:{article_id:`market-csi300-${snapshot.as_of}-${snapshot.hash.slice(0,12)}`,revision:1,source:'中证指数 · 沪深300官方行情与估值',url:'https://www.csindex.com.cn/mobile-web/#/dataService/indexDashboard',published_at:'',checked_at:snapshot.checked_at,data_as_of:snapshot.as_of,fragments:[`数据截至${snapshot.as_of}：沪深300价格指数收盘${snapshot.close}点；滚动市盈率${snapshot.valuation.pe_ttm}倍，市净率${snapshot.valuation.pb}倍，股息率${snapshot.valuation.dividend_yield_pct}%。`,`官网去年底对照：滚动市盈率${snapshot.valuation.prior_year_end.pe_ttm}倍，市净率${snapshot.valuation.prior_year_end.pb}倍。股息率不等于未来基金回报。`,...snapshot.sources.map(s=>`${s.kind}原始查询：${s.url}`)]}};
}
