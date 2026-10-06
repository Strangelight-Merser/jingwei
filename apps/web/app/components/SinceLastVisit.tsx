import {useEffect,useRef,useState} from 'react';
import {judgmentVisit,readJudgmentVisit,sinceLastVisit,notifyJudgmentChange,type JudgmentVisit,type VisitJudgment} from '../lib/since-last-visit.ts';

export function SinceLastVisit({judgment:j}:{judgment:VisitJudgment}){
 const previous=useRef<{key:string;visit:JudgmentVisit|null}|null>(null);
 const [change,setChange]=useState<ReturnType<typeof sinceLastVisit>>(null);
 const [canRequest,setCanRequest]=useState(false);
 useEffect(()=>{
  try{
   const key=`jingwei.reader.judgment.${j.rule.id}`;
   if(previous.current?.key!==key)previous.current={key,visit:readJudgmentVisit(key)};
   const current=judgmentVisit(j);
   const summary=sinceLastVisit(previous.current.visit,current);
   localStorage.setItem(key,JSON.stringify(current));
   // Nothing new since last time is not worth a line on the page.
   const quiet=summary&&!summary.changed&&previous.current.visit?.rows===current.rows&&!current.pending;
   setChange(quiet?null:summary);
   setCanRequest(Boolean(summary?.changed)&&window.matchMedia('(min-width: 681px)').matches&&'Notification' in window&&Notification.permission==='default');
   if(summary?.changed)notifyJudgmentChange(j,summary.text);
  }catch{setCanRequest(false);}
 },[j]);
 async function allowNotification(){
  setCanRequest(false);
  try{if(await Notification.requestPermission()==='granted'&&change?.changed)notifyJudgmentChange(j,change.text);}catch{}
 }
 if(!change)return null;
 return <div className="since-last-visit" role="status"><p>{change.text}</p>{canRequest&&<button type="button" onClick={allowNotification}>允许改判提醒</button>}</div>;
}
