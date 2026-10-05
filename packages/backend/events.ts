import { randomUUID } from 'node:crypto';
import { sha256,stableJson } from './identity.ts';
import type { Material, CandidateEvent } from '../contracts/types.ts';
import type { State } from './storage.ts';
export function identifyEvent(m:Material):{key:string;subject:string;action:string;period:string|null;ready:boolean;reason:string|null} {
 const url=new URL(m.url);const fed=url.pathname.match(/monetary(\d{4})(\d{2})(\d{2})([ab])\.htm$/);
 const statement=/FOMC statement/i.test(m.title);
 const projections=/economic projections.*FOMC/i.test(m.title);
 if(m.source_id==='fed-monetary'&&fed&&((fed[4]==='a'&&statement)||(fed[4]==='b'&&projections))){const period=`${fed[1]}-${fed[2]}-${fed[3]}`;
  // Official statement and its same-meeting projections share a decision, not just a topic/date.
  const ready=fed[4]==='a'?m.paragraphs.some(p=>/target range|federal funds rate/i.test(p)):m.paragraphs.some(p=>/^Table original:.*\d/.test(p));
  return {key:`fomc:policy-decision:${period}`,subject:'FOMC',action:'政策利率决定',period,ready,reason:ready?null:'附表正文尚未取得，落地页不能代替经济预测数据'};
 }
 if(m.source_id==='nbs-release'){
  const period=m.title.match(/(20\d{2})年(?:([\d一二三四])(?:—|-|至)(\d{1,2})|([\d一二三四]{1,2}))月(?:份)?/);
  const action=[['零售','社会消费品零售'],['工业','工业生产'],['投资','固定资产投资'],['GDP','GDP核算']].find(([term])=>m.title.includes(term))?.[1];
  if(period&&action){const p=period[2]?`${period[1]}:${period[2]}-${period[3]}`:`${period[1]}:${period[4]}`;return {key:`nbs:${action}:${p}`,subject:'国家统计局',action,period:p,ready:m.paragraphs.some(p=>/\d.*%/.test(p)),reason:null};}
 }
 // Insufficient identity stays separate. A common topic cannot establish a common event.
 return {key:`unresolved:${m.id}`,subject:m.source_id,action:'待识别',period:null,ready:false,reason:'需从原文确认主体、动作与发生期；暂不与已有事件合并'};
}
export function syncCandidates(state:State,now=new Date().toISOString()){
 const latest=[...new Map([...state.materials].sort((a,b)=>a.revision-b.revision).map(m=>[m.id,m])).values()];
 const grouped=new Map<string,{identity:ReturnType<typeof identifyEvent>;materials:Material[]}>();
 for(const m of latest){const identity=identifyEvent(m);const g=grouped.get(identity.key)??{identity,materials:[]};g.materials.push(m);if(identity.ready)g.identity=identity;grouped.set(identity.key,g);}
 for(const [key,{identity,materials}] of grouped){
  const ready=materials.filter(m=>identifyEvent(m).ready);const topics=[...new Set(ready.flatMap(m=>m.topic_keys))];
  const topic=identity.subject==='FOMC'?'global-rates':topics.length===1?topics[0]:null;
  const previous=state.finance_versions.filter(v=>v.published_at&&v.input_refs.some(r=>materials.some(m=>m.url===r.url))).sort((a,b)=>b.version-a.version)[0];
  const eventId='event-'+sha256(key).slice(0,18);const old=state.events.find(e=>e.id===eventId);
  const event:CandidateEvent={id:eventId,event_key:key,story_id:old?.story_id??previous?.story_id??'story-'+sha256(key).slice(0,18),subject:identity.subject,action:identity.action,occurred_period:identity.period,title:ready[0]?.title??materials[0].title,topic_key:topic,material_ids:materials.map(m=>m.id),evidence_ready_ids:ready.map(m=>m.id),status:identity.period?(ready.length&&topic?'identified':'needs_evidence'):'needs_event',reason:!identity.period?identity.reason:!ready.length?identity.reason??'缺少可用于分析的原文数据':!topic?'暂未匹配到明确专题':null,updated_at:now};
  if(old)Object.assign(old,event);else state.events.push(event);
  const evidenceHash=sha256(stableJson(ready.map(m=>({id:m.id,revision:m.revision,hash:m.content_hash})).sort((a,b)=>a.id.localeCompare(b.id))));
  if(state.tasks.some(t=>t.event_id===eventId&&t.evidence_hash===evidenceHash))continue;
  for(const task of state.tasks.filter(t=>t.event_id===eventId&&t.status==='pending')){task.status='done';task.waiting_reason='replaced_by_new_evidence';task.updated_at=now;}
  const covered=ready.length>0&&ready.every(m=>previous?.input_refs.some(r=>r.article_id===m.id&&r.revision===m.revision));
  state.tasks.push({id:randomUUID(),event_id:eventId,evidence_hash:evidenceHash,status:covered?'done':'pending',waiting_reason:covered?'already_covered':event.status==='identified'?'model_setup_required':event.status,material_ids:ready.map(m=>m.id),version_id:covered?previous?.id??null:null,created_at:now,updated_at:now});
 }
 return {events:state.events.length,pending:state.tasks.filter(t=>t.status==='pending').length};
}
