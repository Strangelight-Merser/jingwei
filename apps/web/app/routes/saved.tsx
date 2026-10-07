import {PageError} from '../components/PageError.tsx';
import { Link, useLoaderData, useRouteLoaderData } from 'react-router';
import { useRef, useState } from 'react';
import { publication } from '../lib/api.server.ts';
import type { FinanceVersion } from '../../../../packages/contracts/types.ts';
import { ArticleRow } from '../components/ArticleRow.tsx';
import { SaveButton, useSavedArticles } from '../components/SaveButton.tsx';
export async function loader(){return publication<FinanceVersion[]>('articles');}
export function meta(){return [{title:'我的收藏 · 经纬'}];}
export default function Saved() {
  const desktop=useRouteLoaderData<{desktop:boolean}>('root')?.desktop??false;
  const all = useLoaderData<typeof loader>();
  const { slugs, unavailable } = useSavedArticles();
  const heading = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState('');
  const bySlug = new Map(all.map(version => [version.article.slug, version]));
  const saved = (slugs ?? []).slice().reverse().flatMap(slug => {
    const article = bySlug.get(slug);
    return article ? [article] : [];
  });
  return <main id="main" className="listing">
    <h1 ref={heading} tabIndex={-1}>我的收藏</h1>
    <p className="listing-deck">{desktop?'收藏保存在本机，退出重开仍可找到。最近收藏的排在前面；打开文章时阅读最新版本，文末可查此前版本。':'收藏保存在这个浏览器里，最近收藏的排在前面。打开文章时阅读最新版本，文末可查此前版本。'}</p>
    {notice && <p className="empty-small" role="status">{notice}</p>}
    {slugs === null && !unavailable && <p className="empty-small" role="status">正在读取收藏…</p>}
    {unavailable && <div className="saved-empty" role="status"><h2>暂时无法读取收藏</h2><p>{desktop?'本机收藏暂时无法读取。可以继续浏览文章，稍后再回来查看。':'浏览器存储当前不可用。可以继续浏览文章，稍后再回来查看。'}</p><Link className="text-link" to="/articles">浏览文章</Link></div>}
    {saved.map(version => <div className="saved-item" key={version.id}>
      <ArticleRow article={version} />
      <SaveButton slug={version.article.slug} title={version.article.title} onSavedChange={isSaved => {
        if (!isSaved) {
          setNotice(`已取消收藏：${version.article.title}`);
          heading.current?.focus({ preventScroll: true });
        }
      }} />
    </div>)}
    {slugs !== null && !saved.length && <div className="saved-empty"><h2>暂无可阅读的收藏</h2><p>{slugs.length ? (desktop?'收藏的文章暂时未收录。收藏记录仍保留在本机。':'收藏的文章暂时未收录。收藏记录仍保留在这个浏览器里。') : '在文章页点“收藏文章”，以后可以从这里找到。'}</p><Link className="text-link" to="/articles">浏览文章</Link></div>}
  </main>;
}

export function ErrorBoundary() {
  return <PageError name="收藏" links={[{to: '/articles', label: '阅读文章 →'}, {to: '/', label: '回到今日判断 →'}]}/>;
}

