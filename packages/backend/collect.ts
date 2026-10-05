// RSS parsing adapted from AIHOT sources/rss.ts. Extraction is restricted to configured official sites.
import { XMLParser } from 'fast-xml-parser';
import { load } from 'cheerio';
import { sha256 } from './identity.ts';
import type { Source } from '../../industry/sources.ts';
import type { Material } from '../contracts/types.ts';
import { TOPICS } from '../../industry/topics.ts';
export type Candidate={url:string;title:string;published_at:string};
const arr=<T>(v:T|T[]|undefined):T[]=>v===undefined?[]:Array.isArray(v)?v:[v];
function text(v:unknown):string {if(v===null||v===undefined)return '';if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return text(v[0]);if(typeof v==='object'){const o=v as Record<string,unknown>;return text(o['#cdata']??o['#text']);}return '';}
export function parseFeed(xml:string):Candidate[]{
 const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',textNodeName:'#text',cdataPropName:'#cdata',processEntities:true,htmlEntities:true,trimValues:true});
 const doc=parser.parse(xml); const rss=arr<Record<string,unknown>>(doc.rss?.channel?.item??doc['rdf:RDF']?.item);
 if(rss.length)return rss.map(it=>({url:text(it.link)||text(it.guid),title:text(it.title),published_at:text(it.pubDate)||text(it['dc:date'])}));
 return arr<Record<string,unknown>>(doc.feed?.entry).map(it=>{const links=arr<Record<string,string>>(it.link as Record<string,string>);return {url:(links.find(l=>!l['@rel']||l['@rel']==='alternate')??links[0])?.['@href']??'',title:text(it.title),published_at:text(it.published)||text(it.updated)};});
}
async function officialText(url:string,source:Source):Promise<string>{
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!==source.host)throw new Error('outside_configured_official_source');
 const res=await fetch(url,{headers:{'User-Agent':'JingweiResearch/0.1 (local financial reading prototype)'},signal:AbortSignal.timeout(15000)});
 if(new URL(res.url).hostname!==source.host)throw new Error('unexpected_source_redirect');
 if(!res.ok)throw new Error(`source_http_${res.status}`);return res.text();
}
export function parseWebList(html:string,source:Source):Candidate[]{const $=load(html);const found:Candidate[]=[];$('a[href]').each((_,a)=>{const href=$(a).attr('href');if(!href)return;try{const url=new URL(href,source.url).toString();const title=$(a).text().trim();if(new URL(url).hostname===source.host&&source.link_pattern?.test(url)&&title.length>8)found.push({url,title,published_at:''});}catch{}});return [...new Map(found.map(v=>[v.url,v])).values()];}
export async function discover(source:Source):Promise<Candidate[]>{const body=await officialText(source.url,source);return source.kind==='rss'?parseFeed(body):parseWebList(body,source);}
export function projectionRows(html:string,url:string):string[]{
 const $=load(html);const table=$('table').first();const rows=table.find('tr').toArray();
 const groups=$(rows[0]).find('th,td').toArray().slice(1).map(td=>({label:$(td).text().trim(),span:Number($(td).attr('colspan')??1)}));
 const years=$(rows[1]).find('th,td').toArray().map(td=>$(td).text().trim());
 if(groups.length!==3||groups.some(g=>g.span!==5)||years.length!==15)throw new Error('projection_table_structure_changed');
 const output:string[]=[];let variable='';
 for(const row of rows.slice(2)){
  const cells=$(row).find('th,td').toArray().map(td=>$(td).text().replace(/\s+/g,' ').trim());if(cells.length!==16)continue;
  const label=cells[0];if(!label.toLowerCase().includes('projection'))variable=label;
  const values=groups.map((group,g)=>`${group.label}: `+years.slice(g*5,g*5+5).map((year,i)=>`${year}=${cells[1+g*5+i]||'not provided'}`).join('; ')).join(' | ');
  output.push(`Table original: ${url} | ${variable}${label!==variable?' / '+label:''} | ${values}`);
 }
 return output;
}
export async function extract(candidate:Candidate,source:Source,old?:Material):Promise<Material>{
 const $=load(await officialText(candidate.url,source));const root=$(source.body_selector);if(!root.length)throw new Error('official_body_selector_no_match');
 root.find('script,style,nav,footer').remove();const paragraphs=root.find('p').toArray().map(p=>$(p).text().replace(/\s+/g,' ').trim()).filter(p=>p.length>=16);
 if(!paragraphs.length)throw new Error('no_original_paragraphs');
 if(source.id==='fed-monetary'&&/monetary\d{8}b\.htm$/.test(candidate.url)){
  const href=$('a').toArray().find(a=>$(a).text().trim()==='Accessible Materials');const link=href&&$(href).attr('href');
  if(link){const url=new URL(link,candidate.url).toString();const body=await officialText(url,source);paragraphs.push(...projectionRows(body,url));const linked=load(body);const notes=linked('p').toArray().map(p=>linked(p).text().replace(/\s+/g,' ').trim()).filter(p=>/^In conjunction with the Federal Open Market Committee|^Percent$|^Note: Projections|^\d\. (?:For each period|The central tendency|The range)/.test(p));if(!notes.some(p=>p.startsWith('Note: Projections')))throw new Error('projection_statistical_notes_missing');paragraphs.push(...notes.slice(0,8));}
 }
 let published=candidate.published_at;const meta=$('meta[name="PubDate"],meta[name="publishdate"],meta[property="article:published_time"]').first().attr('content');
 if(!published)published=meta??$('.detail-time,.time,.date,.article__time').first().text().trim();
 const t=Date.parse(published);if(!Number.isFinite(t))throw new Error('source_publication_time_missing');
 // Preserve the original date when available; never replace it with collection time.
 const published_at=new Date(t).toISOString();const content_hash=sha256(JSON.stringify({published_at,paragraphs}));
 return {id:old?.id??sha256(candidate.url).slice(0,24),source_id:source.id,url:candidate.url,title:candidate.title,published_at,revision:old?(old.content_hash===content_hash?old.revision:old.revision+1):1,content_hash,paragraphs,collected_at:new Date().toISOString(),topic_keys:TOPICS.filter(topic=>topic.terms.some(term=>[candidate.title,...paragraphs].join(' ').toLowerCase().includes(term.toLowerCase()))).map(t=>t.key)};
}
