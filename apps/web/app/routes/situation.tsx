import{useEffect,useState}from'react';import{Link,useLoaderData}from'react-router';
import{publication}from'../lib/api.server.ts';
import{readingFor}from'../components/SituationCard.tsx';
import{situationMoney}from'../lib/situation-money.ts';
import type{Judgment}from'../components/RuleJudgment.tsx';
import{PLAN_OPTIONS,HOLDING_OPTIONS,PERIOD_OPTIONS,EMPTY_SITUATION,type ReaderSituation}from'../../../../packages/contracts/reader-situation.ts';
import{useReaderSituation,writeReaderSituation}from'../lib/reader-situation.ts';
import '../situation.css';
export function meta(){return[{title:'我的情况 · 经纬'}];}
export async function loader(){return{judgment:await publication<Judgment>('judgment').catch(()=>null)};}
export default function Situation(){
 const{judgment}=useLoaderData<typeof loader>();
 const{ready,situation,unavailable}=useReaderSituation(),[draft,setDraft]=useState<ReaderSituation>(EMPTY_SITUATION),[message,setMessage]=useState('');
 useEffect(()=>{if(ready)setDraft(situation??EMPTY_SITUATION);},[ready,situation]);
 const groups=[['long_plan','有没有长期计划？',PLAN_OPTIONS],['holding','现在持有哪只？',HOLDING_OPTIONS],['holding_period','准备持有多久？',PERIOD_OPTIONS]]as const;
 function save(event:React.FormEvent){event.preventDefault();try{writeReaderSituation(draft);setMessage('我的情况已保存到本机，首页会显示对应说法。');}catch{setMessage('这次未能保存，请重试；首页判断仍可阅读。');}}
 function reset(){try{writeReaderSituation(null);setDraft(EMPTY_SITUATION);setMessage('我的情况已重置，首页继续显示公开判断。');}catch{setMessage('重置未完成，请重试。');}}
 return <main id="main" className="reader-page situation-page"><p className="eyebrow">我的情况</p><h1>把判断放到自己的钱上</h1><p className="reader-intro">选一下计划、持仓和期限，也可以填入准备投向沪深300的金额。首页会把当前规则对应到这笔钱。</p><div className="situation-layout"><form onSubmit={save} className="situation-form">{groups.map(([key,title,options],index)=><fieldset key={key}><legend><span>{index+1}</span>{title}</legend><div className="choice-list">{options.map(([value,label])=><label key={value}><input type="radio" name={key} value={value} checked={draft[key]===value} onChange={()=>{setDraft({...draft,[key]:value});setMessage('');}}/><span>{label}</span></label>)}</div></fieldset>)}
 <fieldset><legend><span>4</span>准备投入多少钱？（可选）</legend><div className="situation-amounts">{([['monthly_amount','每月定投金额（元）','如 1000'],['idle_amount','手上准备投入的一笔闲钱（元）','如 50000']]as const).map(([key,label,placeholder])=><label key={key}>{label}<input type="number" inputMode="decimal" min="0" max={Number.MAX_SAFE_INTEGER} step="0.01" name={key} value={draft[key]??''} placeholder={placeholder} onChange={e=>{setDraft({...draft,[key]:e.target.value===''?undefined:Number(e.target.value)});setMessage('');}}/></label>)}</div></fieldset>
 <p className="reader-note">选择和金额仅存本机，金额只用于说明现有规则。</p>{unavailable&&<p role="status">本机记录暂不可用，可继续阅读首页判断。</p>}<div className="reader-actions"><button type="submit" disabled={!ready||unavailable}>保存我的情况</button><Link to="/">先看首页判断 →</Link>{situation&&<button type="button" className="secondary" onClick={reset}>重置</button>}</div>{message&&<p role="status">{message} <Link to="/">查看首页 →</Link></p>}</form>
 <aside className="situation-preview" aria-live="polite"><small>首页会这样对你说</small>{(()=>{const r=readingFor(draft,judgment);const money=situationMoney(draft,judgment);return <div className={judgment?`tone-${judgment.band}`:''}>{judgment&&<span className="situation-preview-band">沪深300 · {judgment.judgment.label}</span>}<h2 key={r.title}>{r.title}</h2>{money&&<p className="situation-preview-money">{money}</p>}<p>{r.body}</p>{r.rule&&<p className="situation-preview-rule">{r.rule}</p>}</div>;})()}<p className="situation-preview-note">随你的选择实时变化；保存后首页显示同样的说法。</p></aside></div></main>;
}
