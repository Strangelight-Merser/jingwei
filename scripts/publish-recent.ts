import './write-env.ts';
import { mutateState } from '../packages/backend/storage.ts';
import { relatedClaims } from '../packages/backend/recall.ts';
import { recentFedArticle } from '../packages/backend/editorial/recent-fed.ts';
const result=await mutateState(async state=>{
 if(state.finance_versions.some(v=>v.story_id==='fed-september-2026'))return {published:false,reason:'already_published'};
 const material=state.materials.find(m=>m.url.endsWith('/monetary20260916a.htm'));if(!material)throw new Error('collect_official_release_first');
 const article=recentFedArticle(material,relatedClaims(material,state.finance_versions));state.finance_versions.push(article);
 return {published:true,slug:article.article.slug,origin:article.origin,as_of:article.as_of,source_revision:material.revision};
});console.log(JSON.stringify(result,null,2));
