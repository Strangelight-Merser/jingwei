import {Link as ErrorLink,useRouteError as usePageError,isRouteErrorResponse as isPageError} from 'react-router';
import {Form,Link,useActionData,useLoaderData,useNavigation} from 'react-router';
import type {ActionFunctionArgs} from 'react-router';
import {owner} from './maintenance.tsx';
import type {createResearchService} from '../../../../packages/backend/research-service.ts';
type Preview=Awaited<ReturnType<ReturnType<typeof createResearchService>['preview']>>;
export async function loader(){if(process.env.JINGWEI_EDITOR_MODE!=='1')throw new Response('维护入口未启用',{status:404});return owner<Preview>('research/preview');}
export function meta(){return [{title:'模型与基金研究设置 · 经纬'},{name:'robots',content:'noindex'}];}
export async function action({request}:ActionFunctionArgs){
 if(process.env.JINGWEI_EDITOR_MODE!=='1')throw new Response('维护入口未启用',{status:404});
 if(request.headers.get('origin')!==new URL(request.url).origin)return {ok:false,message:'请从当前本机窗口保存。'};
 const form=await request.formData();
 if(form.get('intent')==='authorize'){const current=await owner<Preview>('research/preview');if(!current.session.has_key||!current.budget)return {ok:false,message:'已有本机保存尚未恢复，费用授权保持关闭。'};try{await owner('session',{authorize:true,limit_cny:current.budget.limit_cny});return {ok:true,message:'费用已授权，重启后保持有效，直到你撤销或达到累计上限。本次尚未开始生成。'};}catch{return {ok:false,message:'费用授权尚未生效，累计记录保留。'};}}
 try{await owner('session',{key:String(form.get('key')??'')||undefined,limit_cny:form.get('budget')?Number(form.get('budget')):undefined,authorize:form.get('authorize')==='on',save_to_keychain:form.get('save_to_keychain')==='on'});return {ok:true,message:'本机配置已保存。本次没有调用模型。保存配置不会改变自动研究开关。'};}
 catch{return {ok:false,message:'本机配置尚未保存。请检查密钥、费用上限与本机安全存储许可。'};}
}
export default function ModelSettings(){
 const data=useLoaderData<typeof loader>(),result=useActionData<typeof action>(),busy=useNavigation().state!=='idle';
 return <main id="main" className="owner-page"><div className="owner-heading"><div><p className="eyebrow">本机可选设置</p><h1>模型与基金研究设置</h1><p>阅读已有内容无需配置。密钥保存在系统安全存储，授权在累计上限内长期有效。</p></div><Link to="/" className="text-link">返回阅读 →</Link></div>
 {result&&<p role="status" className="owner-notice">{result.message}</p>}
 <section className="owner-section"><h2>DeepSeek 解读</h2><p className="owner-state">密钥：{data.session.has_key?'已设置':'未设置'} · 费用授权：{data.session.authorized?'已授权（长期有效，可随时撤销）':'未授权'}</p>{data.budget&&<p className="owner-help">累计上限 ¥{data.budget.limit_cny.toFixed(2)} · 已预留 ¥{data.budget.reserved_cny.toFixed(6)} · {data.budget.requests}次请求。预留额不是实际账单。</p>}{data.session.has_key&&!data.session.authorized&&data.budget&&<Form method="post"><button name="intent" value="authorize" disabled={busy}>启用授权</button><p className="owner-help">沿用已有累计上限，不需要再次输入密钥；授权会一直保留，重启后无需再点。</p></Form>}<details open={!data.session.has_key}><summary>{data.session.has_key?'更换密钥或保存设置':'设置本机密钥'}</summary><Form method="post" autoComplete="off"><label>本项目 DeepSeek API Key<input name="key" type="password" autoComplete="new-password" placeholder={data.session.has_key?'留空保留当前会话密钥':'在本机输入，无需发送给助手'}/></label><label className="owner-check"><input type="checkbox" name="save_to_keychain" defaultChecked/>保存到本机安全存储（重启后自动恢复）</label><label>累计费用上限（元）<input name="budget" type="number" min="0.01" max="1000" step="0.01" defaultValue={data.budget?.limit_cny??undefined} placeholder="按已确认的本轮额度填写"/></label><label className="owner-check"><input type="checkbox" name="authorize" defaultChecked/>允许在上述累计额度内调用模型（长期有效，取消勾选并保存即撤销）</label><button disabled={busy}>{busy?'保存中…':'保存配置'}</button></Form></details><p className="owner-help">保存配置只设置密钥与额度，不开始生成。密钥不返回到页面，也不发送给助手。</p></section>
 {data.ready&&<section className="owner-section"><h2>待研究的公开资料</h2><p>沪深300方向内的两只联接基金。市场与净值资料截至 {data.as_of}；各条原文继续保留自己的日期。</p><p>{data.summary.nav_series.map(s=>`${s.code}：${s.observations}条单位净值（${s.first_date}至${s.last_date}）`).join('；')}。</p><p>当前关键披露正文已读取 {data.summary.document_coverage.filter(d=>d.status==='read').length}/{data.summary.document_coverage.length} 份，涵盖中报与C类资料概要。{data.evaluation.checks.document_body_read.explanation}</p><p>{data.evaluation.checks.tracking_available.explanation} {data.evaluation.checks.fee_scope_verified.explanation} 单位净值未复权，分红可能影响变化与回撤。</p>{data.summary.other_directions.length>0&&<p>{data.summary.other_directions.map(d=>`${d.name}（${d.as_of}）`).join('、')}仅有行情与估值资料，尚不足以形成其他方向的基金选择判断。</p>}<p>一次请求按当前计价策略最多预留 ¥{data.reservation_cny.toFixed(6)}，含最多{data.max_output_tokens}个输出token。预留额是费用上限，不是实际账单；发起前还会核查官方费率。</p><a className="text-link" href={data.pricing.url} target="_blank" rel="noreferrer">官方费率 ↗</a></section>}
 </main>;
}

export function ErrorBoundary() {
 const error=usePageError();
 const missing=isPageError(error)&&error.status===404;
 const invalid=isPageError(error)&&error.status===400;
 return <main id="main" className="reader-page error-page"><h1>{missing?'模型连接暂未提供':invalid?'这个入口暂不可用':'模型连接暂时无法载入'}</h1><p className="reader-intro">{missing?'内容可能尚未收录，或当前入口未开放。请从下面的入口继续。':invalid?'请从页面提供的入口重新选择。':'未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{!missing&&!invalid&&<a href="">重新载入</a>}<ErrorLink to="/settings">返回设置 →</ErrorLink><ErrorLink to="/">回到今日判断 →</ErrorLink></div></main>;
}
