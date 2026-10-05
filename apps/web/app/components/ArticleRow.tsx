import { Headline,ReadingText } from './Typography.tsx';
import { Link } from 'react-router';
import type { FinanceVersion } from '../../../../packages/contracts/types.ts';
import { date } from '../lib/format.ts';
import { Arrow } from './Arrow.tsx';
export function ArticleRow({article:v,heading='h2'}:{article:FinanceVersion;index?:number;heading?:'h2'|'h3'}){const Heading=heading;return <article className="article-row"><div><Heading><Link to={`/articles/${v.article.slug}`}><Headline text={v.article.title}/></Link></Heading><p><ReadingText text={v.article.deck}/></p><div className="row-meta"><time dateTime={v.as_of}>{date(v.as_of)}</time><span>{v.article.category}</span><span>{v.article.read_minutes}分钟阅读</span></div></div><Link className="row-arrow" aria-label={`阅读：${v.article.title}`} to={`/articles/${v.article.slug}`}><Arrow/></Link></article>;}
