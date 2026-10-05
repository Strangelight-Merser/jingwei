import './write-env.ts';
import {FIRST_OPERATION} from '../industry/first-operation.ts';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';
// Publish verified editorial research locally. Re-running cannot replace a published version.
const result=await mutateState(async state=>{
 if(state.finance_versions.some(v=>v.id===FIRST_OPERATION.id))return {published:false,reason:'already_published'};
 const at=new Date().toISOString();
 state.finance_versions.push({...FIRST_OPERATION,generated_at:at,published_at:at,input_hash:inputHash(FIRST_OPERATION.input_refs)});
 return {published:true,version_id:FIRST_OPERATION.id,at};
});
console.log(JSON.stringify(result));
