import {Link as ErrorLink,useRouteError as usePageError,isRouteErrorResponse as isPageError} from 'react-router';
import {useState} from 'react';
import {Link} from 'react-router';
import {estimateFundCosts,FUND_COST_TERMS,type FundCostComparison} from '../../../../packages/backend/fund-cost.ts';
import '../compare.css';

export function meta(){return [{title:'两只C类费用比较 · 经纬'}];}
const money=(n:number)=>n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});

const AMOUNTS=[10000,50000,100000];
const DAYS:[number,string][]=[[6,'6 天'],[7,'7 天'],[30,'1 个月'],[365,'1 年'],[1095,'3 年']];
const SHORT:Record<string,string>={'007339':'易方达沪深300联接C','005658':'华夏沪深300联接C'};

function ResultTable({result:r}:{result:FundCostComparison}){
 return <table className="cost-table">
  <caption>分项 · 元</caption>
  <thead><tr><th>费用项目</th>{r.funds.map(f=><th key={f.code}>{f.code==='007339'?'易方达C':'华夏C'}<small>{f.code}</small></th>)}</tr></thead>
  <tbody>{[['销售服务费','service_fee_yuan'],['赎回费','redemption_fee_yuan'],['两项合计','total_fee_yuan']].map(([label,key])=><tr key={key}><th>{label}</th>{r.funds.map(f=><td key={f.code}>{money(f[key as 'service_fee_yuan'])}</td>)}</tr>)}</tbody>
 </table>;
}

export default function Compare(){
 const [amount,setAmount]=useState('10000'),[days,setDays]=useState('365');
 let result:FundCostComparison|null=null;
 try{result=estimateFundCosts({amount:Number(amount),holding_days:Number(days)});}catch{}
 const error=result?'':'请输入大于 0 的金额，以及大于 0 的整数天数。';
 const max=result?Math.max(...result.funds.map(f=>f.total_fee_yuan),0.01):1;
 const cheaper=result?[...result.funds].sort((a,b)=>a.total_fee_yuan-b.total_fee_yuan)[0]:null;
 const diff=result?Math.abs(result.difference.total_fee_yuan):0;
 const n=Number(days);
 return <main id="main" className="reader-page comparison-page">
  <header className="cost-head">
   <p className="eyebrow">同一指数 · 两只 C 类</p>
   <h1>这笔钱，两只基金的费用差多少？</h1>
   <p className="reader-intro">易方达 007339 与华夏 005658 都跟踪沪深300。改金额或天数，右边会立刻算出销售服务费与赎回费。</p>
  </header>
  <section className="cost-calc">
   <form className="cost-inputs" onSubmit={e=>e.preventDefault()} noValidate>
    <label className="cost-field"><span>投入金额</span>
     <div className="cost-input"><input type="number" inputMode="decimal" name="amount" min="0.01" step="0.01" value={amount} aria-invalid={!result} aria-describedby={!result?'cost-error':undefined} onChange={e=>setAmount(e.target.value)}/><em>元</em></div>
    </label>
    <div className="cost-chips" role="group" aria-label="常用金额">{AMOUNTS.map(a=><button type="button" key={a} aria-pressed={Number(amount)===a} onClick={()=>setAmount(String(a))}>{a/10000} 万</button>)}</div>
    <label className="cost-field"><span>持有天数（确认后的自然日）</span>
     <div className="cost-input"><input type="number" inputMode="numeric" name="holding_days" min="1" step="1" value={days} aria-invalid={!result} onChange={e=>setDays(e.target.value)}/><em>天</em></div>
    </label>
    <input className="cost-slider" type="range" min={1} max={1095} step={1} value={Number.isFinite(n)&&n>0?Math.min(n,1095):1} aria-label="拖动调整持有天数" onChange={e=>setDays(e.target.value)} style={{'--fill':`${(Math.min(Math.max(n,1),1095)-1)/1094*100}%`} as React.CSSProperties}/>
    <div className="cost-chips" role="group" aria-label="常用期限">{DAYS.map(([d,label])=><button type="button" key={d} aria-pressed={n===d} onClick={()=>setDays(String(d))}>{label}</button>)}</div>
    {n>0&&n<7&&<p className="cost-hint">不足 7 天卖出，两只都要收 1.50% 赎回费。</p>}
   </form>
   <div className="cost-result" aria-live="polite">
    {result&&cheaper?<>
     <p className="cost-result-kicker">{money(result.amount)} 元 · 持有 {result.holding_days} 天</p>
     <p className="cost-result-main">{diff===0?<>两只的这两项费用<strong>相同</strong></>:<><span>{SHORT[cheaper.code]}</span>少交约<strong>{money(diff)}</strong>元</>}</p>
     <div className="cost-bars">{result.funds.map(f=><div key={f.code} className={f.code===cheaper.code&&diff>0?'is-cheaper':''}>
      <span>{SHORT[f.code]}<small>{f.code}</small></span>
      <i style={{width:`${Math.max(f.total_fee_yuan/max*100,1.5)}%`}}/>
      <b>{money(f.total_fee_yuan)} 元</b>
     </div>)}</div>
     <ResultTable result={result}/>
    </>:<p id="cost-error" className="cost-error" role="alert">{error}</p>}
   </div>
  </section>
  <p className="reader-note">仅按固定费率估算，实际以购买渠道为准。</p>
  <details className="research-sources cost-method">
   <summary>计算口径与官方来源</summary>
   <h2>怎么算</h2>
   <p>假设这笔钱的持仓价值和赎回金额不变，销售服务费按金额 × 年费率 × 天数 ÷ 365 估算。分项先四舍五入到分，再合计和相减；实际每日计提按当年天数计算。</p>
   <p>天数请以购买渠道确认的持有自然日为准，申请买入与卖出的日期间隔可能不同。两只C类持有不足7日的赎回费均为1.50%，达到7日时，原资料概要列示为0。</p>
   <p>销售服务费已经从基金资产中扣除，不要从净值收益里重复扣一次。管理费、托管费及其他费用未计入。</p>
   <p>渠道优惠、费率调整与持有超过一年后的停止收费安排会影响实际费用；超过365天的结果也只是假设全程费率不变的演算。基金是否适合你，还要结合计划与持仓判断。</p>
   <h2>费率来自哪里</h2>
   {FUND_COST_TERMS.map(f=><div className="cost-terms" key={f.code}>
    <h3>{f.name}<small>{f.code}</small></h3>
    <p>资料列示的销售服务年费率：{(f.annual_service_rate*100).toFixed(2)}%。</p>
    {f.sources.map(s=><p key={s.url+s.pdf_page}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><small>发布日期 {s.published_at} · 第{s.pdf_page}页</small></p>)}
   </div>)}
  </details>
  <div className="reader-actions"><Link to="/">回到首页判断 →</Link><Link to="/situation">修改我的情况 →</Link></div>
 </main>;
}

export function ErrorBoundary() {
 const error=usePageError();
 const missing=isPageError(error)&&error.status===404;
 const invalid=isPageError(error)&&error.status===400;
 return <main id="main" className="reader-page error-page"><h1>{missing?'费用比较暂未提供':invalid?'这个入口暂不可用':'费用比较暂时无法载入'}</h1><p className="reader-intro">{missing?'内容可能尚未收录，或当前入口未开放。请从下面的入口继续。':invalid?'请从页面提供的入口重新选择。':'未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{!missing&&!invalid&&<a href="">重新载入</a>}<ErrorLink to="/articles">阅读文章 →</ErrorLink><ErrorLink to="/">回到今日判断 →</ErrorLink></div></main>;
}
