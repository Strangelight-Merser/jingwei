import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link, useRouteError, isRouteErrorResponse, useRouteLoaderData, useLocation } from 'react-router';
import { SECTIONS, SETTINGS, backLink, sectionOf, tabOf } from './lib/sitemap.ts';
import { useEffect, useState } from 'react';
import './app.css';
import './front.css';
import './judgment.css';
import './shell.css';
export async function loader(){
 let followed:string[]|null=null;
 try{const response=await fetch(`${process.env.JINGWEI_API_URL??'http://127.0.0.1:4411'}/reading/followed`,{signal:AbortSignal.timeout(3000)});if(response.ok){const data=await response.json() as {topic_keys:string[]};if(Array.isArray(data.topic_keys))followed=data.topic_keys;}}catch{}
 return {desktop:process.env.JINGWEI_DESKTOP==='1',editor:process.env.JINGWEI_EDITOR_MODE==='1',followed};
}
export function Layout({children}:{children:React.ReactNode}) {
 const root=useRouteLoaderData<typeof loader>('root'),desktop=root?.desktop??false,editor=root?.editor??false;
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const refresh=()=>setOffline(!navigator.onLine);
  refresh();window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
  return ()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);};
 },[]);
 function keepOpenReading(event:React.MouseEvent<HTMLBodyElement>){
  if(desktop||navigator.onLine||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=(event.target as Element).closest('a[href]');
  if(!anchor)return;
  const target=new URL(anchor.getAttribute('href')!,location.href);
  if(target.origin===location.origin&&(target.pathname!==location.pathname||target.search!==location.search)){
   event.preventDefault();event.stopPropagation();setOffline(true);
  }
 }
 return <html lang="zh-CN"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#ffffff"/><link rel="icon" type="image/svg+xml" href="/favicon.svg"/><Meta/><Links/></head><body onClickCapture={keepOpenReading}><a className="skip" href="#main">跳到正文</a><header className="masthead"><div className="brand-row"><Link className="brand" to="/" aria-label="经纬首页"><svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8"/><path className="brand-grid" d="M11 6v20M21 6v20M6 12h20M6 20h20"/><path className="brand-curve" d="M6 21c3-5 5-6 7-3s4 4 6 1 4-6 7-7"/><circle cx="26" cy="12" r="2.4"/></svg><span>经纬</span></Link><MainNav/></div><SectionBar/>{editor&&<p className="maintenance-banner">维护模式已开启 · <Link to="/maintenance">内容维护</Link> · <Link to="/settings/model">模型连接</Link></p>}{offline&&<p className="update-note" role="status">{desktop?'当前离线，已保存的文章、基金比较、判断历史与收藏仍可阅读。联网后可更新资料。':'当前离线，可以继续阅读已打开的文章。恢复连接后再打开其他页面，收藏仍保存在这个浏览器里。'}</p>}</header>{children}<footer><Link className="footer-brand" to="/">经纬</Link><p>依据公开资料整理。资料日期与来源随文列出。</p><nav className="reader-footer-links" aria-label="更多阅读"><Link to="/topics">沪深300专题</Link><Link to="/saved">我的收藏</Link><Link to="/articles?archive=1">历史资料</Link><Link to="/settings">设置</Link></nav></footer><ScrollRestoration/><Scripts/></body></html>;}
export default function Root(){return <Outlet/>;}
export function ErrorBoundary(){const error=useRouteError();const missing=isRouteErrorResponse(error)&&error.status===404;return <main id="main" className="error-page"><h1>{missing?'这篇内容暂未收录':'内容暂时无法载入'}</h1><p>{missing?'从首页或专题继续阅读。':'连接可能暂时中断。恢复连接后，可以重新载入这页。'}</p>{!missing&&<p><a className="text-link" href="">重新载入</a></p>}<Link className="text-link" to="/">回到首页</Link></main>;}

/** Four sections by what the reader is doing; settings behind the gear. */
function MainNav() {
  const {pathname} = useLocation();
  const current = sectionOf(pathname);
  const inSettings = SETTINGS.paths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  return <nav aria-label="主导航">
    {SECTIONS.map(section => <Link key={section.key} to={section.to} className={current?.key === section.key ? 'active' : undefined} aria-current={current?.key === section.key ? 'page' : undefined}>{section.label}</Link>)}
    <Link to={SETTINGS.to} className={`nav-settings${inSettings ? ' active' : ''}`} aria-label="设置" title="设置" aria-current={inSettings ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/></svg>
    </Link>
  </nav>;
}

/** Under the header: the section's own tabs, or a way back from a detail page. */
function SectionBar() {
  const {pathname, search} = useLocation();
  const back = backLink(pathname, search);
  const section = sectionOf(pathname);
  const tab = section && tabOf(section, pathname);
  if (back) return <div className="section-bar"><Link className="section-back" to={back.to}><span aria-hidden="true">‹</span> {back.label}</Link></div>;
  if (!section?.tabs) return null;
  return <nav className="section-bar section-tabs" aria-label={section.label}>
    {section.tabs.map(item => <Link key={item.to} to={item.to} className={tab?.to === item.to ? 'active' : undefined} aria-current={tab?.to === item.to ? 'page' : undefined}>{item.label}</Link>)}
  </nav>;
}
