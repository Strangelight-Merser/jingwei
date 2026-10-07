import {Link as ErrorLink,useRouteError as usePageError,isRouteErrorResponse as isPageError} from 'react-router';
import { Link,useLoaderData } from 'react-router';
import { publication } from '../lib/api.server.ts';
import type { TOPICS } from '../../../../industry/topics.ts';
import { Arrow } from '../components/Arrow.tsx';
export async function loader(){return publication<typeof TOPICS>('topics');}
export function meta(){return [{title:'专题 · 经纬'}];}
export default function Topics(){const topics=useLoaderData<typeof loader>();return <main id="main" className="listing"><h1>专题</h1><p className="listing-deck">按专题阅读解读文章与背景知识。</p>{topics.map(t=><Link key={t.key} className="topic-list-item" to={`/topics/${t.key}`}><div><small>{t.label}</small><h2>{t.title}</h2><p>{t.background}</p></div><Arrow/></Link>)}</main>;}

export function ErrorBoundary() {
 const error=usePageError();
 const missing=isPageError(error)&&error.status===404;
 const invalid=isPageError(error)&&error.status===400;
 return <main id="main" className="reader-page error-page"><h1>{missing?'专题列表暂未提供':invalid?'这个入口暂不可用':'专题列表暂时无法载入'}</h1><p className="reader-intro">{missing?'内容可能尚未收录，或当前入口未开放。请从下面的入口继续。':invalid?'请从页面提供的入口重新选择。':'未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{!missing&&!invalid&&<a href="">重新载入</a>}<ErrorLink to="/articles">阅读文章 →</ErrorLink><ErrorLink to="/">回到今日判断 →</ErrorLink></div></main>;
}
