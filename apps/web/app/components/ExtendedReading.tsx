import {Link} from 'react-router';
import type {FinanceVersion} from '../../../../packages/contracts/types.ts';
import {date} from '../lib/format.ts';
import {Arrow} from './Arrow.tsx';

const TOOLS = [
  {to: '/compare', title: '比较两只 C 类费用', description: '按金额与持有期限，比较持有成本'},
  {to: '/changes#rule', title: '十年里的判断变化', description: '回看每次改判与当时的估值'},
  {to: '/advisor', title: '给客户的一页说明', description: '选择客户情况，生成可打印的说明'},
];

export function ExtendedReading({articles}: {articles: FinanceVersion[]}) {
  return <section className="home-extended-reading" aria-labelledby="extended-reading-title">
    <div className="home-extended-heading">
      <h2 id="extended-reading-title">延伸阅读</h2>
      {articles.length > 0 && <Link to="/articles">全部文章 <Arrow/></Link>}
    </div>
    <nav className="home-reading-tools" aria-label="研究工具">
      {TOOLS.map(tool => <Link key={tool.to} to={tool.to}>
        <div><strong>{tool.title}</strong><p>{tool.description}</p></div><Arrow/>
      </Link>)}
    </nav>
    {articles.length > 0 && <div className="home-reading-articles">
      {articles.map(v => <article key={v.article.slug}>
        <span>{v.article.kind === 'background' ? '基础概念' : '往期解读'}</span>
        <h3><Link to={`/articles/${v.article.slug}`}>{v.article.title}</Link></h3>
        <time dateTime={v.as_of}>资料截至 {date(v.as_of)}</time>
        <Link className="home-reading-open" aria-label={`阅读：${v.article.title}`} to={`/articles/${v.article.slug}`}><Arrow/></Link>
      </article>)}
    </div>}
  </section>;
}
