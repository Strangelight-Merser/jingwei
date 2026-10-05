import {useEffect,useRef} from 'react';
import {Link,useFetcher,useRouteLoaderData,useRevalidator} from 'react-router';
import type {ResearchEvaluation} from '../../../../packages/contracts/research.ts';
import type {SourceRef} from '../../../../packages/contracts/types.ts';
import type {FinanceVersion} from '../../../../packages/contracts/types.ts';
import type {ResearchPosition,ResearchScope} from '../../../../packages/contracts/research.ts';
import {MarketFigure} from './MarketFigure.tsx';
import {date,sourceDates} from '../lib/format.ts';

export type ResearchUpdate = {status:'idle'|'checking'|'partial'|'failed'|'updated'|'unchanged'|'model_waiting';last_checked_at:string|null;last_success_at:string|null;next_check_at:string|null;source_errors:string[];message:string};
export function FollowButton({topicKey}:{topicKey:string}){
 const root=useRouteLoaderData<{followed:string[]|null}>('root');
 const fetcher=useFetcher<{ok:boolean;message?:string}>();
 const followed=root?.followed?.includes(topicKey)??false;
 const pending=fetcher.state!=='idle';
 if(root?.followed===null||topicKey!=='china-equity-index')return null;
 return <div className="follow-control"><fetcher.Form method="post" action="/follow"><input type="hidden" name="topic_key" value={topicKey}/><input type="hidden" name="followed" value={String(!followed)}/><button type="submit" aria-pressed={followed} disabled={pending}>{pending?'保存中…':followed?'已关注':'关注这个方向'}</button></fetcher.Form>{fetcher.data?.ok===false&&<small role="status">{fetcher.data.message}</small>}</div>;
}
export function CheckResearchButton(){
 const fetcher=useFetcher<{ok:boolean;message?:string}>();const revalidator=useRevalidator();const seen=useRef<unknown>(null);
 useEffect(()=>{if(fetcher.state!=='idle'||!fetcher.data?.ok||seen.current===fetcher.data)return;seen.current=fetcher.data;const timer=setTimeout(()=>void revalidator.revalidate(),2000);return()=>clearTimeout(timer);},[fetcher.state,fetcher.data,revalidator.revalidate]);
 return <div className="follow-control research-check"><fetcher.Form method="post" action="/follow"><input type="hidden" name="intent" value="refresh"/><button type="submit" disabled={fetcher.state!=='idle'}>{fetcher.state!=='idle'?'正在核查…':'核查新资料'}</button></fetcher.Form>{fetcher.data&&<small role="status">{fetcher.data.message??(fetcher.data.ok?'已开始核查，可继续阅读。':'这次核查未能开始，请稍后再试。')}</small>}</div>;
}
export function ResearchUpdateNote({update}:{update?:ResearchUpdate|null}){
 const revalidator=useRevalidator();
 useEffect(()=>{if(update?.status!=='checking'||revalidator.state!=='idle')return;const timer=setTimeout(()=>void revalidator.revalidate(),3000);return()=>clearTimeout(timer);},[update,revalidator.state,revalidator.revalidate]);
 if(!update||!update.last_checked_at&&update.status!=='checking')return null;
 const text=update.status==='checking'?'正在核查公开资料，已有研究仍可阅读。':update.status==='model_waiting'?'资料已核查，当前判断尚未重新研究。':update.status==='unchanged'?'已核查，研究依据没有实质变化。':update.status==='updated'?'本次核查已有新研究。':update.status==='partial'?'部分来源暂不可用，已取得的资料继续保留。':update.status==='failed'?'这次未取得可用的新资料，保留此前研究。':update.message;
 if(!text)return null;
 return <p className="research-update" role="status">{text}{update.source_errors.length>0&&!['partial','failed'].includes(update.status)&&<> 部分来源本轮未完成，沿用各自原日期的资料。</>}{update.last_checked_at&&<> <span>核查于 {date(update.last_checked_at)}</span></>}{update.next_check_at&&<> 应用打开时继续核查，下次打开补查。</>}</p>;
}
const stanceLabel:Record<ResearchPosition['stance'],string>={conditional_add:'满足条件时可考虑新增',maintain_plan:'按原计划维护',conditional_reduce:'触发条件时考虑减少',observe:'继续观察',not_assessable:'当前资料无法评估'};
const scopeLabel:Record<ResearchScope,string>={direction:'方向判断',comparison:'工具比较',new_money:'新增资金',held:'已有持仓',sell:'卖出或失效条件'};
export function ResearchBrief({version,home=false,update}:{version:FinanceVersion;home?:boolean;update?:ResearchUpdate|null}){
 const r=version.research;if(!r)return null;
 const refDetails=(ids:string[])=>{
  const refs=version.input_refs.filter(ref=>ids.includes(ref.article_id));
  return refs.length?<details className="research-sources"><summary>查看依据</summary>{refs.map(ref=><div key={ref.article_id}><a href={ref.url} target="_blank" rel="noreferrer">{ref.source}</a><small>{sourceDates(ref)}</small>{(ref.display_fragments??ref.fragments).map((fragment,index)=><p key={index}>{fragment}</p>)}</div>)}</details>:null;
 };
 const position=(label:string,p:ResearchPosition)=><section className="research-position"><h3>{label}<span>{stanceLabel[p.stance]}</span></h3><p>{p.summary}</p>{p.conditions.length>0&&<ul>{p.conditions.map(c=><li key={c}>{r.conditions.find(condition=>condition.key===c)?.label??'待核查条件'}</li>)}</ul>}{refDetails(p.refs)}</section>;
 return <section className={'research-brief'+(home?' research-home':'')} aria-label="当前基金研究">
  {home&&<header className="research-opening"><div className="research-byline"><span>{r.coverage.label} · 当前研究</span><time dateTime={version.as_of}>资料截至 {date(version.as_of)}</time></div><h1><Link to={`/articles/${version.article.slug}`}>{version.article.title}</Link></h1><p>{version.article.deck}</p></header>}
  <div className="research-context"><p>当前覆盖沪深300方向内的工具比较，尚未比较其他市场方向。</p><div className="research-controls"><FollowButton topicKey={version.interpretation.topic_key}/><CheckResearchButton/></div></div>
  <ResearchUpdateNote update={update}/>
  <section className="research-direction"><h2>为什么关注这个方向</h2><p>{r.direction.summary}</p>{home?<details className="research-sources"><summary>判断的理由</summary>{r.direction.why.map(reason=><p key={reason}>{reason}</p>)}</details>:r.direction.why.map(reason=><p key={reason}>{reason}</p>)}{refDetails(r.direction.refs)}</section>
  {version.article.operation_view?.market&&<div className="research-market"><MarketFigure market={version.article.operation_view.market}/></div>}
  <div className="research-positions">{position('新增资金',r.new_money)}{position('已有持仓',r.held)}</div>
  <section className="research-candidates"><h2>同一方向，工具怎样选</h2><p className="research-caption">两只承接相同指数，同时持有不增加方向分散。</p>{r.candidates.map(c=>{const fund=version.article.operation_view?.funds.find(f=>f.code===c.code);return <div key={c.code}><h3>{fund?.name??c.code}<small>{c.code}</small></h3><p>{c.summary}</p>{c.differences.length>0&&(home?<details className="research-sources"><summary>费用、跟踪与交易差异</summary><ul>{c.differences.map(d=><li key={d}>{d}</li>)}</ul></details>:<ul>{c.differences.map(d=><li key={d}>{d}</li>)}</ul>)}{refDetails(c.refs)}</div>;})}</section>
  <details className="research-conditions" open={!home}><summary>卖出、失效与下次复核的条件</summary>{r.conditions.map(c=><div key={c.key}><h3>{c.label}<span>{c.status==='triggered'?'已触发':c.status==='not_triggered'?'未触发':'暂无法检查'}</span></h3><p>{c.explanation}</p>{refDetails(c.refs.map(ref=>ref.article_id))}</div>)}</details>
  <section className="research-change"><h2>这次研究有什么变化</h2><p>{version.changes.summary}</p>{r.impact_scope.length>0&&<p>影响：{r.impact_scope.map(scope=>scopeLabel[scope]).join('、')}。</p>}<p className="research-caption">研究日期 {date(r.evaluated_at)}。新资料到来后核对上述条件，有实质变化再修订判断。</p></section>
  {r.limitations.length>0&&<details className="research-limitations"><summary>哪些问题还不能回答</summary><ul>{r.limitations.map(item=><li key={item}>{item}</li>)}</ul><p>缺少的资料只影响对应结论，不自动代表应当买入、卖出或观察。</p></details>}
  {home&&<Link className="read-link" to={`/articles/${version.article.slug}`}>阅读完整研究与此前版本 →</Link>}
 </section>;
}
export function HistoricalResearchNote({version}:{version:FinanceVersion}){
 if(version.research||!version.article.operation_view)return null;
 return <p className="historical-research-note">这份判断来自历史人工研究，复核于 {date(version.article.operation_view.reviewed_on)}。下面保留当时的依据与条件，不代表已按最新资料重新判断。</p>;
}

export function FreeResearchFacts({facts,asOf,refs=[]}:{facts?:ResearchEvaluation|null;asOf?:string|null;refs?:SourceRef[]}){
 if(!facts)return null;
 const metrics=facts.metrics.filter(m=>m.key.endsWith('_nav_window_change_pct')||m.key==='same_date_nav_change_difference_pct').slice(0,3);
 const visible=metrics.length?metrics:facts.metrics.filter(m=>m.key==='close'||m.key==='pe_ttm').slice(0,2);
 const reports=facts.metrics.filter(m=>m.key.endsWith('_report_period_return_pct'));
 const other=facts.metrics.filter(m=>m.key==='csi500_pe_ttm');
 const used=refs.filter(r=>[...visible,...reports,...other].some(m=>m.refs.includes(r.article_id))||facts.checks.document_body_read?.refs.some(b=>b.article_id===r.article_id));
 if(!visible.length&&!facts.limitations.length)return null;
 return <section className="free-research-facts" aria-label="本次核查资料"><h2>可用资料</h2><p>官方记录保留各自的原日期，还没有形成新的行动判断。{asOf&&<>市场资料截至 {date(asOf)}。</>}</p>{reports.length>0&&<><h3>半年报补充的事实</h3>{reports.map(m=><p key={m.key}>{m.label}为 {m.value}%；对应报告期的本基金基准收益率为 {facts.metrics.find(b=>b.key===m.key.replace('period_return_pct','benchmark_return_pct'))?.value}%。</p>)}<p>{facts.checks.tracking_available.explanation}</p><p>这是报告中的历史表现；两只基金基准的现金部分不同，超基准差不能直接排出跟踪优劣。</p></>}{other.length>0&&<p>还取得了同日中证500价格与估值。该方向的基金条款、长期盈利和估值分位尚未核实，当前资料还不能支持方向选择。</p>}{visible.length>0&&<dl>{visible.map(m=><div key={m.key}><dt>{m.label}</dt><dd>{m.value.toLocaleString('zh-CN',{maximumFractionDigits:4})}{m.unit}<small>{m.as_of&&<>资料日期 {date(m.as_of)}</>}</small></dd></div>)}</dl>}{facts.checks.fee_scope_verified?.status==='not_assessable'&&<p>{facts.checks.fee_scope_verified.explanation}</p>}{facts.checks.document_body_read&&<p>{facts.checks.document_body_read.explanation}</p>}{visible.some(m=>m.key.includes('_nav_'))&&<p>单位净值未复权，分红可能影响区间变化和回撤；这些数值不是含分红总回报。</p>}{!visible.length&&<p>{facts.limitations[0]}</p>}{used.length>0&&<details className="research-sources"><summary>查看原文和口径</summary>{used.map(ref=><div key={ref.article_id}><a href={ref.url} target="_blank" rel="noreferrer">{ref.source}</a><small>{sourceDates(ref)}</small>{(ref.display_fragments??ref.fragments).map((f,i)=><p key={i}>{f}</p>)}</div>)}</details>}</section>;
}
