import type {ResearchEvaluation} from '../../../../packages/contracts/research.ts';
import type {SourceRef} from '../../../../packages/contracts/types.ts';
import {ResearchBrief,HistoricalResearchNote,ResearchUpdateNote,FollowButton,CheckResearchButton,FreeResearchFacts} from '../components/ResearchBrief.tsx';
import type {ResearchUpdate} from '../components/ResearchBrief.tsx';
import { Link,useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { publication } from '../lib/api.server.ts';
import type { topicPublication } from '../../../../packages/backend/publication.ts';
import { ArticleRow } from '../components/ArticleRow.tsx';
import { Arrow } from '../components/Arrow.tsx';
import { date } from '../lib/format.ts';
import { FundReviewNotice } from '../components/FundReviewNotice.tsx';
import { ReadingText } from '../components/Typography.tsx';
import { MarketCheckNote } from '../components/MarketCheckNote.tsx';
import '../topic-polish.css';
export async function loader({params}:LoaderFunctionArgs){return publication<NonNullable<Awaited<ReturnType<typeof topicPublication>>>&{research_update?:ResearchUpdate;research_facts?:ResearchEvaluation|null;research_data_as_of?:string|null;research_source_refs?:SourceRef[]}>(`topics/${params.key}`);}
export function meta({loaderData:data}:{loaderData?:Awaited<ReturnType<typeof loader>>}){return [{title:`${data?.topic.title??'专题'} · 经纬`}];}
export default function Topic(){
 const {topic,current,latest,background,earlier,as_of,market_availability,market_check,fund_review_notice,research_update,research_facts,research_data_as_of,research_source_refs}=useLoaderData<typeof loader>();
 const view=latest?.article.operation_view;
 return <main id="main" className="topic-page">
  <div className="breadcrumbs"><Link to="/topics">专题</Link><span>/</span><span>{topic.label}</span></div>
  <header className="topic-header"><h1>{topic.title}</h1><p>{topic.background}</p>{!latest?.research&&<div className="research-controls"><FollowButton topicKey={topic.key}/>{view&&<CheckResearchButton/>}</div>}
   <div className="topic-dates">{view?<>
    {view.market&&<>市场资料截至 <time dateTime={view.market.as_of}>{date(view.market.as_of)}</time> · </>}
    {latest?.research?'研究复核于':'历史人工复核于'} <time dateTime={latest?.research?.evaluated_at??view.reviewed_on}>{date(latest?.research?.evaluated_at??view.reviewed_on)}</time>
   </>:<>{as_of?<>最新收录资料日期 <time dateTime={as_of}>{date(as_of)}</time></>:<>尚无已刊资料</>}</>}</div>
  </header>
  {!latest?.research&&view&&<FreeResearchFacts facts={research_facts} asOf={research_data_as_of} refs={research_source_refs}/>}<FundReviewNotice notice={fund_review_notice??null}/>
  {latest?.research?<ResearchBrief version={latest} update={research_update}/>:<details className="current-progress topic-history-details"><summary>{view?'历史解读与后续关注':'最近收录进展'}</summary>{latest&&<HistoricalResearchNote version={latest}/>}<ResearchUpdateNote update={research_update}/><h2>{view?'当时的解读':'最近收录进展'}</h2><p><ReadingText text={current}/></p>
   <MarketCheckNote check={market_check}/>
   {!market_check&&market_availability&&<p role="status">{market_availability.message}</p>}
   {view&&<>
    <h3>这项判断怎样适用</h3>
    <p><strong>已有持仓：</strong><ReadingText text={view.held.text}/></p>
    <p><strong>新增资金 · 首次买入或追加：</strong><ReadingText text={view.unheld.text}/></p>
    <p>既定长期计划内的投入，原条件仍成立时按原计划执行，不由本篇一概暂停。</p>
    {view.next_watch&&<p><ReadingText text={view.next_watch}/></p>}
    <details><summary>反方解释与改判条件</summary><p><ReadingText text={view.counterargument}/></p>
     <ul>{view.change_conditions.map(condition=><li key={condition}><ReadingText text={condition}/></li>)}</ul>
    </details>
    <Link className="text-link" to={`/articles/${latest!.article.slug}`}>核对判断依据与基金条款 <Arrow/></Link>
   </>}
  </details>}
  <div className="topic-content"><section><div className="section-top"><h2>最新文章</h2></div>{latest&&<ArticleRow article={latest} heading="h3"/>}{earlier.length>0&&<><div className="section-top earlier-title"><h2>早期文章</h2></div>{earlier.map(v=><ArticleRow key={v.id} article={v} heading="h3"/>)}</>}</section>{background.length>0&&<aside className="topic-background"><h2>背景解释</h2>{background.map(v=><Link key={v.id} to={`/articles/${v.article.slug}`}><strong>{v.article.title}</strong><p>{v.article.deck}</p><span>{v.article.read_minutes}分钟阅读 <Arrow/></span></Link>)}</aside>}</div>
  <Link className="text-link" to="/topics"><Arrow back/> 沪深300专题</Link>
 </main>;
}
