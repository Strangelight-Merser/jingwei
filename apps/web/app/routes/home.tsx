import {Link as ErrorLink,useRouteError as usePageError,isRouteErrorResponse as isPageError} from 'react-router';
import type {ResearchEvaluation} from '../../../../packages/contracts/research.ts';
import type {SourceRef} from '../../../../packages/contracts/types.ts';
import {Link,useLoaderData,useSearchParams} from 'react-router';
import {publication} from '../lib/api.server.ts';
import type {homePublication} from '../../../../packages/backend/publication.ts';
import type {ResearchUpdate} from '../components/ResearchBrief.tsx';
import {Arrow} from '../components/Arrow.tsx';
import {SituationCard} from '../components/SituationCard.tsx';
import {SinceLastVisit} from '../components/SinceLastVisit.tsx';
import {type JudgmentOverview} from '../components/RuleJudgment.tsx';
import {HomeHero} from '../components/HomeHero.tsx';
import {ReadingGuide} from '../components/ReadingGuide.tsx';
import {ExtendedReading} from '../components/ExtendedReading.tsx';
import {AskJingwei} from '../components/AskJingwei.tsx';
import {FirstRun} from '../components/FirstRun.tsx';
import {IndexOverview} from '../components/IndexOverview.tsx';
export async function loader({request}:{request:Request}){
 const [home,overview]=await Promise.all([publication<Awaited<ReturnType<typeof homePublication>>&{research_update?:ResearchUpdate;research_facts?:ResearchEvaluation|null;research_data_as_of?:string|null;research_source_refs?:SourceRef[];research_evidence_hash?:string|null}>('home'),publication<JudgmentOverview>('judgments')]);
 const code=new URL(request.url).searchParams.get('index')??'000300';
 if(!overview.indexes.some(j=>j.index_code===code))throw new Response('该指数的估值暂不可用',{status:503});
 return {...home,judgment:overview.indexes.find(j=>j.index_code==='000300')??null,indexes:overview.indexes};
}
export function meta(){return [{title:'经纬 · 今日判断'},{name:'description',content:'依据公开资料研究市场方向和基金工具，保留原日期与复核条件。'}];}
export default function Home(){
 const {judgment,indexes,lead,selections,background}=useLoaderData<typeof loader>();
 const [search]=useSearchParams();
 const selected=indexes.find(item=>item.index_code===search.get('index'))??judgment;
 if(!lead)return <main id="main" className="error-page"><h1>内容还在准备中</h1><p>目前还没有已刊文章，可以先浏览专题。</p><Link className="text-link" to="/topics">浏览专题 <Arrow/></Link></main>;
 const all=[lead,...selections];const research=all.find(v=>v.research);const historical=all.find(v=>v.article.operation_view);
 const focus=research??historical??lead;
 const reading=[...new Map([focus,...all,...background].map(v=>[v.article.slug,v])).values()];
 return <main id="main" className="home-page">
  {indexes.length>0&&<FirstRun indexes={indexes}/>}
  {selected&&<HomeHero key={selected.index_code} j={selected} indexes={indexes} guide={<ReadingGuide judgment={selected}/>}/>}
  {selected&&indexes.length>1&&<IndexOverview indexes={indexes} selected={selected.index_code}/>}
  {judgment&&<SinceLastVisit judgment={judgment}/>}
  <div className="home-companions">
   {judgment&&<AskJingwei/>}
   <SituationCard version={focus} judgment={judgment}/>
  </div>
  <ExtendedReading articles={reading}/>
 </main>;
}

export function ErrorBoundary() {
 const error=usePageError();
 const unavailable=isPageError(error)&&error.data==='该指数的估值暂不可用';
 const missing=isPageError(error)&&error.status===404;
 const invalid=isPageError(error)&&error.status===400;
 return <main id="main" className="reader-page error-page"><h1>{unavailable?'这个指数的资料暂时缺失':missing?'今日判断暂未提供':invalid?'这个入口暂不可用':'今日判断暂时无法载入'}</h1><p className="reader-intro">{unavailable?'当前没有这个指数可用的估值判断。可以回到今日判断选择其他指数，或稍后重新载入。':missing?'内容可能尚未收录，或当前入口未开放。请从下面的入口继续。':invalid?'请从页面提供的入口重新选择。':'未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{!missing&&!invalid&&<a href="">重新载入</a>}<ErrorLink to="/articles">阅读文章 →</ErrorLink><ErrorLink to="/">回到今日判断 →</ErrorLink></div></main>;
}
