import type {ResearchEvaluation} from '../../../../packages/contracts/research.ts';
import type {SourceRef} from '../../../../packages/contracts/types.ts';
import {Link,useLoaderData} from 'react-router';
import {publication} from '../lib/api.server.ts';
import type {homePublication} from '../../../../packages/backend/publication.ts';
import {ArticleBrief} from '../components/ResearchBrief.tsx';
import type {ResearchUpdate} from '../components/ResearchBrief.tsx';
import {ArticleRow} from '../components/ArticleRow.tsx';
import {Arrow} from '../components/Arrow.tsx';
import {SituationCard} from '../components/SituationCard.tsx';
import {SinceLastVisit} from '../components/SinceLastVisit.tsx'; import {AskJingwei} from '../components/AskJingwei.tsx';
import {RuleJudgment,type Judgment} from '../components/RuleJudgment.tsx';
export async function loader(){
 const [home,judgment]=await Promise.all([publication<Awaited<ReturnType<typeof homePublication>>&{research_update?:ResearchUpdate;research_facts?:ResearchEvaluation|null;research_data_as_of?:string|null;research_source_refs?:SourceRef[];research_evidence_hash?:string|null}>('home'),publication<Judgment>('judgment').catch(()=>null)]);
 return {...home,judgment};
}
export function meta(){return [{title:'经纬 · 研究与阅读'},{name:'description',content:'依据公开资料研究市场方向和基金工具，保留原日期与复核条件。'}];}
export default function Home(){
 const {judgment,lead,selections,background,topics}=useLoaderData<typeof loader>();
 if(!lead)return <main id="main" className="error-page"><h1>内容还在准备中</h1><p>目前还没有已刊文章，可以先浏览专题。</p><Link className="text-link" to="/topics">浏览专题 <Arrow/></Link></main>;
 const all=[lead,...selections];const research=all.find(v=>v.research);const historical=all.find(v=>v.article.operation_view);
 const focus=research??historical??lead;
 const order=['csi300-etf-and-share-classes','lpr-june-unchanged','growth-and-demand-2025'];
 const chosen=[lead,...selections,...background].filter(v=>order.includes(v.article.slug)&&v.id!==focus.id).sort((a,b)=>order.indexOf(a.article.slug)-order.indexOf(b.article.slug));
 return <main id="main" className="home-page">
  {judgment&&<RuleJudgment j={judgment}/>}
  {judgment&&<SinceLastVisit judgment={judgment}/>}
  {judgment&&<AskJingwei/>}
  <SituationCard version={focus} judgment={judgment}/>
  <ArticleBrief version={focus}/>
  <div className="home-reading"><section><div className="section-top"><h2>背景阅读</h2><Link to="/articles">全部文章 <Arrow/></Link></div>{chosen.map(v=><ArticleRow key={v.id} article={v} heading="h3"/>)}</section><aside className="home-topics"><h2>专题阅读</h2>{topics.map(t=><Link to={`/topics/${t.key}`} key={t.key}><div><strong>{t.title}</strong><span>{t.label}</span></div><Arrow/></Link>)}<p>市场、基金费用与宏观资料保留原日期。研究复核日不代表交易日。</p></aside></div>
 </main>;
}
