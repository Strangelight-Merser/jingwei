import {Link, isRouteErrorResponse, useRouteError} from 'react-router';

/**
 * What a page shows when it cannot load: what happened, what the reader can do, and where to go.
 * `missing` is the 404 headline (some pages say "这篇文章" rather than "<name>"), `special` covers a
 * page's own known case such as an index without data.
 */
export function PageError({name, missing, links, special}: {
  name: string;
  missing?: string;
  links: {to: string; label: string}[];
  special?: {when: (error: unknown) => boolean; title: string; text: string};
}) {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 0;
  const own = special?.when(error) ? special : null;
  const kind = own ? 'special' : status === 404 ? 'missing' : status === 400 ? 'invalid' : 'failed';
  const title = own ? own.title : {missing: missing ?? `${name}暂未提供`, invalid: '这个入口暂不可用', failed: `${name}暂时无法载入`}[kind as 'missing' | 'invalid' | 'failed'];
  const text = own ? own.text : {
    missing: '内容可能尚未收录，或当前入口未开放。请从下面的入口继续。',
    invalid: '请从页面提供的入口重新选择。',
    failed: '未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。',
  }[kind as 'missing' | 'invalid' | 'failed'];
  return <main id="main" className="reader-page error-page">
    <h1>{title}</h1>
    <p className="reader-intro">{text}</p>
    <div className="reader-actions">
      {kind === 'failed' && <a href="">重新载入</a>}
      {links.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}
    </div>
  </main>;
}
