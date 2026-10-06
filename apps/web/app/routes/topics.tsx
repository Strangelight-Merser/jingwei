import { Link,useLoaderData } from 'react-router';
import { publication } from '../lib/api.server.ts';
import type { TOPICS } from '../../../../industry/topics.ts';
import { Arrow } from '../components/Arrow.tsx';
export async function loader(){return publication<typeof TOPICS>('topics');}
export function meta(){return [{title:'专题 · 经纬'}];}
export default function Topics(){const topics=useLoaderData<typeof loader>();return <main id="main" className="listing"><h1>专题</h1><p className="listing-deck">按专题阅读解读文章与背景知识。</p>{topics.map(t=><Link key={t.key} className="topic-list-item" to={`/topics/${t.key}`}><div><small>{t.label}</small><h2>{t.title}</h2><p>{t.background}</p></div><Arrow/></Link>)}</main>;}
