import './write-env.ts';
import { mutateState } from '../packages/backend/storage.ts';
import { applyEditorialCopy,EDITORIAL_COPY } from '../packages/backend/editorial/copy-20261002.ts';
const result=await mutateState(async state=>{
 let edited=0;for(const v of state.finance_versions){
  if(v.origin!=='editor'||!v.published_at||!EDITORIAL_COPY[v.article.slug])continue;
  const revised=applyEditorialCopy(v);
  // This is a copy edit of the initial editorial release, not a new evidence-driven analytical version.
  if(v.version!==1)throw new Error('Expected initial editorial version; later revisions need separate review');
  Object.assign(v,revised);edited++;
 }return {edited};
});console.log(JSON.stringify(result));
