import {randomUUID} from 'node:crypto';
import {readState,mutateState,storageConfiguration} from './storage.ts';
import {collectResearchEvidence} from './fund-evidence.ts';
import {buildResearchSnapshot,composeFundResearch,evaluateResearchSnapshot,fundResearchPrompt} from './fund-research.ts';
import type {ResearchSnapshot} from '../contracts/research.ts';
import type {FinanceVersion} from '../contracts/types.ts';
import {setupWaitingReason,estimateReservation,sessionState,PRICE_POLICY} from './budget.ts';
import {modelMessages} from './model.ts';
import {sha256} from './identity.ts';
import {toMarketEvidence} from './market-sources.ts';
import {requiredFundDocuments} from './fund-document-bodies.ts';
import type {ResearchEvidence} from './fund-evidence.ts';
import {FUND_STORY_ID} from './fund-updates.ts';
import {refreshValuationState,valuationRuleEvidence} from './judgment.ts';

export type ResearchCheck={id:string;started_at:string;finished_at:string;status:'partial'|'failed'|'updated'|'unchanged'|'model_waiting';evidence_hash:string|null;source_errors:string[];version_id:string|null;message:string};
export type ResearchState={settings:{enabled:boolean;interval_minutes:number;model_enabled:boolean};latest_snapshot?:ResearchSnapshot;checks:ResearchCheck[];processed_hashes:{hash:string;result:'maintained'|'published'|'failed'|'running';version_id:string|null}[];followed_topics:string[]};
export const defaultResearchState=():ResearchState=>({settings:{enabled:true,interval_minutes:180,model_enabled:false},checks:[],processed_hashes:[],followed_topics:[]});
const currentResearch=(state:Awaited<ReturnType<typeof readState>>)=>state.research_state??defaultResearchState();
const latestVersion=(versions:FinanceVersion[])=>versions.filter(v=>v.published_at&&v.story_id===FUND_STORY_ID).sort((a,b)=>b.version-a.version)[0]??null;
type Provider=Parameters<typeof composeFundResearch>[2];
type Collector=typeof collectResearchEvidence;

/** Retain independently dated last-good sources; a transient failure is not new paid evidence. */
export function mergeResearchEvidence(evidence:ResearchEvidence,previous?:ResearchSnapshot):ResearchEvidence{
 if(!previous)return evidence;
 const funds=new Map(previous.funds.map(f=>[f.code,structuredClone(f)]));
 for(const f of evidence.funds){const old=funds.get(f.code);funds.set(f.code,{...f,fields:{...old?.fields,...f.fields}});}
 const series=new Map((previous.fund_series??[]).map(s=>[s.code,structuredClone(s)]));
 for(const s of evidence.fund_series){const old=series.get(s.code);if(!old||s.nav.at(-1)!.date>=old.nav.at(-1)!.date)series.set(s.code,s);}
 const market=evidence.market&&(!previous.market||evidence.market.as_of>=previous.market.as_of)?evidence.market:previous.market;
 const documentMap=new Map((previous.documents??[]).map(d=>[d.url,structuredClone(d)]));
 for(const document of evidence.documents){const old=documentMap.get(document.url);documentMap.set(document.url,document.status==='discovered'&&old?.status==='read'?{...old,body_error:document.body_error}:document);}
 const documents=[...documentMap.values()].filter(d=>['007339','005658'].includes(d.code));
 const other=new Map((previous.other_directions??[]).map(d=>[d.direction_key,d]));for(const d of evidence.other_directions??[]){const old=other.get(d.direction_key);if(!old||d.as_of>=old.as_of)other.set(d.direction_key,d);}
 const valuation_rule=evidence.valuation_rule??previous.valuation_rule;
 const merged={...evidence,funds:[...funds.values()],fund_series:[...series.values()] as ResearchEvidence['fund_series'],market,documents,other_directions:[...other.values()],...(valuation_rule?{valuation_rule}:{})};
 merged.refs=[...merged.funds.flatMap(f=>Object.values(f.fields).flatMap(v=>v?[v.source]:[])),...merged.fund_series.map(s=>s.ref),...documents.filter(d=>d.status==='read').map(d=>d.ref),...merged.other_directions.map(d=>d.ref),...(market?[toMarketEvidence(market).source]:[]),...(valuation_rule?[valuation_rule.ref]:[])];
 return merged;
}

/** Free evidence checks and model research are distinct, durable steps. No credential is read here. */
export function createResearchService({collector,provider,valuation,now=()=>new Date(),schedule=(fn:()=>void,ms:number)=>{const t=setTimeout(fn,ms);t.unref();return t;},cancel=(t:unknown)=>clearTimeout(t as ReturnType<typeof setTimeout>)}:{collector?:Collector;provider?:Provider;now?:()=>Date;schedule?:(fn:()=>void,ms:number)=>unknown;cancel?:(timer:unknown)=>void;valuation?:(()=>Promise<unknown>)|null}={}){
 // Injected collectors (tests, desktop) opt in to the valuation refresh explicitly.
 const refreshValuation=valuation===undefined?(collector?null:()=>refreshValuationState()):valuation;
 const fetchEvidence=collector??(async()=>{const previous=(await readState()).research_state?.latest_snapshot;return collectResearchEvidence({priorSnapshots:previous?.funds??[],priorDocuments:previous?.documents??[]});});
 let timer:unknown=null,busy=false,processing=false,closed=false,nextCheck:string|null=null;
 const stamp=()=>now().toISOString();
 async function saveCheck(check:ResearchCheck){await mutateState(async state=>{const research=state.research_state??=defaultResearchState();research.checks.push(check);research.checks=research.checks.slice(-40);});}
 async function processLatest({explicit=false,expected_hash,expected_previous_id,expected_request_hash}:{explicit?:boolean;expected_hash?:string;expected_previous_id?:string|null;expected_request_hash?:string}={}){
  if(processing)return {status:'unchanged' as const,message:'本次研究正在进行，没有重复调用。',version_id:null};
  processing=true;try{return await processSnapshot(explicit,expected_hash,expected_previous_id,expected_request_hash);}finally{processing=false;}
 }
 async function processSnapshot(explicit:boolean,expected_hash?:string,expected_previous_id?:string|null,expected_request_hash?:string){
  const state=await readState(),research=currentResearch(state),snapshot=research.latest_snapshot;
  if(!snapshot)return {status:'failed' as const,message:'尚未取得可用于研究的官方资料。',version_id:null};
  if((expected_hash&&expected_hash!==snapshot.evidence_hash)||(expected_previous_id!==undefined&&expected_previous_id!==(latestVersion(state.finance_versions)?.id??null)))return {status:'failed' as const,message:'待研究资料或此前版本已变化，请重新查看本次费用与范围。',version_id:null};
  if(expected_request_hash&&expected_request_hash!==sha256(JSON.stringify(modelMessages(fundResearchPrompt({snapshot,evaluation:evaluateResearchSnapshot(snapshot,latestVersion(state.finance_versions)),previous:latestVersion(state.finance_versions)})))))return {status:'failed' as const,message:'待发请求已变化，请重新查看本次费用与范围。',version_id:null};
  const processed=research.processed_hashes.find(item=>item.hash===snapshot.evidence_hash);
  if(processed&&!(explicit&&['failed','running'].includes(processed.result)))return {status:['failed','running'].includes(processed.result)?'failed' as const:'unchanged' as const,message:['failed','running'].includes(processed.result)?'这组资料的研究未完成，已保留原判断；需要明确重试。':'这组证据已评估，保留原判断与资料日期。',version_id:processed.version_id};
  // Injected providers are accepted only in explicitly isolated developer checks.
  if(provider&&!storageConfiguration().testMode)throw new Error('research_test_provider_requires_isolation');
  const waiting=provider?null:await setupWaitingReason();
  if(waiting)return {status:'model_waiting' as const,message:'官方资料已核查，新的研究解读尚未生成；已有文章保留原日期。',version_id:null};
  const previous=latestVersion(state.finance_versions);
  await mutateState(async latest=>{const r=latest.research_state??=defaultResearchState();r.processed_hashes=r.processed_hashes.filter(item=>item.hash!==snapshot.evidence_hash);r.processed_hashes.push({hash:snapshot.evidence_hash,result:'running',version_id:null});r.processed_hashes=r.processed_hashes.slice(-64);});
  try{
   const version=await composeFundResearch(snapshot,previous,provider);
   if(closed)return {status:'unchanged' as const,message:'软件已退出，未刊发本次研究。',version_id:null};
   const outcome=await mutateState(async latest=>{
    const r=latest.research_state??=defaultResearchState();
    if(r.latest_snapshot?.evidence_hash!==snapshot.evidence_hash||latestVersion(latest.finance_versions)?.id!==previous?.id)return {status:'unchanged' as const,message:'资料或当前研究已变化，等待最新证据评估。',version_id:null};
    if(r.processed_hashes.some(item=>item.hash===snapshot.evidence_hash&&['published','maintained'].includes(item.result)))return {status:'unchanged' as const,message:'这组证据已评估，没有重复刊发。',version_id:null};
    if(version){
     version.version=Math.max(0,...latest.finance_versions.filter(v=>v.story_id===version.story_id).map(v=>v.version))+1;
     version.previous_version_id=previous?.id??null;version.published_at=stamp();latest.finance_versions.push(version);
    }
    r.processed_hashes=r.processed_hashes.filter(item=>item.hash!==snapshot.evidence_hash);
    r.processed_hashes.push({hash:snapshot.evidence_hash,result:version?'published':'maintained',version_id:version?.id??previous?.id??null});r.processed_hashes=r.processed_hashes.slice(-64);
    return {status:version?'updated' as const:'unchanged' as const,message:version?'本期研究已更新，可查看结论、适用条件与这次变化。':'新证据没有改变研究结论，原判断与版本保留。',version_id:version?.id??previous?.id??null};
   });return outcome;
  }catch{
   // A failed paid request is not automatically retried on every collection cycle.
   await mutateState(async latest=>{const r=latest.research_state??=defaultResearchState();r.processed_hashes=r.processed_hashes.filter(item=>item.hash!==snapshot.evidence_hash);r.processed_hashes.push({hash:snapshot.evidence_hash,result:'failed',version_id:null});r.processed_hashes=r.processed_hashes.slice(-64);});
   return {status:'failed' as const,message:'本次研究未完成，已刊判断与原资料日期保留。',version_id:null};
  }
 }
 async function check({generate=false}:{generate?:boolean}={}){
  if(busy)return {status:'checking' as const,message:'正在核查官方资料。'};
  busy=true;const started_at=stamp();
  try{
   // The rule judgment uses its own official series; its failure never blocks fund evidence.
   if(refreshValuation)await refreshValuation().catch(()=>console.warn('valuation_refresh_failed'));
   const fetched=await fetchEvidence(),rule=refreshValuation?valuationRuleEvidence(await readState()):null,evidence={...fetched,...(rule?{valuation_rule:rule}:{})},prior=(await readState()).research_state?.latest_snapshot,snapshot=buildResearchSnapshot(mergeResearchEvidence(evidence,prior));
   // Check completion is public health information; it does not replace the content's first observation.
   snapshot.evidence_observed_at=prior?.evidence_hash===snapshot.evidence_hash?(prior.evidence_observed_at??prior.captured_at):snapshot.captured_at;
   if(closed)return {status:'failed' as const,message:'软件已退出，本次核查未提交。'};
   const usable=snapshot.refs.length>0,freshUsable=Boolean(evidence.market||evidence.funds.length||evidence.fund_series.length);
   await mutateState(async state=>{const r=state.research_state??=defaultResearchState();if(usable)r.latest_snapshot=snapshot;});
   const processed=usable&&freshUsable&&generate?await processLatest():null;
   const status=processed?.status??(!freshUsable?'failed':snapshot.errors.length?'partial':'model_waiting');
   const message=processed?.message??(!freshUsable?'本次未取得可用的新资料，保留最后成功的官方记录、研究与原日期。':snapshot.errors.length?'部分官方资料已核查；未取得的项目保留最后成功记录与原日期，不影响其他可用资料。':'官方资料已核查；研究解读等待本机AI配置与明确授权。');
   const result:ResearchCheck={id:randomUUID(),started_at,finished_at:stamp(),status,evidence_hash:usable?snapshot.evidence_hash:null,source_errors:snapshot.errors,version_id:processed?.version_id??null,message};await saveCheck(result);return result;
  }catch{
   const result:ResearchCheck={id:randomUUID(),started_at,finished_at:stamp(),status:'failed',evidence_hash:null,source_errors:['official_collection_unavailable'],version_id:null,message:'本次官方资料核查未完成，原文章与判断保留。'};await saveCheck(result);return result;
  }finally{busy=false;}
 }
 async function arm(delay?:number){
  if(closed)return;
  if(timer!==null)cancel(timer);
  const research=currentResearch(await readState());if(!research.settings.enabled){nextCheck=null;return;}
  const latest=research.checks.at(-1),normal=research.settings.interval_minutes*60000;
  const wait=delay??(latest?.status==='failed'||latest?.source_errors.length?Math.min(normal,20*60000):normal);
  nextCheck=new Date(now().getTime()+wait).toISOString();timer=schedule(()=>{timer=null;void tick();},wait);
 }
 async function tick(){try{const state=currentResearch(await readState());if(!state.settings.enabled||closed)return;await check({generate:state.settings.model_enabled});}finally{await arm();}}
 async function start(){
  const state=currentResearch(await readState());if(!state.settings.enabled)return;
  const last=state.checks.at(-1),period=state.settings.interval_minutes*60000,retry=last?.status==='failed'||last?.source_errors.length?Math.min(period,20*60000):period,due=last?Date.parse(last.finished_at)+retry:0;
  await arm(Math.max(1000,due-now().getTime()));
 }
 async function configure(settings:ResearchState['settings']){
  if(settings.enabled&&settings.model_enabled){const waiting=await setupWaitingReason();if(waiting)throw new Error(waiting);}
  await mutateState(async state=>{const r=state.research_state??=defaultResearchState();r.settings=settings;});
  if(settings.enabled)await arm(1000);else{if(timer!==null)cancel(timer);timer=null;nextCheck=null;}
  return status();
 }
 async function status(){return researchUpdateStatus(await readState(),{checking:busy,next_check_at:nextCheck});}
 function stop(){closed=true;if(timer!==null)cancel(timer);timer=null;nextCheck=null;}
 async function preview(){const state=await readState(),budget=state.budget?{limit_cny:state.budget.limit_micro_cny/1e6,reserved_cny:state.budget.reserved_micro_cny/1e6,requests:state.budget.reservations.length}:null,snapshot=currentResearch(state).latest_snapshot,previous=latestVersion(state.finance_versions);if(!snapshot)return {session:sessionState(),budget,ready:false as const};const evaluation=evaluateResearchSnapshot(snapshot,previous),prompt=fundResearchPrompt({snapshot,evaluation,previous}),messages=modelMessages(prompt);return {session:sessionState(),budget,ready:true as const,evidence_hash:snapshot.evidence_hash,previous_version_id:previous?.id??null,previous_version:previous?.version??null,as_of:snapshot.market?.as_of??null,captured_at:snapshot.captured_at,reservation_cny:estimateReservation(JSON.stringify(messages))/1e6,request_hash:sha256(JSON.stringify(messages)),input_bytes:Buffer.byteLength(JSON.stringify(messages),'utf8'),max_output_tokens:PRICE_POLICY.max_output_tokens,pricing:PRICE_POLICY,summary:{funds:snapshot.funds.map(f=>({code:f.code,fields:Object.keys(f.fields)})),nav_series:(snapshot.fund_series??[]).map(s=>({code:s.code,observations:s.nav.length,first_date:s.nav[0]?.date,last_date:s.nav.at(-1)?.date})),documents_read:evaluation.checks.document_body_read.status!=='not_assessable',document_coverage:requiredFundDocuments(snapshot.documents??[],snapshot.funds.map(f=>f.code)).map(d=>({code:d.code,title:d.title,published_at:d.published_at,status:d.status,read_scope:d.body?.read_scope??null,body_error:d.body_error??null})),other_directions:(snapshot.other_directions??[]).map(d=>({name:d.index_name,as_of:d.as_of,coverage:d.coverage}))},evaluation};}
 return {check,processLatest,preview,start,configure,status,stop};
}

export function researchUpdateStatus(state:Awaited<ReturnType<typeof readState>>,runtime:{checking?:boolean;next_check_at?:string|null}={}){
 const r=currentResearch(state),last=r.checks.at(-1);return {status:runtime.checking?'checking' as const:last?.status??'idle' as const,last_checked_at:last?.finished_at??null,last_success_at:[...r.checks].reverse().find(c=>c.evidence_hash)?.finished_at??null,next_check_at:runtime.next_check_at??null,source_errors:last?.source_errors??[],message:runtime.checking?'正在核查官方资料。':last?.message??'软件运行时核查官方资料，下次打开会补查。',enabled:r.settings.enabled};
}
export async function readingResearch(){const state=await readState(),r=currentResearch(state);return {update:researchUpdateStatus(state),evaluation:r.latest_snapshot?evaluateResearchSnapshot(r.latest_snapshot):null,as_of:r.latest_snapshot?.market?.as_of??null};}
