import { z } from 'zod';
import type { CollectionRun } from '../../../packages/contracts/types.ts';

export const automaticConfigSchema=z.discriminatedUnion('enabled',[
 z.object({enabled:z.literal(false)}),
 z.object({enabled:z.literal(true),mode:z.enum(['collect','draft','publish']),interval_minutes:z.union([z.literal(60),z.literal(180),z.literal(360),z.literal(1440)]),source_ids:z.array(z.enum(['fed-monetary','nbs-release','csi300-products','csi300-market'])).min(1).max(4),publish_authorized:z.boolean().default(false)})
]);
export type AutomaticConfig=z.infer<typeof automaticConfigSchema>;
export type AutomaticSnapshot={enabled:boolean;mode:'collect'|'draft'|'publish';interval_minutes:number;source_ids:string[];status:'off'|'scheduled'|'running'|'paused';reason:string|null;next_run_at:string|null;last_started_at:string|null;last_finished_at:string|null;last_result:'collected'|'draft'|'published'|'unchanged'|'error'|'deferred'|null};
type ProcessResult={processed:boolean;updated?:boolean;id?:string;reason?:string};
type Dependencies={collect:(id:string)=>Promise<Pick<CollectionRun,'sources'>>;process:(ids:string[])=>Promise<ProcessResult>;publish:(id:string)=>Promise<unknown>;ready:()=>Promise<string|null>;now?:()=>number;schedule?:(fn:()=>void,ms:number)=>unknown;cancel?:(timer:unknown)=>void};

// A session timer inside the existing API process: no daemon, database, or automatic restart.
export function createSessionUpdater(deps:Dependencies){
 const now=deps.now??Date.now;
 const schedule=deps.schedule??((fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;});
 const cancel=deps.cancel??(timer=>clearTimeout(timer as ReturnType<typeof setTimeout>));
 let timer:unknown=null,generation=0,running=false;
 const state:AutomaticSnapshot={enabled:false,mode:'collect',interval_minutes:180,source_ids:['fed-monetary'],status:'off',reason:null,next_run_at:null,last_started_at:null,last_finished_at:null,last_result:null};
 const snapshot=()=>structuredClone(state);
 function stop(reason:string|null=null){generation++;if(timer!==null)cancel(timer);timer=null;state.enabled=false;state.next_run_at=null;state.reason=reason;state.status=reason?'paused':'off';return snapshot();}
 function arm(ms:number){state.status='scheduled';state.next_run_at=new Date(now()+ms).toISOString();timer=schedule(()=>{timer=null;void tick();},ms);}
 function fail(reason:string){stop(reason);state.last_result='error';}
 async function tick(){
  if(!state.enabled)return snapshot();
  if(timer!==null){cancel(timer);timer=null;}
  if(running){state.last_result='deferred';arm(state.interval_minutes*60000);return snapshot();}
  const runGeneration=generation,mode=state.mode,ids=[...state.source_ids];
  const modelSources=ids.filter(id=>!['csi300-products','csi300-market'].includes(id));let fundDraft=false;
  const current=()=>state.enabled&&generation===runGeneration;
  running=true;state.status='running';state.next_run_at=null;state.last_started_at=new Date(now()).toISOString();
  try{
   if(mode!=='collect'&&modelSources.length){const reason=await deps.ready();if(reason){fail(reason);return snapshot();}}
   for(const id of ids){
    if(!current())return snapshot();
    const collected=await deps.collect(id);
    if(!current())return snapshot();
    if(!collected.sources.length||collected.sources.some(s=>s.errors.length)){fail('collection_failed');return snapshot();}
    if(['csi300-products','csi300-market'].includes(id)&&collected.sources.some(s=>s.revised>0))fundDraft=true;
   }
   if(mode==='collect')state.last_result=fundDraft?'draft':'collected';
   else if(!modelSources.length)state.last_result=fundDraft?'draft':'unchanged';
   else if(current()){
    // One event per cycle; existing queue and input hashes avoid duplicate calls.
    const result=await deps.process(modelSources);
    if(!current())return snapshot();
    if(!result.processed&&result.reason!=='no_ready_task'){fail(result.reason??'generation_failed');return snapshot();}
    if(result.updated&&result.id){
     if(mode==='publish'){await deps.publish(result.id);if(current())state.last_result='published';}
     else state.last_result='draft';
    }else state.last_result=fundDraft?'draft':'unchanged';
   }
  }catch(e){
   if(current()){
    const reason=e instanceof Error?e.message:'';
    if(reason==='collection_busy'||reason==='task_busy')state.last_result='deferred';
    else fail(/^(budget_exhausted|model_setup_required|pricing_verification_failed)$/.test(reason)?reason:'update_failed');
   }
  }finally{
   running=false;state.last_finished_at=new Date(now()).toISOString();
   if(current())arm(state.interval_minutes*60000);
  }
  return snapshot();
 }
 async function configure(raw:unknown){
  const config=automaticConfigSchema.parse(raw);
  if(!config.enabled)return stop();
  if(config.mode==='publish'&&!config.publish_authorized)throw new Error('automatic_publication_not_authorized');
  if(config.mode==='publish'&&config.source_ids.every(id=>['csi300-products','csi300-market'].includes(id)))throw new Error('operation_automatic_publication_forbidden');
  if(config.mode!=='collect'&&config.source_ids.some(id=>!['csi300-products','csi300-market'].includes(id))){const reason=await deps.ready();if(reason)throw new Error(reason);}
  stop();state.enabled=true;state.mode=config.mode;state.interval_minutes=config.interval_minutes;state.source_ids=[...new Set(config.source_ids)];state.reason=null;
  // Enabling explicitly starts one check, followed by the chosen cadence.
  arm(1000);return snapshot();
 }
 return {snapshot,configure,stop,tick};
}
