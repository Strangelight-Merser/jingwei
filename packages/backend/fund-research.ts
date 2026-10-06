import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FinanceVersion,OperationView,SourceRef} from '../contracts/types.ts';
import type {ResearchSnapshot,ResearchDecision,ResearchEvaluation,ResearchScope,ResearchConditionCheck,FundNavSeries,FundResearchDocument,OtherDirectionEvidence,ValuationRuleEvidence} from '../contracts/research.ts';
import {stableJson,sha256} from './identity.ts';
import {outputSchema,acceptComposition} from './finance.ts';
import {FUND_STORY_ID,normalizeFundValue,type FundSnapshot} from './fund-updates.ts';
import {toMarketEvidence,type MarketSnapshot} from './market-sources.ts';
import {composeWithDeepSeekPrompt} from './model.ts';
import {requiredFundDocuments} from './fund-document-bodies.ts';

export type {ResearchSnapshot,ResearchDecision,ResearchEvaluation} from '../contracts/research.ts';
export type ResearchEvidence = {captured_at:string;refs:SourceRef[];funds:FundSnapshot[];market:MarketSnapshot|null;errors:string[];fund_series?:FundNavSeries[];documents?:FundResearchDocument[];other_directions?:OtherDirectionEvidence[];valuation_rule?:ValuationRuleEvidence};
const scopes=['direction','comparison','new_money','held','sell'] as const;
const checks=['valuation_band','market_available','market_changed','fee_comparison_available','trade_status_verified','trade_restriction','fee_terms_changed','fund_facts_changed','fee_scope_verified','tracking_available','document_body_read','user_plan_known'] as const;
const binding=z.object({article_id:z.string(),fragment_index:z.number().int().min(0)});
const position=z.object({stance:z.enum(['conditional_add','maintain_plan','conditional_reduce','observe','not_assessable']),summary:z.string().min(10),conditions:z.array(z.string()).min(1),refs:z.array(z.string())});
export const researchDecisionSchema=z.object({
 evaluated_at:z.string(),evidence_hash:z.string(),data_status:z.enum(['sufficient','partial','insufficient']),
 coverage:z.object({direction_key:z.literal('csi300'),label:z.string(),direction_selection_supported:z.literal(false),fund_codes:z.array(z.string())}),
 direction:z.object({summary:z.string().min(10),why:z.array(z.string()).min(1),refs:z.array(z.string())}),
 candidates:z.array(z.object({code:z.string(),summary:z.string().min(5),differences:z.array(z.string()),refs:z.array(z.string())})),
 new_money:position,held:position,
 conditions:z.array(z.object({key:z.string().regex(/^[a-z0-9_-]+$/),label:z.string().min(2),scope:z.enum(scopes),check:z.enum(checks),status:z.enum(['triggered','not_triggered','not_assessable']),explanation:z.string().min(5),refs:z.array(binding),rule:z.object({metric:z.string(),operator:z.enum(['gt','gte','lt','lte','eq']),value:z.number().finite()}).optional()})).min(1),
 impact_scope:z.array(z.enum(scopes)),limitations:z.array(z.string()).min(1)
});
export const fundResearchOutputSchema=outputSchema.extend({research:researchDecisionSchema});

function usableRef(ref:SourceRef):boolean {
 return Boolean(ref.article_id&&Number.isInteger(ref.revision)&&ref.revision>0&&ref.fragments?.length&&ref.fragments.every(s=>s.trim())&&/^https?:\/\//.test(ref.url));
}
const round=(v:number)=>Number(v.toFixed(6));
const percent=(value:unknown)=>typeof value==='string'&&/^\d+(?:\.\d+)?%$/.test(value.trim())?Number.parseFloat(value):null;
const provenanceOnly=(text:string)=>/(?:原始查询：|净值历史查询原址：|产品页原址：)/.test(text);
function promptFragments(snapshot:ResearchSnapshot,ref:SourceRef){
 // Full official NAV arrays stay archived; the model receives dated, reproducible metrics and the original method fragment.
 const isNav=snapshot.fund_series?.some(s=>s.ref.article_id===ref.article_id);
 return ref.fragments.map((text,fragment_index)=>({fragment_index,text})).filter(f=>(!isNav||f.fragment_index!==1)&&!provenanceOnly(f.text));
}
function canonicalRef(ref:SourceRef){return {article_id:ref.article_id,revision:ref.revision,url:ref.url,published_at:ref.published_at,data_as_of:ref.data_as_of??'',fragments:ref.fragments.filter(text=>!provenanceOnly(text))};}
/** A stable date token for this evidence set, separate from the latest free check. */
export function researchContentSnapshot(snapshot:ResearchSnapshot):ResearchSnapshot{return {...snapshot,captured_at:snapshot.evidence_observed_at??snapshot.captured_at};}
/** The collection clock/errors do not invalidate an otherwise identical paid input. */
export function buildResearchSnapshot(evidence:ResearchEvidence):ResearchSnapshot {
 if(!Number.isFinite(Date.parse(evidence.captured_at)))throw new Error('research_capture_date_invalid');
 const mainlandDate=new Date(Date.parse(evidence.captured_at)+8*3600000).toISOString().slice(0,10);
 const refs=new Map<string,SourceRef>();
 // A discovered link is useful for collection but does not stand in for an unread document.
 const unreadIds=new Set((evidence.documents??[]).filter(d=>d.status==='discovered').map(d=>d.ref.article_id));
 for(const document of evidence.documents??[]){if(document.status!=='read')continue;const b=document.body;if(!b||b.read_scope!=='full_text'||b.share_class!=='C'||!/^([a-f0-9]{64})$/.test(b.pdf_sha256)||!/^([a-f0-9]{64})$/.test(b.text_sha256)||b.page_count<1||b.fragment_pages.length!==document.ref.fragments.length||b.fragment_pages.some(p=>!p.length||p.some(n=>!Number.isInteger(n)||n<1||n>b.page_count))||Object.values(b.facts).some(f=>!f||!document.ref.fragments[f.fragment_index]))throw new Error('research_document_body_invalid');}
 const all=[...evidence.refs.filter(r=>!unreadIds.has(r.article_id)),...evidence.funds.flatMap(f=>Object.values(f.fields).flatMap(v=>v?[v.source]:[])),...(evidence.market?[toMarketEvidence(evidence.market).source]:[]),...(evidence.fund_series??[]).map(s=>s.ref),...(evidence.documents??[]).filter(d=>d.status==='read').map(d=>d.ref),...(evidence.other_directions??[]).map(d=>d.ref),...(evidence.valuation_rule?[evidence.valuation_rule.ref]:[])];
 for(const ref of all){if(!usableRef(ref))throw new Error('research_original_evidence_required');const key=ref.article_id,old=refs.get(key);if(!old||old.revision<ref.revision)refs.set(key,structuredClone(ref));else if(old.revision===ref.revision)old.fragments=[...new Set([...old.fragments,...ref.fragments])];}
 if(new Set(evidence.funds.map(f=>f.code)).size!==evidence.funds.length)throw new Error('duplicate_fund_snapshot');
 const funds=structuredClone(evidence.funds).sort((a,b)=>a.code.localeCompare(b.code));
 const series=structuredClone(evidence.fund_series??[]).sort((a,b)=>a.code.localeCompare(b.code));
 for(const item of series){const seen=new Set<string>();for(const row of item.nav){const time=Date.parse(row.date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==row.date||!Number.isFinite(row.nav)||row.nav<=0||row.date>mainlandDate||seen.has(row.date))throw new Error('research_nav_invalid');seen.add(row.date);}item.nav.sort((a,b)=>a.date.localeCompare(b.date));}
 const documents=structuredClone(evidence.documents??[]),other=structuredClone(evidence.other_directions??[]).sort((a,b)=>a.direction_key.localeCompare(b.direction_key));
 for(const d of other){if(d.coverage!=='price_and_valuation_only'||d.as_of>mainlandDate||d.as_of!==d.ref.data_as_of||![d.close,d.pe_ttm,d.pb,d.dividend_yield_pct].every(Number.isFinite)||d.close<=0||d.pe_ttm<=0||d.pb<=0||d.dividend_yield_pct<0||d.daily.at(-1)?.date!==d.as_of||d.daily.some((row,i)=>!Number.isFinite(row.close)||row.close<=0||row.date>d.as_of||(i>0&&row.date<=d.daily[i-1].date)))throw new Error('research_other_direction_invalid');}
 const canonical={direction_key:'csi300',refs:[...refs.values()].map(canonicalRef).sort((a,b)=>a.article_id.localeCompare(b.article_id)),funds:funds.map(f=>({code:f.code,fields:Object.fromEntries(Object.entries(f.fields).sort(([a],[b])=>a.localeCompare(b)).map(([key,fact])=>[key,fact?.value]))})),market:evidence.market?{as_of:evidence.market.as_of,close:evidence.market.close,valuation:evidence.market.valuation,daily:evidence.market.daily}:null,series:series.map(s=>({code:s.code,nav:s.nav})),bodies:documents.filter(d=>d.status==='read').map(d=>({url:d.url,body:d.body})).sort((a,b)=>a.url.localeCompare(b.url)),other:other.map(({checked_at,ref,...d})=>d),rule:evidence.valuation_rule?{id:evidence.valuation_rule.rule_id,as_of:evidence.valuation_rule.as_of,band:evidence.valuation_rule.band,percentile:evidence.valuation_rule.percentile}:null};
 return {direction_key:'csi300',captured_at:evidence.captured_at,refs:[...refs.values()].sort((a,b)=>a.article_id.localeCompare(b.article_id)),funds,market:structuredClone(evidence.market),errors:[...evidence.errors],evidence_hash:sha256(stableJson(canonical)),fund_series:series,documents,other_directions:other,...(evidence.valuation_rule?{valuation_rule:structuredClone(evidence.valuation_rule)}:{})};
}

/** Evaluates available public facts, never infers risk tolerance, holdings or a buy/sell threshold. */
export function evaluateResearchSnapshot(snapshot:ResearchSnapshot,previous:FinanceVersion|null=null):ResearchEvaluation {
 const metrics:ResearchEvaluation['metrics']=[],limitations:string[]=[];
 // The public rule fixes both stances; the model explains them and cannot change them.
 const rule=snapshot.valuation_rule,ruleIds=rule?[rule.ref.article_id]:[];
 if(rule){for(const [key,label,value,unit]of [['pe_ttm_percentile_10y','沪深300滚动市盈率近十年分位',rule.percentile,'%'],['rule_boundary_low_pe','偏低区边界市盈率',rule.boundaries.low,'倍'],['rule_boundary_high_pe','偏高区边界市盈率',rule.boundaries.high,'倍'],['rule_boundary_extreme_pe','高位区边界市盈率',rule.boundaries.extreme,'倍']] as const)metrics.push({key,label,value,unit,as_of:rule.as_of,refs:ruleIds});}
 const priorRule=(previous as (FinanceVersion&{research?:ResearchDecision})|null)?.research;
 const bound=(ids:string[])=>ids.flatMap(id=>snapshot.refs.some(r=>r.article_id===id)?[{article_id:id,fragment_index:0}]:[]);
 const marketRef=snapshot.market?toMarketEvidence(snapshot.market).source.article_id:null;
 const marketIds=marketRef?[marketRef]:[];
 const marketAvailable=Boolean(snapshot.market&&snapshot.market.as_of<=new Date(Date.parse(snapshot.captured_at)+8*3600000).toISOString().slice(0,10));
 if(snapshot.market){const m=snapshot.market;for(const [key,label,value,unit]of [['close','沪深300价格指数收盘',m.close,'点'],['pe_ttm','滚动市盈率',m.valuation.pe_ttm,'倍'],['pb','市净率',m.valuation.pb,'倍'],['dividend_yield_pct','股息率',m.valuation.dividend_yield_pct,'%']] as const)metrics.push({key,label,value,unit,as_of:m.as_of,refs:marketIds});
  const first=m.daily[0],last=m.daily.at(-1);if(first&&last&&first.date!==last.date)metrics.push({key:'index_window_price_change_pct',label:`价格指数${first.date}至${last.date}区间变化（不含分红）`,value:round((last.close/first.close-1)*100),unit:'%',as_of:last.date,refs:marketIds});
  limitations.push('当前和去年底估值对照不等于历史分位；价格与估值不独立支持买卖时机。',`市场事实截至${m.as_of}，核查时间不改写数据日期；未取得后续数据不能声称行情发生了新变化。`);
 }else limitations.push('未取得市场价格与估值，相关判断不能评估。');
 const feeFunds=snapshot.funds.filter(f=>percent(f.fields.service?.value)!==null);
 const feeIds=feeFunds.map(f=>f.fields.service!.source.article_id);
 for(const f of feeFunds)metrics.push({key:`${f.code}_listed_service_fee_pct`,label:`${f.code}列示销售服务年费率（非个人实际成本）`,value:percent(f.fields.service!.value)!,unit:'%/年',as_of:f.fields.document_date?String(f.fields.document_date.value):'',refs:[f.fields.service!.source.article_id]});
 if(feeFunds.length===2){const a=metrics.find(m=>m.key===`${feeFunds[0].code}_listed_service_fee_pct`)!,b=metrics.find(m=>m.key===`${feeFunds[1].code}_listed_service_fee_pct`)!;metrics.push({key:'listed_service_fee_difference_pct',label:`${feeFunds[0].code}减${feeFunds[1].code}列示销售服务年费率差`,value:round(a.value-b.value),unit:'个百分点/年',as_of:'',refs:[...a.refs,...b.refs]});}
 const scopeVerified=feeFunds.length>0&&feeFunds.every(f=>f.fields.fee_holding_terms&&f.fields.fee_channel_scope&&f.fields.fee_effective_from&&f.fields.fee_announcement);
 const trade=snapshot.funds.length>0&&snapshot.funds.every(f=>f.fields.trade_status&&f.fields.trade_status.source.checked_at===snapshot.captured_at&&!/待|未|未知/.test(String(f.fields.trade_status.value)));
 const codes=[...new Set([...snapshot.funds.map(f=>f.code),...(snapshot.fund_series??[]).map(s=>s.code)])];
 const required=requiredFundDocuments(snapshot.documents??[],codes),read=required.filter(d=>d.status==='read'&&d.body);
 const bodyComplete=codes.length>0&&required.length===codes.length*2&&read.length===required.length;
 const unreadable=required.some(d=>['pdf_text_missing','pdf_body_unreadable','fund_document_pdf_invalid'].includes(d.body_error??''));
 const reports=read.filter(d=>d.body!.kind==='interim');
 const reportAligned=reports.length===2&&reports.every(d=>d.body?.period?.start===reports[0].body?.period?.start&&d.body?.period?.end===reports[0].body?.period?.end);
 const tracking=reportAligned&&reports.every(d=>d.body?.facts.annual_tracking_error_pct?.scope==='C'&&d.body?.facts.benchmark?.value===reports[0].body?.facts.benchmark?.value);
 for(const document of reports){const b=document.body!,ids=[document.ref.article_id],as_of=b.period!.end;
  for(const [key,label]of [['period_return_pct','C类报告期净值增长率'],['benchmark_return_pct','本基金报告期业绩比较基准收益率']] as const){const fact=b.facts[key];if(fact)metrics.push({key:`${document.code}_report_${key}`,label:`${document.code} ${b.period!.start}至${as_of} ${label}`,value:fact.value,unit:'%',as_of,refs:ids});}
  if(b.facts.period_return_pct&&b.facts.benchmark_return_pct)metrics.push({key:`${document.code}_report_relative_difference_pct`,label:`${document.code}报告期净值增长率减本基金基准（非年化跟踪误差）`,value:round(b.facts.period_return_pct.value-b.facts.benchmark_return_pct.value),unit:'个百分点',as_of,refs:ids});
  if(b.facts.annual_tracking_error_pct)metrics.push({key:`${document.code}_reported_annual_tracking_error_pct`,label:`${document.code}所在基金披露的年化跟踪误差（未单列C类）`,value:b.facts.annual_tracking_error_pct.value,unit:'%',as_of,refs:ids});
 }
 if(reportAligned){const [a,b]=reports;metrics.push({key:'same_period_c_report_return_difference_pct',label:`${a.code}减${b.code}同报告期C类净值增长率差（不代表未来收益）`,value:round(a.body!.facts.period_return_pct!.value-b.body!.facts.period_return_pct!.value),unit:'个百分点',as_of:a.body!.period!.end,refs:[a.ref.article_id,b.ref.article_id]});}
 if(reports.length===2&&reports[0].body?.facts.benchmark?.value!==reports[1].body?.facts.benchmark?.value)limitations.push('两只基金业绩比较基准的现金部分口径不同；各自超基准差不能直接排名跟踪优劣，半年偏离度也不能与年化跟踪误差互比。');
 if(!scopeVerified)limitations.push('费用持有期、渠道、生效与执行公告未完整核实；列示费率不能换算个人实际总成本。');
 if(!tracking)limitations.push('尚无同份额、同区间、同基准口径的两只基金年化跟踪误差，不能据历史净值增长率排出更好工具。');
 for(const d of snapshot.other_directions??[]){if(snapshot.market?.as_of!==d.as_of){limitations.push(`${d.index_name}与沪深300资料日期未对齐，暂不作同日估值对照。`);continue;}for(const [key,label,value,unit]of [['pe_ttm','滚动市盈率',d.pe_ttm,'倍'],['pb','市净率',d.pb,'倍'],['dividend_yield_pct','股息率',d.dividend_yield_pct,'%']] as const)metrics.push({key:`${d.direction_key}_${key}`,label:`${d.index_name}${label}（仅价格与估值覆盖）`,value,unit,as_of:d.as_of,refs:[d.ref.article_id]});limitations.push(`已取得${d.index_name}价格与估值，可核查数据可得性；未取得该方向基金条款、长期盈利和估值分位，不能据此选出更优方向。`);}
 for(const series of snapshot.fund_series??[]){if(series.nav.length<2)continue;const first=series.nav[0],last=series.nav.at(-1)!,ids=[series.ref.article_id];
  metrics.push({key:`${series.code}_nav_window_change_pct`,label:`${series.code}单位净值${first.date}至${last.date}变化（非分红再投收益）`,value:round((last.nav/first.nav-1)*100),unit:'%',as_of:last.date,refs:ids});
  const returns=series.nav.slice(1).map((r,i)=>r.nav/series.nav[i].nav-1);const mean=returns.reduce((sum,v)=>sum+v,0)/returns.length;
  if(returns.length>=2)metrics.push({key:`${series.code}_nav_sample_daily_volatility_pct`,label:`${series.code}该区间相邻净值变化样本标准差（未年化）`,value:round(Math.sqrt(returns.reduce((sum,v)=>sum+(v-mean)**2,0)/(returns.length-1))*100),unit:'%',as_of:last.date,refs:ids});
  let peak=first.nav,drawdown=0;for(const row of series.nav){peak=Math.max(peak,row.nav);drawdown=Math.min(drawdown,row.nav/peak-1);}metrics.push({key:`${series.code}_nav_window_drawdown_pct`,label:`${series.code}该净值样本最大回撤（非全部历史）`,value:round(drawdown*100),unit:'%',as_of:last.date,refs:ids});
 }
 if((snapshot.fund_series??[]).length)limitations.push('指标使用未复权的单位净值；现金分红可能机械降低单位净值，并影响区间变化、波动与回撤。这些指标不是含分红总回报或分红再投收益，未据其设定买卖阈值。');
 const navSeries=(snapshot.fund_series??[]).filter(s=>s.nav.length>=2);
 if(navSeries.length===2){const [a,b]=navSeries,shared=a.nav.filter(r=>b.nav.some(q=>q.date===r.date));if(shared.length>=2){const first=shared[0],last=shared.at(-1)!,bf=b.nav.find(r=>r.date===first.date)!,bl=b.nav.find(r=>r.date===last.date)!;metrics.push({key:'same_date_nav_change_difference_pct',label:`${a.code}减${b.code}同日期${first.date}至${last.date}单位净值变化差（非含分红收益）`,value:round(((last.nav/first.nav-1)-(bl.nav/bf.nav-1))*100),unit:'个百分点',as_of:last.date,refs:[a.ref.article_id,b.ref.article_id]});}}
 const checkResult=(status:ResearchEvaluation['checks'][ResearchConditionCheck]['status'],explanation:string,ids:string[])=>({status,explanation,refs:bound(ids)});
 const priorMarket=previous?.article.operation_view?.market;const marketChanged=Boolean(snapshot.market&&priorMarket&&snapshot.market.as_of>=priorMarket.as_of&&(snapshot.market.close!==priorMarket.close||snapshot.market.valuation.pe_ttm!==priorMarket.pe_ttm||snapshot.market.valuation.pb!==priorMarket.pb));
 const factChanges=snapshot.funds.flatMap(f=>{const old=previous?.article.operation_view?.funds.find(p=>p.code===f.code);return old?Object.entries(f.fields).flatMap(([field,fact])=>fact&&field!=='document_date'&&field in old&&normalizeFundValue(fact.value)!==normalizeFundValue(old[field as keyof typeof old] as string)?[{field,ref:fact.source.article_id}]:[]):[];});
 const feeChanges=factChanges.filter(c=>['service','management','custody','subscription','redemption','fee_holding_terms','fee_channel_scope','fee_effective_from','fee_announcement'].includes(c.field));
 const tradeRefs=snapshot.funds.flatMap(f=>f.fields.trade_status?[f.fields.trade_status.source.article_id]:[]);
 const restriction=snapshot.funds.some(f=>f.fields.trade_status&&f.fields.trade_status.source.checked_at===snapshot.captured_at&&/暂停|关闭|停止|不开放|限额|限制/.test(String(f.fields.trade_status.value)));
 const checkMap:ResearchEvaluation['checks']={
  valuation_band:checkResult(!rule?'not_assessable':priorRule&&priorRule.new_money.stance===rule.new_money.stance&&priorRule.held.stance===rule.held.stance?'not_triggered':'triggered',!rule?'没有可用的估值规则结果。':`按${rule.rule_name}，当前处于${rule.band_label}：新增资金“${rule.new_money.title}”，已有持仓“${rule.held.title}”。`+(priorRule&&priorRule.new_money.stance===rule.new_money.stance&&priorRule.held.stance===rule.held.stance?'与上一版研究立场相同。':'与上一版研究立场不同，需要按规则改判。'),ruleIds),
  market_available:checkResult(marketAvailable?'not_triggered':'not_assessable',marketAvailable?'可描述原数据日期的市场事实；休市期间保留其实际日期，不能据此推出买卖时机。':'缺少有效日期的市场事实。',marketIds),
  market_changed:checkResult(!snapshot.market||!priorMarket?'not_assessable':marketChanged?'triggered':'not_triggered',!priorMarket?'没有可对齐的旧市场快照。':marketChanged?'市场事实较此前有变化，需要重评；变化不等于买卖条件触发。':'未见较此前更晚的市场数值实质变化。',marketIds),
  fee_comparison_available:checkResult(feeFunds.length===2?'not_triggered':'not_assessable',feeFunds.length===2?'可比较两只工具列示的销售服务年费率；管理与托管计提口径不直接相加，不能计算完整实际成本。':'缺少至少一只工具的列示销售服务年费率，不能作该项双工具比较。',feeIds),
  trade_status_verified:checkResult(trade?'not_triggered':'not_assessable',trade?'官网字段核实了申赎业务状态；具体渠道确认仍以开放日为准。':'至少一只工具的当前完整申赎状态未核实。',snapshot.funds.flatMap(f=>f.fields.trade_status?[f.fields.trade_status.source.article_id]:[])),
  trade_restriction:checkResult(restriction?'triggered':trade?'not_triggered':'not_assessable',restriction?'官方业务字段出现暂停或限制，影响工具可执行性；不等于市场卖出观点。':trade?'已取得的业务字段未显示暂停或限制。':'业务字段不完整，不能确定是否存在交易限制。',tradeRefs),
  fee_terms_changed:checkResult(!previous?'not_assessable':feeChanges.length?'triggered':feeIds.length?'not_triggered':'not_assessable',feeChanges.length?'列示费用或适用条款相较旧记录有变化，需要重新核查工具比较。':'仅核查已取得的费用字段；未取得条款不视作没有变化。',feeChanges.length?feeChanges.map(c=>c.ref):feeIds),
  fund_facts_changed:checkResult(!previous?'not_assessable':factChanges.length?'triggered':snapshot.funds.length?'not_triggered':'not_assessable',factChanges.length?'可对齐的产品字段较旧记录发生变化，影响对应工具研究。':'未见已取得且可对齐的产品字段有实质变化；缺项仍未知。',factChanges.length?factChanges.map(c=>c.ref):feeIds),
  fee_scope_verified:checkResult(scopeVerified?'not_triggered':'not_assessable',scopeVerified?'费用适用条款有字段及公告，需要按具体原文条件理解。':read.filter(d=>d.body?.kind==='summary').length===codes.length&&codes.length?'资料概要核实了列示费率、计提排除项与赎回持有期；销售服务费优惠的持有期、渠道及生效执行公告仍未齐全。':'费用执行渠道、持有期、生效安排或公告仍有缺项。',snapshot.funds.flatMap(f=>['fee_holding_terms','fee_channel_scope','fee_effective_from','fee_announcement'].flatMap(k=>f.fields[k as keyof typeof f.fields]?[f.fields[k as keyof typeof f.fields]!.source.article_id]:[]))),
  tracking_available:checkResult(tracking?'not_triggered':'not_assessable',tracking?'取得同份额、同区间、同基准的年化跟踪误差信息，可按报告口径核查。':reports.length?'已读取的报告提供了各自的业绩与基准；半年跟踪偏离度、基金层面年化跟踪误差和合同控制目标不能互相替代，暂不能排名跟踪优劣。':'没有完整对齐的跟踪报告，净值变化不能代替跟踪误差。',reports.map(d=>d.ref.article_id)),
  document_body_read:checkResult(bodyComplete?'not_triggered':'not_assessable',bodyComplete?'两只工具当前目录中的最新中报与C类资料概要正文已读取，报告期和条款保留原日期；正文读到不代表渠道优惠及后续执行公告已齐全。':unreadable?'部分关键文件无法读取正文（没有可识别的文字层或文件损坏），不能据此编写报告指标；其余已读资料继续保留。':read.length?`已读取${read.length}份关键披露正文，其余关键报告或C类概要尚未读到；已读字段仍可使用。`:(snapshot.documents??[]).length?'已发现披露链接，但正文尚未读取；不能据链接核实报告期、跟踪误差或费用执行条款。':'尚未取得可阅读的披露正文，不能核实报告口径。',read.map(d=>d.ref.article_id)),
  user_plan_known:checkResult('not_assessable','这是公开研究；未取得个人持有、成本、期限与原配置目标，不能判断个人加减仓或止损是否触发。',[])
 };
 const evaluability:ResearchEvaluation['evaluability']={direction:{status:marketAvailable?'partial':'not_assessable',reason:marketAvailable?'可解释沪深300已取得的市场事实；没有跨方向、盈利与长期估值证据，不能声称选出了最优方向。':'市场事实缺失，当前方向判断不能评估。',refs:marketIds},comparison:{status:feeFunds.length===2&&scopeVerified&&tracking?'assessable':snapshot.funds.length?'partial':'not_assessable',reason:'只在已有事实口径内比较工具；费用与净值差异不等于预期收益排序。',refs:feeIds},new_money:rule?{status:'assessable',reason:`公开估值规则给出新增资金立场“${rule.new_money.title}”；规则不读取个人资料。`,refs:ruleIds}:{status:'not_assessable',reason:'没有支持当前新增配置的完整方向依据与适用前提；只可解释工具和待查条件。',refs:marketIds},held:rule?{status:'assessable',reason:`公开估值规则给出已有持仓立场“${rule.held.title}”；个人仓位与期限仍由读者核对。`,refs:ruleIds}:{status:marketAvailable?'partial':'not_assessable',reason:'可说明公开材料是否影响已有计划的核查；未知个人原持有计划与资金期限，不能判定个人加减仓。',refs:marketIds},sell:{status:tradeRefs.length||feeChanges.length?'partial':'not_assessable',reason:'只可检查工具的申赎限制或已变费用条款；没有个人卖出规则，不能把工具条件或短期波动写成卖出理由。',refs:[...tradeRefs,...feeChanges.map(c=>c.ref)]}};
 limitations.push('覆盖沪深300与已获证据的联接基金，不具备跨方向筛选能力；未知持仓时不提供个性化比例。');
 if(snapshot.errors.length)limitations.push('部分公开来源本次未能完成核查；其余已取得的证据保留可用，缺项不会视作零值或没有变化。');
 const any=snapshot.refs.length>0,data_status:ResearchEvaluation['data_status']=!any?'insufficient':Object.values(evaluability).every(e=>e.status==='assessable')?'sufficient':'partial';
 return {data_status,evaluability,metrics,checks:checkMap,limitations};
}

export type FundResearchInput={snapshot:ResearchSnapshot;evaluation:ResearchEvaluation;previous:FinanceVersion|null};
export type FundResearchProvider=(input:FundResearchInput)=>Promise<unknown>;
export function fundResearchPrompt(input:FundResearchInput):string {
 input={...input,snapshot:researchContentSnapshot(input.snapshot)};
 return JSON.stringify({task:'依据公开原文和确定性指标完成沪深300基金持续研究，输出有依据的自然中文及可检查条件。',rules:[
  'snapshot.valuation_rule存在时，它是事先公开的估值规则结果：research.new_money.stance与research.held.stance必须逐字等于valuation_rule.new_money.stance与valuation_rule.held.stance；你只解释规则为何给出该立场、当前估值位置、改判边界和规则不覆盖的因素（盈利、利率、个人期限与承受能力），不得自行改变立场。conditions必须包含check=valuation_band且状态沿用evaluation。立场与previous不同时changes.kind必须为revise并说明是规则改判。',
  '只覆盖当前实际来源，不声称完成跨方向筛选。方向事实、同方向工具选择、新资金及已持有者分别解释，不编造个人期限、成本、比例、止损、目标价或收益。',
  'evaluation是确定性结果。data_status与投资立场不同。new_money/held evaluability=not_assessable时stance必须not_assessable，文字说明具体缺项并给能做的核查；不能用observe代替无法评估。非关键缺项不能抹掉可用部分。',
  'held为partial时只可not_assessable或maintain_plan；maintain_plan必须写明若已有经过考虑的原配置计划，当前材料只支持核查计划条件，不是对未知持仓的无条件持有建议；conditions至少包含check=user_plan_known且not_assessable的条件。不能凭公开短期净值或费用改出加减仓。',
  '当前/历史日期分别写清；基金净值变化不是含分红收益，现金分红可能影响未复权净值变化和回撤；样本回撤不是全部历史，不能按未验证阈值推导买卖。列示销售服务费仅作单项名义比较；ETF联接管理托管计提有排除项，不把三项相加当成本。费用低、短期收益或估值对照不能单独支持加减仓。',
  '每个段落配同顺序basis，refs定位input.snapshot.refs的article_id与fragment_index。事实数字只用片段已有数字或evaluation.metrics的可复算数，计算时注明口径。previous只作旧判断比较，不能补当前事实。',
  'research.conditions每项check逐字选evaluation.checks的键，status逐字沿用该检查状态，refs定位相应当前原文。triggered意味着对应事实变化，不等同卖出触发；sell只能陈述trade_restriction、fee_terms_changed、fund_facts_changed影响工具执行，不能据此建议卖出。个人计划条件用user_plan_known且not_assessable。存在披露目录时，conditions必须包含document_body_read，状态沿用evaluation；已读关键正文可引用，尚未读到的文件不能引用。历史目录中的旧报告未读不抹掉最新关键正文覆盖。禁止新增rule数值止损阈值。',
  '已读报告的period与share_class用于口径对齐；annual_tracking_error_pct的scope=fund不是C类专属。半年收益率差不是年化跟踪误差，合同目标不是实际值。不同业绩基准的超额差不能直接排名工具；资料概要综合运作费率是文件披露的历史测算，不等于个人全部成本。其他方向仅价格与估值可得性，不据估值高低直接推荐方向。',
  '每项结论、候选差异、条件绑定来源；来源未知留空并准确说明不能评估。不编公告内容，documents.status=discovered只代表发现链接，未读正文不能引用其标题充当分析依据。',
  'topic_key=china-equity-index，claim_key=csi300-public-fund-research，slug沿用previous.article.slug，无previous用csi300-etf-and-share-classes。related_story_ids为空；previous_claim_version_ids只可引用previous.id。',
  'previous有值时比较新证据与旧观点，实质变化才revise；supplement逐字保持旧claim；maintain不发新版。无previous用initial。正文采用普通读者能理解的中文，不介绍模型/后台/演示。',
  'research.evaluated_at= snapshot.captured_at；本请求的captured_at是这组内容首次归档时刻，不是最新网络核查或生成时刻，勿写成今日更新。刊发时由应用记录实际研究时刻。evidence_hash=snapshot.evidence_hash，coverage.fund_codes只列snapshot.funds及fund_series实际代码，direction_selection_supported=false，data_status沿用evaluation。不要输出operation_view，代码按当前事实组装。',
  '严格返回schema的article/interpretation/changes/research，所有数组返回。article至少两个段落组；direction和candidates解释当前可用事实，new_money和held分别说清尚不能评估的结论及所需证据。'
 ],schema:z.toJSONSchema(fundResearchOutputSchema),input:{evaluation:input.evaluation,snapshot:{valuation_rule:input.snapshot.valuation_rule?(({ref,...rule})=>({...rule,ref:ref.article_id}))(input.snapshot.valuation_rule):null,direction_key:input.snapshot.direction_key,captured_at:input.snapshot.captured_at,evidence_hash:input.snapshot.evidence_hash,refs:input.snapshot.refs.map(r=>({article_id:r.article_id,revision:r.revision,source:r.source,url:r.url,published_at:r.published_at,data_as_of:r.data_as_of,fragments:promptFragments(input.snapshot,r)})),funds:input.snapshot.funds.map(f=>({code:f.code,fields:Object.fromEntries(Object.entries(f.fields).sort(([a],[b])=>a.localeCompare(b)).map(([key,fact])=>[key,fact?{value:fact.value,source:{article_id:fact.source.article_id,revision:fact.source.revision}}:null]))})),fund_series:(input.snapshot.fund_series??[]).map(s=>({code:s.code,first_date:s.nav[0]?.date,last_date:s.nav.at(-1)?.date,observations:s.nav.length,ref:s.ref.article_id})),documents:requiredFundDocuments(input.snapshot.documents??[],input.snapshot.funds.map(f=>f.code)).map(d=>({code:d.code,title:d.title,published_at:d.published_at,status:d.status,body:d.body?{kind:d.body.kind,read_scope:d.body.read_scope,share_class:d.body.share_class,period:d.body.period,facts:d.body.facts,fragment_pages:d.body.fragment_pages}:undefined})),other_directions:input.snapshot.other_directions?.map(({daily,checked_at,ref,...d})=>({...d,ref:ref.article_id,observations:daily.length,first_date:daily[0]?.date,last_date:daily.at(-1)?.date}))},previous:input.previous?{id:input.previous.id,story_id:input.previous.story_id,article:{slug:input.previous.article.slug},interpretation:input.previous.interpretation,research:(input.previous as FinanceVersion&{research?:ResearchDecision}).research??null,origin:input.previous.origin,as_of:input.previous.as_of}:null}});
}

const numericTokens=(text:string)=>[...text.matchAll(/(?<![a-zA-Z])[-+]?\d+(?:\.\d+)?/g)].map(m=>String(Number(m[0])));
const quantityTokens=(text:string)=>[...text.matchAll(/([-+]?\d+(?:\.\d+)?)\s*(个百分点|%|倍|点|万元|亿元|元)/g)].map(m=>`${Number(m[1])}:${m[2]}`);
const roundedNumbers=(value:number)=>[...new Set([String(value),...[0,1,2,3,4,5,6].map(d=>String(Number(value.toFixed(d)))).filter(v=>value===0||Number(v)!==0)])];
function verifyResearch(input:FundResearchInput,out:z.infer<typeof fundResearchOutputSchema>):void {
 const {snapshot,evaluation}=input,r=out.research,refs=new Map(snapshot.refs.map(ref=>[ref.article_id,ref]));
 const ids=[...r.direction.refs,...r.candidates.flatMap(c=>c.refs),...r.new_money.refs,...r.held.refs,...r.conditions.flatMap(c=>c.refs.map(b=>b.article_id))];
 if(ids.some(id=>!refs.has(id)))throw new Error('unknown_research_reference');
 if(r.evidence_hash!==snapshot.evidence_hash||r.evaluated_at!==snapshot.captured_at||r.data_status!==evaluation.data_status)throw new Error('research_evaluation_mismatch');
 const codes=new Set<string>([...snapshot.funds.map(f=>f.code),...(snapshot.fund_series??[]).map(f=>f.code)]);
 if(r.coverage.fund_codes.some(c=>!codes.has(c))||r.candidates.some(c=>!codes.has(c.code)))throw new Error('unsupported_research_candidate');
 if((snapshot.documents??[]).length&&!r.conditions.some(c=>c.check==='document_body_read'&&c.status===evaluation.checks.document_body_read.status))throw new Error('unread_document_condition_required');
 if(new Set(r.conditions.map(c=>c.key)).size!==r.conditions.length)throw new Error('duplicate_research_condition');
 const rule=snapshot.valuation_rule;
 if(rule&&(r.new_money.stance!==rule.new_money.stance||r.held.stance!==rule.held.stance))throw new Error('stance_must_follow_rule');
 if(rule&&!r.conditions.some(c=>c.check==='valuation_band'))throw new Error('valuation_rule_condition_required');
 for(const scope of ['new_money','held'] as const){if(evaluation.evaluability[scope].status==='not_assessable'&&r[scope].stance!=='not_assessable')throw new Error('missing_data_is_not_investment_stance');if(r[scope].conditions.some(key=>!r.conditions.some(c=>c.key===key)))throw new Error('unknown_position_condition');}
 if(evaluation.evaluability.held.status==='partial'&&!['not_assessable','maintain_plan'].includes(r.held.stance))throw new Error('unsupported_public_holding_action');
 if(r.held.stance==='maintain_plan'&&(!/若|如果/.test(r.held.summary)||!r.held.conditions.some(key=>r.conditions.some(c=>c.key===key&&c.check==='user_plan_known'&&c.status==='not_assessable'))))throw new Error('holding_plan_premise_required');
 for(const condition of r.conditions){const result=evaluation.checks[condition.check];if(condition.status!==result.status||condition.scope==='sell'&&condition.status!=='not_assessable'&&!['trade_restriction','fee_terms_changed','fund_facts_changed'].includes(condition.check))throw new Error('unchecked_research_condition');if(condition.rule)throw new Error('unsupported_numeric_investment_rule');if(result.refs.length&&condition.status!=='not_assessable'&&!condition.refs.length)throw new Error('missing_condition_evidence');for(const b of condition.refs){const ref=refs.get(b.article_id);if(!ref?.fragments[b.fragment_index])throw new Error('invalid_research_fragment');if(!result.refs.some(v=>v.article_id===b.article_id))throw new Error('condition_evidence_mismatch');}}
 const numericCheck=(text:string,refIds:string[],fragments:string[])=>{const allowed=new Set(numericTokens(fragments.join(' '))),quantities=new Set(quantityTokens(fragments.join(' ')));for(const id of refIds){const ref=refs.get(id);if(ref)numericTokens((ref.published_at??'')+' '+(ref.data_as_of??'')).forEach(t=>allowed.add(t));}for(const metric of evaluation.metrics)if(metric.refs.every(id=>refIds.includes(id))){numericTokens(metric.as_of+' '+metric.label).forEach(t=>allowed.add(t));for(const value of roundedNumbers(metric.value)){allowed.add(value);quantities.add(`${value}:${metric.unit.split('/')[0]}`);}}if(numericTokens(text).some(t=>!allowed.has(t)))throw new Error('unsupported_research_number');if(quantityTokens(text).some(t=>!quantities.has(t)))throw new Error('unsupported_research_unit');};
 for(const section of out.article.sections)for(const [i,text]of section.paragraphs.entries()){const bindings=section.basis?.[i]?.refs??[];numericCheck(text,bindings.map(b=>b.article_id),bindings.flatMap(b=>refs.get(b.article_id)?.fragments[b.fragment_index]??[]));}
 numericCheck(out.article.title+' '+out.article.deck,snapshot.refs.map(r=>r.article_id),snapshot.refs.flatMap(r=>r.fragments));
 for(const c of r.candidates)numericCheck(c.summary+' '+c.differences.join(' '),c.refs,c.refs.flatMap(id=>refs.get(id)?.fragments??[]));
 numericCheck(r.direction.summary+' '+r.direction.why.join(' '),r.direction.refs,r.direction.refs.flatMap(id=>refs.get(id)?.fragments??[]));
 for(const p of [r.new_money,r.held])numericCheck(p.summary,p.refs,p.refs.flatMap(id=>refs.get(id)?.fragments??[]));
 for(const c of r.conditions)numericCheck(c.label+' '+c.explanation,c.refs.map(b=>b.article_id),c.refs.flatMap(b=>refs.get(b.article_id)?.fragments[b.fragment_index]??[]));
 numericCheck(out.interpretation.claim+' '+out.interpretation.mechanism.join(' ')+' '+out.interpretation.conditions.join(' '),out.interpretation.evidence_ids,out.interpretation.evidence_ids.flatMap(id=>refs.get(id)?.fragments??[]));
 for(const alternative of out.interpretation.alternatives)numericCheck(alternative.explanation,alternative.evidence_ids,alternative.evidence_ids.flatMap(id=>refs.get(id)?.fragments??[]));
 const currentTexts=[out.interpretation.claim,...out.interpretation.mechanism,...out.article.sections.flatMap(s=>s.paragraphs),r.direction.summary,...r.direction.why,...r.candidates.flatMap(c=>[c.summary,...c.differences]),r.new_money.summary,r.held.summary,...r.conditions.map(c=>c.explanation)];
 // Action verbs are allowed only where the public rule's stance supports them.
 const allowedVerbs=new Set<string>([...(rule?.new_money.stance==='conditional_add'?['买入','加仓','增持','追加','开仓']:[]),...(rule?.held.stance==='conditional_reduce'?['减仓']:[])]);
 const verbs=['买入','加仓','增持','追加','开仓','减仓','卖出'].filter(v=>!allowedVerbs.has(v));
 const actionPattern=verbs.length?new RegExp(`(?:建议|应当|应该|因此|所以|据此).{0,12}(?:${verbs.join('|')})`):null;
 for(const text of currentTexts){
  if(/保证收益|保证盈利|稳赚|必涨|必跌|已选出最优方向|最好买入时机/.test(text))throw new Error('unsupported_research_certainty');
  if(actionPattern&&actionPattern.test(text)&&!/(?:不能|不足以|不应|不宜|不支持|并不).{0,30}(?:买入|加仓|增持|追加|开仓|减仓|卖出)/.test(text))throw new Error('unsupported_public_market_action');
  if(/(?:综合|总|实际|全部)成本.{0,8}(?:更低|低于|节省|便宜|降低)/.test(text)&&!/(?:不能|无法|未|不).{0,12}(?:综合|总|实际|全部)成本/.test(text))throw new Error('unverified_actual_fund_cost');
 }
 // A maintained judgment must truly preserve the old position; a changed one needs a revision.
 const prior=(input.previous as (FinanceVersion&{research?:ResearchDecision})|null)?.research;
 if(input.previous&&out.changes.kind==='maintain'&&(out.interpretation.claim!==input.previous.interpretation.claim||prior&&(r.new_money.stance!==prior.new_money.stance||r.held.stance!==prior.held.stance)))throw new Error('maintain_changes_judgment');
 if(prior&&out.changes.kind==='supplement'&&(r.new_money.stance!==prior.new_money.stance||r.held.stance!==prior.held.stance))throw new Error('position_change_requires_revision');
}

function operationView(snapshot:ResearchSnapshot,research:ResearchDecision):OperationView {
 const unknown='未取得本次证据';
 const required=requiredFundDocuments(snapshot.documents??[],snapshot.funds.map(f=>f.code));
 const field=(f:FundSnapshot,key:keyof FundSnapshot['fields'])=>{
  const report=required.find(d=>d.code===f.code&&d.status==='read'&&d.body?.kind==='interim'),b=report?.body;
  if(b){const facts=b.facts;if(key==='period_return')return facts.period_return_pct?`${facts.period_return_pct.value}%`:unknown;if(key==='benchmark_return')return facts.benchmark_return_pct?`${facts.benchmark_return_pct.value}%`:unknown;if(key==='difference')return facts.period_return_pct&&facts.benchmark_return_pct?`${round(facts.period_return_pct.value-facts.benchmark_return_pct.value)}个百分点`:unknown;if(key==='tracking_error')return facts.annual_tracking_error_pct?`${facts.annual_tracking_error_pct.value}%（${facts.annual_tracking_error_pct.scope==='C'?'C类':'基金层面，未单列C类'}年化）`:unknown;if(key==='benchmark')return facts.benchmark?.value??unknown;if(key==='document_date')return `${report!.published_at}；报告期${b.period!.start}至${b.period!.end}`;}
  return f.fields[key]?String(f.fields[key]!.value):unknown;
 };
 const action=(stance:ResearchDecision['held']['stance']):OperationView['held']['action']=>({conditional_add:'加',maintain_plan:'持',conditional_reduce:'减',observe:'观察',not_assessable:'无法评估'} as const)[stance];
 return {reviewed_on:research.evaluated_at.slice(0,10),performance_period:'各字段按原数据日期和口径理解',held:{action:action(research.held.stance),text:research.held.summary},unheld:{action:action(research.new_money.stance),text:research.new_money.summary},reason:research.direction.summary,counterargument:research.limitations.join('；'),change_conditions:research.conditions.map(c=>`${c.label}：${c.explanation}`),funds:snapshot.funds.map(f=>({code:f.code,name:f.code==='007339'?'易方达沪深300ETF联接C':'华夏沪深300ETF联接C',role:research.candidates.find(c=>c.code===f.code)?.summary??'仅列实际已取得的字段',management:field(f,'management'),custody:field(f,'custody'),service:field(f,'service'),total:field(f,'total'),subscription:field(f,'subscription'),redemption:field(f,'redemption'),trade_status:field(f,'trade_status'),period_return:field(f,'period_return'),benchmark_return:field(f,'benchmark_return'),difference:field(f,'difference'),tracking_error:field(f,'tracking_error'),benchmark:field(f,'benchmark'),document_date:field(f,'document_date'),field_checked_at:Object.fromEntries(Object.entries(f.fields).sort(([a],[b])=>a.localeCompare(b)).map(([key,fact])=>[key,fact?.source.checked_at??f.checked_at]))})),comparison_note:'同方向工具事实比较，不代表方向筛选或个人资金配置。',gaps:research.limitations,...(snapshot.market?{market:toMarketEvidence(snapshot.market)}:{})};
}

/** Pure composition. Caller atomically persists/publishes and records every check, including maintain. */
export async function composeFundResearch(snapshot:ResearchSnapshot,previous:FinanceVersion|null,provider:FundResearchProvider=input=>composeWithDeepSeekPrompt(fundResearchPrompt(input),input.snapshot.evidence_hash,`fund-research:${input.snapshot.evidence_hash}`)):Promise<(FinanceVersion&{research:ResearchDecision})|null> {
 if(previous?.story_id!==FUND_STORY_ID&&previous)throw new Error('previous_version_must_belong_to_same_event');
 if(previous?.input_hash===snapshot.evidence_hash)return null;
 if(!snapshot.refs.length)throw new Error('research_original_evidence_required');
 const input={snapshot:researchContentSnapshot(snapshot),evaluation:evaluateResearchSnapshot(snapshot,previous),previous};
 const raw=await provider(input),parsed=fundResearchOutputSchema.safeParse(raw);if(!parsed.success)throw new Error('invalid_fund_research_structure');
 const out=parsed.data;verifyResearch(input,out);
 // Dedicated ongoing public claim key; the old editor claim is context, not a fact input.
 const context=previous?{...previous,interpretation:{...previous.interpretation,topic_key:'china-equity-index',claim_key:'csi300-public-fund-research'}}:null;
 const generated_at=new Date().toISOString();
 const version=acceptComposition({story_id:FUND_STORY_ID,topic_key:'china-equity-index',claim_key:'csi300-public-fund-research',refs:snapshot.refs,previous:context,related:[]},out,generated_at);
 if(!version)return null;
 const research={...structuredClone(out.research),evaluated_at:generated_at};
 return {...version,id:randomUUID(),input_hash:snapshot.evidence_hash,research,article:{...version.article,operation_view:operationView(snapshot,research)}};
}
