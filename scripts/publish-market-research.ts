import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {MARKET_OPERATION} from '../industry/market-operation.ts';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';
const result=await mutateState(async state=>{
 const versions=state.finance_versions.filter(v=>v.story_id===MARKET_OPERATION.story_id);
 const prior=versions.filter(v=>v.published_at).sort((a,b)=>b.version-a.version)[0];
 if(!prior)throw new Error('initial_operation_missing');
 const hash=inputHash(MARKET_OPERATION.input_refs);
 if(prior.input_hash===hash&&prior.article.title===MARKET_OPERATION.article.title)return {published:false,reason:'same_research'};
 const at=new Date().toISOString();const next={...structuredClone(MARKET_OPERATION),id:randomUUID(),version:Math.max(...versions.map(v=>v.version))+1,previous_version_id:prior.id,generated_at:at,published_at:at,input_hash:hash};
 next.interpretation.previous_claim_version_ids=[prior.id];state.finance_versions.push(next);
 return {published:true,id:next.id,version:next.version,previous_version_id:prior.id,published_at:at,as_of:next.as_of,market_data_as_of:next.article.operation_view?.market?.as_of};
});console.log(JSON.stringify(result));
