import {PageError} from '../components/PageError.tsx';
import{Link,useLoaderData,useRouteLoaderData}from'react-router';
import{owner}from'./maintenance.tsx';
import type{createResearchService}from'../../../../packages/backend/research-service.ts';
import{CheckResearchButton,ResearchUpdateNote}from'../components/ResearchBrief.tsx';
import type{ResearchUpdate}from'../components/ResearchBrief.tsx';
import{publication}from'../lib/api.server.ts';
import{useReaderSituation}from'../lib/reader-situation.ts';
import{PLAN_OPTIONS,HOLDING_OPTIONS,PERIOD_OPTIONS}from'../../../../packages/contracts/reader-situation.ts';
type Preview=Awaited<ReturnType<ReturnType<typeof createResearchService>['preview']>>;
export async function loader(){const[connection,research]=await Promise.all([owner<Preview>('research/preview'),publication<{research_update:ResearchUpdate}>('home')]);return{connection,update:research.research_update};}
export function meta(){return[{title:'偏好与连接 · 经纬'}];}
export default function Settings(){const editor=useRouteLoaderData<{editor?:boolean}>('root')?.editor??false;const{connection,update}=useLoaderData<typeof loader>(),{situation:s}=useReaderSituation();return <main id="main" className="reader-page"><p className="eyebrow">设置</p><h1>偏好与连接</h1><section className="reader-setting"><h2>我的情况</h2><p>{s?[PLAN_OPTIONS.find(([k])=>k===s.long_plan)?.[1],HOLDING_OPTIONS.find(([k])=>k===s.holding)?.[1],PERIOD_OPTIONS.find(([k])=>k===s.holding_period)?.[1]].join(' · '):'尚未选择，当前阅读公共研究。'}</p><Link className="text-link" to="/situation">修改或重置我的情况 →</Link></section><section className="reader-setting"><h2>公开资料</h2><p>估值判断覆盖首页所列的 11 个指数；基金研究与费用比较目前只做沪深300方向的 007339、005658。应用打开时免费核查，退出后停止，下次打开补查；取不到的来源保留原日期。</p><ResearchUpdateNote update={update}/><CheckResearchButton/></section><section className="reader-setting"><h2>研究连接</h2><p>{connection.session.has_key?'本机已保存模型连接。':'尚未设置可选模型连接，已有内容和免费核查可正常使用。'} {connection.session.authorized?'模型费用授权已开启（长期有效）。':'付费研究当前关闭。'}</p><p>沪深300基金研究文章是此前人工撰写的版本，按原日期保留；核查到新资料后，文章不会自动改写。</p>{editor&&<p className="reader-setting-links"><Link className="text-link" to="/settings/model">模型连接 →</Link><Link className="text-link" to="/maintenance">内容维护 →</Link></p>}</section><section className="reader-setting"><h2>保存的内容</h2><p>我的情况、关注和收藏保存在当前设备，可随时调整。</p><Link className="text-link" to="/saved">我的收藏 →</Link></section></main>;}

export function ErrorBoundary() {
  return <PageError name="设置" links={[{to: '/situation', label: '查看我的情况 →'}, {to: '/', label: '回到今日判断 →'}]}/>;
}

