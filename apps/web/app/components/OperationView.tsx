import {FundTrackingNote} from './FundTrackingNote.tsx';
import {sourceDates} from '../lib/format.ts';
import type {FinanceVersion} from '../../../../packages/contracts/types.ts';
import type {MarketAvailability,MarketCheck} from '../../../../packages/backend/market-availability.ts';
import {MarketFigure} from './MarketFigure.tsx';
import {SaveButton} from './SaveButton.tsx';
import {Link,useNavigate,useLocation} from 'react-router';
import {useRef,useState,useEffect} from 'react';
import type {MouseEvent,RefObject} from 'react';

export function OperationView({version,home=false,availability=null,marketCheck=null,current=true}:{version:FinanceVersion;current?:boolean;home?:boolean;availability?:MarketAvailability|null;marketCheck?:MarketCheck|null}){
 const [selectedFund,setSelectedFund]=useState(version.article.operation_view?.funds[0]?.code??'');
 const navigate=useNavigate();
 const readingLocation=useLocation();
 const changeDetails=useRef<HTMLDetailsElement>(null);
 const fundDetails=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(readingLocation.hash!=='#judgment-change-conditions')return;if(changeDetails.current)changeDetails.current.open=true;requestAnimationFrame(()=>document.getElementById('judgment-change-conditions')?.scrollIntoView({block:'start'}));},[readingLocation.hash]);
 const v=version.article.operation_view;if(!v)return null;
 const rates=v.funds.map(f=>parseFloat(f.total)),maxRate=Math.max(...rates);
 const rows=[['本期定位','role'],['管理费 / 托管费（年）','management'],['C类概要销售服务年费率','service'],['C类概要综合运作年费率测算','total'],['C类申购费','subscription'],['C类赎回费','redemption'],['交易状态','trade_status'],[v.performance_period+'净值增长率','period_return'],['同期各自基准收益率','benchmark_return'],['收益率减各自基准','difference'],['报告期年化跟踪误差','tracking_error'],['业绩比较基准','benchmark'],['C类费率资料送出日期','document_date'],...(v.fee_regulation?[['C类销售服务费持有条件','fee_holding_terms'],['C类费用渠道范围','fee_channel_scope'],['C类具体费用生效日','fee_effective_from'],['本基金实施公告','fee_announcement']]:[])];
 const fieldValue=(f:typeof v.funds[number],key:string)=>key==='management'?f.management+' / '+f.custody:String(f[key as keyof typeof f]??'未核实');
 const sharedKeys=new Set(['management'].filter(key=>v.funds.length>1&&v.funds.every(f=>fieldValue(f,key)===fieldValue(v.funds[0],key))));
 const commonRows=rows.filter(([,key])=>sharedKeys.has(key));
 const actions=[{label:'已有持仓',value:v.held},{label:'新增资金 · 首次买入或追加',value:v.unheld}];
 const openSection=(event:MouseEvent<HTMLAnchorElement>,details:RefObject<HTMLDetailsElement|null>,id:string)=>{
  if(event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.button!==0)return;
  event.preventDefault();if(details.current)details.current.open=true;
  navigate({pathname:readingLocation.pathname,search:readingLocation.search,hash:'#'+id},{preventScrollReset:true,flushSync:true});
  requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start',behavior:'instant'});target?.focus({preventScroll:true});});
 };
 const openChanges=(event:MouseEvent<HTMLAnchorElement>)=>openSection(event,changeDetails,'judgment-change-conditions');
 const openFunds=(event:MouseEvent<HTMLAnchorElement>)=>openSection(event,fundDetails,'fund-comparison');
 return <section className={'operation-view'+(home?' operation-home':'')} aria-label="沪深300研究判断与适用条件">
  {home&&<><div className="operation-kicker"><span>本期结论 · 沪深300</span><time dateTime={v.reviewed_on}>编辑复核 {v.reviewed_on} · 第{version.version}版</time></div><h1><Link to={'/articles/'+version.article.slug}>{version.article.title}</Link></h1><p className="operation-deck operation-deck-desktop">{version.article.deck}</p><p className="operation-deck operation-deck-mobile">已有持仓先核对原条件，临时新增先看判断依据；本篇不提供首次配置方案。</p></>}
  {availability&&!marketCheck&&<p className="update-note">{availability.message}</p>}
  <div className="operation-actions">{actions.map(({label,value:a})=><div key={label}><h2><span>{label}</span><strong>{a.action==='持'?'按原计划维护':a.action==='观察'?'先观察':a.action}</strong></h2><p>{a.text}</p>{a===v.held&&<a className="operation-action-link" href="#fund-comparison" onClick={openFunds}>比较两只同方向基金 →</a>}{a===v.unheld&&<><p className="operation-plan-context">既定长期计划内的投入，原条件仍成立时按原计划执行，不由本篇一概暂停。</p>{home&&<div className="first-reading" id="first-reading"><p>还没有配置计划，现在可以先比较两只同方向C类的服务费与赎回条款；原文费用不等于实付成本。重看本期判断，要等同样本盈利、需求与对应日期估值的新证据。</p><div className="first-reading-links"><a href="#fund-comparison" onClick={openFunds}>看服务费与赎回差异 →</a><a href="#judgment-change-conditions" onClick={openChanges}>看哪些材料会改变判断 →</a><SaveButton slug={version.article.slug} title={version.article.title}/></div></div>}</>}</div>)}</div>
  {v.next_watch&&<p className="operation-next">下一次复核，看盈利、需求与费用适用条件是否有实质变化。<a href="#judgment-change-conditions" onClick={openChanges}>看哪些变化会改变判断 →</a></p>}
  <div className="operation-bottom"><div className="operation-reason" id="judgment-reasons"><h2>为什么这样判断</h2><p>{v.reason}</p><details className="operation-review" ref={changeDetails}><summary>最强反方与改判条件</summary><h3>最强反方</h3><p>{v.counterargument}</p><h3 id="judgment-change-conditions" tabIndex={-1}>什么变化会改变判断</h3>{v.next_watch&&<p>{v.next_watch}</p>}<ul>{v.change_conditions.map(t=><li key={t}>{t}</li>)}</ul></details></div>{v.market?<MarketFigure market={v.market} check={marketCheck}/>:<figure className="operation-fees"><figcaption><strong>同一方向的费用资料快照</strong><span>原概要年费率 · 费改生效与持有条件另行核对</span></figcaption>{v.funds.map(f=><div className="operation-fee-row" key={f.code}><span>{f.name}<small>{f.code} · {f.role}</small></span><i style={{width:parseFloat(f.total)/maxRate*100+'%'}}/><strong>{f.total}</strong></div>)}<p>这些是概要送出时的费用测算，不能将旧年费线性外推多年。实际收费还取决于份额、渠道、持续持有期和费改生效公告。</p></figure>}</div>
  {v.research_conditions&&<details className="operation-conditions" open={!home}><summary>下一次资料来了，检查哪些条件</summary>{v.research_conditions.map(c=><div key={c.key}><h3>{c.label}</h3><p>{c.baseline}</p><p>{c.watch}</p><p>{c.trigger}</p><small>{c.automatic?'按官方资料复核；实质变化再更新':'下一期材料需编辑核对'}</small></div>)}</details>}
  <details className="operation-comparison" id="fund-comparison" tabIndex={-1} ref={fundDetails} open={!home}>
   <summary>两只候选基金 · 先比较C类工具差异</summary>
   <p className="fund-comparison-intro">两只都承接沪深300方向，同时持有不增加方向分散。下面比较C类费用、跟踪与申赎条件；选择工具不改变上面的市场判断。C类申购费为0，不等于持有全过程免费。</p>
   <div className="fund-selector" aria-label="选择查看的C类基金条款">{v.funds.map(f=><button type="button" key={f.code} aria-pressed={selectedFund===f.code} aria-controls="fund-terms-table" onClick={()=>setSelectedFund(f.code)}>{f.name.replace('沪深300ETF联接C','')}<small>{f.code} · C类</small></button>)}</div>
   <div className="fund-difference-summary" aria-label="两只C类费用原文摘要">{v.funds.map(f=><p key={f.code}><strong>{f.name.replace('沪深300ETF联接C','')} C类：</strong>服务年费率 {f.service}，综合运作年费率测算 {f.total}。<small>原文送出 {f.document_date}</small></p>)}<p>分别按各自原文日期记录，实际适用条款、渠道优惠与费改生效仍待核；这些数字不决定基金排序。</p></div>
   {current&&<FundTrackingNote version={version}/>}
   <p className="fund-scroll-hint" id="fund-scroll-hint">切换上方基金，查看所选C类条款；A类另见下方折叠。</p>
   <div className="fund-table-wrap" tabIndex={0} role="region" aria-label="两只沪深300联接C类基金的条款对照" aria-describedby="fund-scroll-hint">
    <table id="fund-terms-table"><caption className="visually-hidden">两只C类同方向工具按各自资料日期对照，A类费用另列</caption><thead><tr><th scope="col">核对项</th>{v.funds.map(f=><th scope="col" key={f.code} data-fund-selected={selectedFund===f.code}>{f.name}<small>{f.code} · C类<br/>费用原文 {f.document_date}</small></th>)}</tr></thead>
     <tbody>{rows.filter(([,key])=>!sharedKeys.has(key)).map(([label,key])=><tr key={key}><th scope="row">{label}</th>{v.funds.map(f=><td key={f.code} data-fund-selected={selectedFund===f.code}>{fieldValue(f,key)}
      {key==='difference'&&<small>报告期累计差额；两只各自基准不同，不能据此比较跟踪稳定性。</small>}
      {key==='tracking_error'&&/未披露|未核/.test(f.tracking_error)&&<small>无法据此比较跟踪稳定性，收益差额不能代替跟踪误差。</small>}
      {key==='fee_effective_from'&&(!f.fee_context?.effective_from)&&<small>未确定适用期间，暂不能计算实际期间成本。</small>}
      {key==='trade_status'&&<small>核查于 {f.field_checked_at?.trade_status?.slice(0,10)??v.reviewed_on}</small>}
     </td>)}</tr>)}</tbody>
    </table>
   </div>
   {commonRows.length>0&&<details className="fund-common"><summary>两只共同条款 · 管理与托管</summary>{commonRows.map(([label,key])=><p key={key}><strong>{label}：</strong>{fieldValue(v.funds[0],key)}{key==='management'&&v.fee_regulation&&<small>扣除目标ETF投资部分后计提。</small>}</p>)}<p>分别按表内各自原文日期记录，实际渠道与费改实施条件仍待核实。</p></details>}
  </details>
  {v.funds.some(f=>f.a_class)&&<details className="fund-a-classes" id="fund-a-classes">
   <summary>准备长期持有？再看A类</summary>
   <p>A、C是同一基金的不同份额，收费方式不同。这里展开A类原文条款，方便与C类核对；不能一概按“长期A、短期C”选择，也不假定渠道优惠。以下期限是收费条件，不是推荐持有期限。</p>
   {v.funds.map(f=>{const a=f.a_class;if(!a)return null;const ref=version.input_refs.find(r=>r.article_id===a.source_ref_id);return <section className="fund-a-terms" key={a.code}>
    <h3>{f.name.replace('沪深300ETF联接C','')}沪深300ETF联接A · {a.code}</h3>
    <p className="fund-a-source">{ref?sourceDates(ref):'资料送出 '+a.document_date}{ref&&<> · <a href={ref.url} target="_blank" rel="noreferrer">查看A类原文 ↗</a></>}</p>
    <dl><div><dt>A类销售服务费</dt><dd>{a.service}</dd></div><div><dt>A类普通申购费</dt><dd>{a.subscription}<small>实际渠道优惠未核，普通费率不能代替实付费用。</small></dd></div><div><dt>A类赎回费</dt><dd>{a.redemption}</dd></div></dl>
   </section>;})}
  </details>}
  <details className="fund-comparison-notes"><summary>费用比较的适用条件与未核项</summary><p>{v.comparison_note}</p><p><strong>仍待补齐：</strong>{v.gaps.join('；')}。</p></details>
  {home&&<><details className="operation-evidence"><summary>展开原文依据与资料日期</summary>{version.input_refs.map(r=><div key={r.article_id}><a href={r.url} target="_blank" rel="noreferrer">{r.source}</a><small>{sourceDates(r)}</small>{(r.display_fragments??r.fragments).map(p=><p key={p}>{p}</p>)}</div>)}</details><Link className="read-link operation-read" to={'/articles/'+version.article.slug}>阅读全文与后续复核 →</Link></>}
 </section>;
}
