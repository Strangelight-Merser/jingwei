import {Link as ErrorLink,useRouteError as usePageError,isRouteErrorResponse as isPageError} from 'react-router';
import {useState} from 'react';
import {Link, useLoaderData} from 'react-router';
import {publication} from '../lib/api.server.ts';
import type {JudgmentOverview} from '../components/RuleJudgment.tsx';
import {VALUATION_INDEXES} from '../../../../packages/backend/valuation-indexes.ts';
import '../bank.css';

export async function loader() {
  const overview = await publication<JudgmentOverview>('judgments');
  return {indexes: overview.indexes.map(j => ({code: j.index_code, name: j.index_name, market: VALUATION_INDEXES[j.index_code].market, band: j.band}))};
}
export function meta() { return [{title: '机构服务 · 经纬'}]; }

/**
 * What a bank gets: the same rule judgment as a card it can place in its own pages (iframe or JSON),
 * and a one-page explanation for client managers. The card itself has no app chrome, so it is
 * previewed here rather than opened on its own.
 */
export default function Bank() {
  const {indexes} = useLoaderData<typeof loader>();
  const [code, setCode] = useState('000300');
  const [copied, setCopied] = useState(false);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const snippet = `<iframe src="${origin}/embed/rule-card?index=${code}" width="420" height="560" style="border:0" title="经纬规则卡"></iframe>`;
  async function copy() {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }
  return <main id="main" className="bank-page">
    <header className="bank-head">
      <p className="eyebrow">机构服务</p>
      <h1>把同一条规则，放进银行自己的页面</h1>
      <p>规则卡只显示公开规则的结果：当前区间、新增资金与已有持仓怎么做、什么时候改判。不读取客户信息，银行页面直接嵌入或按 JSON 自行渲染。</p>
    </header>

    <div className="bank-layout">
      <section className="bank-preview" aria-labelledby="bank-preview-title">
        <div className="bank-preview-head">
          <h2 id="bank-preview-title">预览</h2>
          <label>指数<select value={code} onChange={event => setCode(event.target.value)}>
            {indexes.map(index => <option key={index.code} value={index.code}>{index.name}</option>)}
          </select></label>
        </div>
        <div className="bank-frame"><iframe key={code} src={`/embed/rule-card?index=${code}`} title="经纬规则卡预览" loading="lazy"/></div>
      </section>

      <section className="bank-steps" aria-labelledby="bank-steps-title">
        <h2 id="bank-steps-title">怎么接入</h2>
        <ol>
          <li><strong>嵌入网页</strong><p>把下面这段放进手机银行或基金详情页，卡片随数据自动更新。</p>
            <pre className="bank-code"><code>{snippet}</code></pre>
            <button type="button" className="bank-copy" onClick={copy}>{copied ? '已复制' : '复制代码'}</button>
          </li>
          <li><strong>自行渲染</strong><p>同一份数据也有 JSON：<code>/embed/rule-card.json?index={code}</code>，字段与卡片一致，银行可按自己的设计展示。</p></li>
          <li><strong>客户经理</strong><p>面对面沟通时，用一页说明把规则对应到客户的情况，并导出 PDF。</p><Link className="text-link" to="/advisor">打开客户经理说明 →</Link></li>
        </ol>
        <p className="bank-note">规则卡只给公开规则的结果，不构成个别投资建议；上线前由银行合规审核口径。</p>
      </section>
    </div>
  </main>;
}

export function ErrorBoundary() {
 const error=usePageError();
 const missing=isPageError(error)&&error.status===404;
 const invalid=isPageError(error)&&error.status===400;
 return <main id="main" className="reader-page error-page"><h1>{missing?'机构服务暂未提供':invalid?'这个入口暂不可用':'机构服务暂时无法载入'}</h1><p className="reader-intro">{missing?'内容可能尚未收录，或当前入口未开放。请从下面的入口继续。':invalid?'请从页面提供的入口重新选择。':'未能取得这页需要的资料，连接可能中断，或资料服务暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{!missing&&!invalid&&<a href="">重新载入</a>}<ErrorLink to="/advisor">客户经理说明 →</ErrorLink><ErrorLink to="/">回到今日判断 →</ErrorLink></div></main>;
}
