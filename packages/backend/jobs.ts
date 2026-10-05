import { SOURCES } from '../../industry/sources.ts';
import { discover,extract } from './collect.ts';
import { readState,mutateState } from './storage.ts';
import { modelState } from './model.ts';
import { randomUUID } from 'node:crypto';
import { syncCandidates } from './events.ts';
import {collectFundSnapshots} from './fund-sources.ts';
import {collectMarketSnapshot} from './market-sources.ts';
import {recordMarketSnapshot} from './market-updates.ts';
import {recordFundSnapshots} from './fund-updates.ts';
export async function collectOnce(sourceId?:string){
 const started_at=new Date().toISOString();const result:{source:string;discovered:number;stored:number;revised:number;errors:string[]}[]=[];
 for(const source of SOURCES.filter(s=>!sourceId||s.id===sourceId)){
  const summary={source:source.id,discovered:0,stored:0,revised:0,errors:[] as string[]};
  if(source.kind==='market_api'){
   try{const snapshot=await collectMarketSnapshot();const update=await recordMarketSnapshot(snapshot);summary.discovered=1;summary.revised=update.status==='draft_created'?1:0;}catch(e){summary.errors.push(e instanceof Error?e.message:'market_collection_failed');}
   result.push(summary);continue;
  }
  if(source.kind==='fund_pages'){
   const collected=await collectFundSnapshots();const update=await recordFundSnapshots(collected.snapshots);
   summary.discovered=collected.snapshots.length;summary.revised=update.status==='draft_created'?1:0;summary.errors=collected.errors;result.push(summary);continue;
  }
  try{const candidates=(await discover(source)).filter(c=>c.url&&c.title).slice(0,3);summary.discovered=candidates.length;
   for(const candidate of candidates){try{const state=await readState();const old=state.materials.filter(m=>m.url===candidate.url).sort((a,b)=>b.revision-a.revision)[0];const material=await extract(candidate,source,old);if(old?.content_hash===material.content_hash)continue;
    await mutateState(async s=>{s.materials.push(material);});if(old)summary.revised++;else summary.stored++;
   }catch(e){summary.errors.push(`${candidate.url}: ${e instanceof Error?e.message:'collection_error'}`);}}
  }catch(e){summary.errors.push(e instanceof Error?e.message:'collection_error');}result.push(summary);
 }
 const queue=await mutateState(async state=>{state.collection_runs.push({id:randomUUID(),started_at,finished_at:new Date().toISOString(),sources:result});return syncCandidates(state);});
 return {sources:result,queue,model:modelState(),publication:'unchanged',message:result.some(source=>source.errors.length)?'本次有官方资料请求未完成；已有原文、已刊文章与判断保留，未调用模型或直接发布。':'官方资料核查已完成，必要变化进入候选或待审草稿；未调用模型或直接发布。'};
}
