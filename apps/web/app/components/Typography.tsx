import { Fragment } from 'react';
// Keep financial ranges and basis-point amounts together while leaving prose selectable.
export function ReadingText({text}:{text:string}){
 const parts=text.split(/(\d+(?:\.\d+)?%(?:—|–|-)\d+(?:\.\d+)?%|\d+(?:\.\d+)?个基点|\d+(?:\.\d+)?个百分点)/g);
 return <>{parts.map((part,i)=>i%2?<span className="numeric-phrase" key={i}>{part}</span>:<Fragment key={i}>{part}</Fragment>)}</>;
}
export function Headline({text}:{text:string}){const parts=text.split('，');return <>{parts.map((part,i)=><span className="headline-part" key={i}><ReadingText text={part+(i<parts.length-1?'，':'')}/></span>)}</>;}
