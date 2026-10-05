import{useEffect,useState}from'react';import{Link}from'react-router';
import{PLAN_OPTIONS,HOLDING_OPTIONS,PERIOD_OPTIONS,EMPTY_SITUATION,type ReaderSituation}from'../../../../packages/contracts/reader-situation.ts';
import{useReaderSituation,writeReaderSituation}from'../lib/reader-situation.ts';
export function meta(){return[{title:'我的情况 · 经纬'}];}
export default function Situation(){
 const{ready,situation,unavailable}=useReaderSituation(),[draft,setDraft]=useState<ReaderSituation>(EMPTY_SITUATION),[message,setMessage]=useState('');
 useEffect(()=>{if(ready)setDraft(situation??EMPTY_SITUATION);},[ready,situation]);
 const groups=[['long_plan','有没有长期计划？',PLAN_OPTIONS],['holding','现在持有哪只？',HOLDING_OPTIONS],['holding_period','准备持有多久？',PERIOD_OPTIONS]]as const;
 function save(event:React.FormEvent){event.preventDefault();try{writeReaderSituation(draft);setMessage('已保存在本机，首页会按这项情境呈现。');}catch{setMessage('这次未能保存，请重试；公共研究仍可阅读。');}}
 function reset(){try{writeReaderSituation(null);setDraft(EMPTY_SITUATION);setMessage('已重置，首页继续显示公共研究。');}catch{setMessage('重置未完成，请重试。');}}
 return <main id="main" className="reader-page"><p className="eyebrow">我的情况</p><h1>让研究对应你的情境</h1><p className="reader-intro">三个选择，可随时改，也可以先跳过。计划和持仓只帮助你找到适用段落，结论仍取决于证据与原条件。</p><form onSubmit={save} className="situation-form">{groups.map(([key,title,options],index)=><fieldset key={key}><legend><span>{index+1}</span>{title}</legend><div className="choice-list">{options.map(([value,label])=><label key={value}><input type="radio" name={key} value={value} checked={draft[key]===value} onChange={()=>setDraft({...draft,[key]:value})}/><span>{label}</span></label>)}</div></fieldset>)}<p className="reader-note">仅保存在当前设备。更改这些选择不会发送给模型，也不会产生买卖判断。目前支持沪深300方向及上面的两只C类。</p>{unavailable&&<p role="status">本机记录暂不可用，可继续阅读公共研究。</p>}<div className="reader-actions"><button type="submit" disabled={!ready||unavailable}>保存我的情况</button><Link to="/">先读公共研究 →</Link>{situation&&<button type="button" className="secondary" onClick={reset}>重置</button>}</div>{message&&<p role="status">{message} <Link to="/">查看首页 →</Link></p>}</form></main>;
}
