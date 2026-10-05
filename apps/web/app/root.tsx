import { Links, Meta, Outlet, Scripts, ScrollRestoration, NavLink, Link, useRouteError, isRouteErrorResponse, useRouteLoaderData } from 'react-router';
import { useEffect, useState } from 'react';
import './app.css';
import './front.css';
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
 return <html lang="zh-CN"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#ffffff"/><link rel="icon" type="image/svg+xml" href="/favicon.svg"/><Meta/><Links/></head><body onClickCapture={keepOpenReading}><a className="skip" href="#main">跳到正文</a><header className="masthead"><div className="brand-row"><Link className="brand" to="/" aria-label="经纬首页">经纬</Link><nav aria-label="主导航"><NavLink to="/" end>阅读</NavLink><NavLink to="/situation">我的情况</NavLink><NavLink to="/compare">比较</NavLink><NavLink to="/changes">判断变化</NavLink></nav></div>{editor&&<p className="maintenance-banner">维护模式已开启 · <Link to="/maintenance">内容维护</Link> · <Link to="/settings/model">模型连接</Link></p>}{offline&&<p className="update-note" role="status">{desktop?'当前离线，已保存的文章、基金比较、判断历史与收藏仍可阅读。联网后可更新资料。':'当前离线，可以继续阅读已打开的文章。恢复连接后再打开其他页面，收藏仍保存在这个浏览器里。'}</p>}</header>{children}<footer><Link className="footer-brand" to="/">经纬</Link><p>依据公开资料整理。资料日期与来源随文列出。</p><nav className="reader-footer-links" aria-label="更多阅读"><Link to="/topics">沪深300专题</Link><Link to="/saved">我的收藏</Link><Link to="/articles?archive=1">历史资料</Link><Link to="/settings">偏好与连接</Link></nav></footer><ScrollRestoration/><Scripts/></body></html>;}
export default function Root(){return <Outlet/>;}
export function ErrorBoundary(){const error=useRouteError();const missing=isRouteErrorResponse(error)&&error.status===404;return <main id="main" className="error-page"><h1>{missing?'这篇内容暂未收录':'内容暂时无法载入'}</h1><p>{missing?'从首页或专题继续阅读。':'连接可能暂时中断。恢复连接后，可以重新载入这页。'}</p>{!missing&&<p><a className="text-link" href="">重新载入</a></p>}<Link className="text-link" to="/">回到首页</Link></main>;}
