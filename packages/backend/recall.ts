import { TOPICS } from '../../industry/topics.ts';
import type { FinanceVersion,Material } from '../contracts/types.ts';
// A long-lived topic retrieves context. It never converts a later event into the earlier story.
export function relatedClaims(material:Material,versions:FinanceVersion[]):FinanceVersion[]{
 const active=new Set<string>(TOPICS.filter(t=>t.active&&material.topic_keys.includes(t.key)).map(t=>t.key));
 const latest=new Map<string,FinanceVersion>();for(const v of versions)if(v.published_at&&active.has(v.interpretation.topic_key)&&(!latest.has(v.story_id)||latest.get(v.story_id)!.version<v.version))latest.set(v.story_id,v);
 return [...latest.values()].sort((a,b)=>b.as_of.localeCompare(a.as_of)).slice(0,8);
}
