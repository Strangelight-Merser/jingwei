import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {FEE_AWARE_OPERATION} from '../industry/fee-aware-operation.ts';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';
const result=await mutateState(async state=>{
 const versions=state.finance_versions.filter(v=>v.story_id===FEE_AWARE_OPERATION.story_id),prior=versions.filter(v=>v.published_at).sort((a,b)=>b.version-a.version)[0];
 if(!prior)throw new Error('initial_operation_missing');
 const hash=inputHash(FEE_AWARE_OPERATION.input_refs);
 if(prior.input_hash===hash&&JSON.stringify(prior.article)===JSON.stringify(FEE_AWARE_OPERATION.article))return {published:false,reason:'same_research'};
 const at=new Date().toISOString(),next={...structuredClone(FEE_AWARE_OPERATION),id:randomUUID(),version:Math.max(...versions.map(v=>v.version))+1,previous_version_id:prior.id,generated_at:at,published_at:at,input_hash:hash};
 next.interpretation.previous_claim_version_ids=[prior.id];state.finance_versions.push(next);
 return {published:true,id:next.id,version:next.version,previous_version_id:prior.id,published_at:at,as_of:next.as_of,market_data_as_of:next.article.operation_view?.market?.as_of};
});console.log(JSON.stringify(result));
