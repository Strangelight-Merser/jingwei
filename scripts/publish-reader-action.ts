import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {READER_ACTION_OPERATION} from '../industry/reader-action-operation.ts';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';
const result=await mutateState(async state=>{
 const versions=state.finance_versions.filter(v=>v.story_id===READER_ACTION_OPERATION.story_id),prior=versions.filter(v=>v.published_at).sort((a,b)=>b.version-a.version)[0];
 if(!prior)throw new Error('initial_operation_missing');
 const hash=inputHash(READER_ACTION_OPERATION.input_refs);
 if(prior.input_hash===hash&&JSON.stringify(prior.article)===JSON.stringify(READER_ACTION_OPERATION.article))return {published:false,reason:'same_research'};
 const at=new Date().toISOString(),next={...structuredClone(READER_ACTION_OPERATION),id:randomUUID(),version:Math.max(...versions.map(v=>v.version))+1,previous_version_id:prior.id,generated_at:at,published_at:at,input_hash:hash};
 next.interpretation.previous_claim_version_ids=[prior.id];state.finance_versions.push(next);
 return {published:true,id:next.id,version:next.version,previous_version_id:prior.id,published_at:at,as_of:next.as_of,market_data_as_of:next.article.operation_view?.market?.as_of};
});console.log(JSON.stringify(result));
