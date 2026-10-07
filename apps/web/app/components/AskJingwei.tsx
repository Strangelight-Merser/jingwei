import {useEffect, useState} from 'react';
import {Link, useFetcher, useSearchParams} from 'react-router';
import type {AskFragment, AskPreview, AskRecord, AskResult} from '../../../../packages/contracts/ask.ts';
import {isIndexCode, VALUATION_INDEXES, type IndexCode} from '../../../../packages/backend/valuation-indexes.ts';
import '../ask.css';

const suggestions=['为什么是现在这个判断？','什么情况下会改判？','低估也会继续跌吗？','已有持仓应该怎么看这个判断？'];
const fee=(micro:number)=>(micro/1e6).toFixed(6);
const errors:Record<string,string>={ask_estimate_changed:'规则或费用估算已更新，请重新估算后提问。',maintenance_read_only:'当前仅开放阅读，提问暂未开放。',manual_collection_only:'当前仅开放手动采集，提问暂未开放。',invalid_ask_request:'请填写问题并重新估算费用。'};

export function AskCitations({fragments,open=false}:{fragments:AskFragment[];open?:boolean}) {
 return <details className="ask-citations" open={open}><summary>{open?'当前规则原文':'查看所引片段原文'}（{fragments.length}条）</summary>{fragments.map(f=><p key={f.id}><strong>片段 {f.id}</strong><br/>{f.text}</p>)}</details>;
}

export function AskHistory({records}:{records:AskRecord[]}) {
 return <section className="owner-section ask-history"><h2>问经纬 · 本机最近记录</h2><p className="owner-help">保留最近40次问答。费用为共享账本的预留上限，实际账单以模型服务为准。</p>{records.length===0?<p>还没有问答记录。</p>:[...records].reverse().map(r=><details key={r.id}><summary>{r.question}</summary><p>{new Date(r.at).toLocaleString('zh-CN')} · {r.model} · {r.status==='answered'?'已作答':r.status==='rejected'?'未通过回答检查':'未启动模型'}</p><p>{r.answer}</p><p>估算 ¥{fee(r.estimate_micro_cny)} · 已预留 ¥{fee(r.reserved_micro_cny)}</p><AskCitations fragments={r.cites}/></details>)}</section>;
}

export function AskJingwei() {
 // Follows the index chosen in the home hero (kept in the URL), so answers cite that index's rule.
 const [params]=useSearchParams();
 const selected=params.get('index');
 const index=isIndexCode(selected)?selected:'000300';
 return <AskForIndex key={index} index={index}/>;
}

function AskForIndex({index}:{index:IndexCode}) {
 const [question,setQuestion]=useState(suggestions[0]);
 const estimate=useFetcher<AskPreview|{error:string}>();
 const answer=useFetcher<AskResult|{error:string}>();
 const [result,setResult]=useState<AskResult|null>(null);
 useEffect(()=>{estimate.load('/ask?'+new URLSearchParams({question:question.trim()||suggestions[0],index}));setResult(null);},[index]);
 useEffect(()=>{if(answer.data&&'record' in answer.data)setResult(answer.data);},[answer.data]);
 const preview=estimate.data&&'quote' in estimate.data&&estimate.data.question===question.trim()?estimate.data:null;
 const asking=answer.state!=='idle',estimating=estimate.state!=='idle';
 function edit(value:string){setQuestion(value);}
 function price(){estimate.load('/ask?'+new URLSearchParams({question:question.trim(),index}));}
 return <section className="ask-jingwei" aria-labelledby="ask-heading">
  <div className="ask-heading"><h2 id="ask-heading">问经纬</h2><span>AI 解读 · {VALUATION_INDEXES[index].name}</span></div>
  <p className="ask-intro">问问当前判断的依据和改判条件。只发送你的问题与公开规则，不发送“我的情况”；请勿在问题中填写个人信息。</p>
  <div className="ask-suggestions" aria-label="建议问题">{suggestions.map(q=><button type="button" key={q} disabled={asking} onClick={()=>edit(q)}>{q}</button>)}</div>
  <form onSubmit={event=>{event.preventDefault();if(!preview){price();return;}if(preview.ready)answer.submit({question:preview.question,quote:preview.quote,index},{method:'post',action:'/ask'});}}>
   <label htmlFor="ask-question">你的问题</label><textarea id="ask-question" name="question" maxLength={300} required rows={2} value={question} disabled={asking} onChange={event=>edit(event.target.value)}/>
   <div className="ask-actions"><button type="submit" disabled={asking||estimating||!question.trim()||Boolean(preview&&!preview.ready)}>{asking?'正在回答…':estimating?'正在估算…':preview?'提问':'估算费用'}</button>{preview&&<p>本次估算上限 <strong>¥{fee(preview.estimate_micro_cny)}</strong><br/><span>与研究共用授权额度 · 预留额不是实际账单</span></p>}</div>
   {preview?.message&&<p className="ask-state" role="status">{preview.message} · <Link to="/settings/model">模型设置 →</Link></p>}
   {estimate.data&&'error' in estimate.data&&<p className="ask-state" role="status">暂时无法估算费用，请稍后重试。</p>}
   {answer.data&&'error' in answer.data&&<p className="ask-state" role="status">{errors[answer.data.error]??'这个问题暂时答不好，请稍后重试。'}</p>}
  </form>
  {result&&<div className="ask-answer" aria-live="polite"><h3>{result.record.question}</h3><p>{result.record.answer}</p><small>{result.record.model} · {new Date(result.record.at).toLocaleString('zh-CN')} · 已预留上限 ¥{fee(result.record.reserved_micro_cny)}</small><AskCitations fragments={result.record.cites} open={result.record.status!=='answered'}/></div>}
 </section>;
}
