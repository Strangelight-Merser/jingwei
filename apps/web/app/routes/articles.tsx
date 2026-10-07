import {PageError} from '../components/PageError.tsx';
import { useLoaderData,useSearchParams,Form,Link } from 'react-router';
import { publication } from '../lib/api.server.ts';
import type { FinanceVersion } from '../../../../packages/contracts/types.ts';
import { ArticleRow } from '../components/ArticleRow.tsx';
import '../articles.css';
export async function loader(){return publication<FinanceVersion[]>('articles');}
export function meta(){return [{title:'全部文章 · 经纬'}];}
function normalized(text: string) { return text.normalize('NFKC').trim().toLocaleLowerCase('zh-CN'); }
function operationText(version: FinanceVersion): string[] {
  const view = version.article.operation_view;
  if (!view) return [];
  const actionLabel = (action: typeof view.held.action) => action === '持' ? '按原计划维护' : action === '观察' ? '先观察' : action;
  const text = [
    '原有持仓 临时新增 首次买入或追加 既定长期计划内的投入 原条件仍成立时按原计划执行 为什么这样判断 看哪些变化会改变判断 比较两只同方向基金 最强反方与改判条件 什么变化会改变判断',
    actionLabel(view.held.action), view.held.text, actionLabel(view.unheld.action), view.unheld.text,
    view.next_watch ?? '', view.reason, view.counterargument, ...view.change_conditions,
    '还没有配置计划 现在可以先比较两只同方向C类的服务费与赎回条款 原文费用不等于实付成本 重看本期判断 同样本盈利 需求 对应日期估值 新证据 看服务费与赎回差异 看哪些材料会改变判断',
    '两只候选基金 同一指数方向 比较工具差异 两只都承接沪深300方向，同时持有不增加方向分散。下面比较费用、跟踪与申赎条件；选择工具不改变上面的市场判断。',
    '本期定位 管理费 托管费 年 概要销售服务年费率 概要综合运作年费率测算 C类申购费 C类赎回费 交易状态',
    `${view.performance_period}净值增长率 同期各自基准收益率 收益率减各自基准 报告期年化跟踪误差 业绩比较基准 费率资料送出日期`,
    view.comparison_note, '仍待补齐', ...view.gaps,
    ...view.funds.flatMap(fund => [fund.name, fund.code, 'C类', fund.role, fund.management, fund.custody, fund.service, fund.total,
      fund.subscription, fund.redemption, fund.trade_status, fund.period_return, fund.benchmark_return,
      fund.difference, fund.tracking_error, fund.benchmark, fund.document_date]),
  ];
  if (view.research_conditions) text.push('下一次资料来了，检查哪些条件', ...view.research_conditions.flatMap(condition => [condition.label, condition.baseline, condition.watch, condition.trigger,
    condition.automatic ? '按官方资料复核；实质变化再更新' : '下一期材料需编辑核对']));
  if (view.funds.some(fund => fund.a_class)) {
    text.push('准备长期持有？再看A类 同基金A类份额 A类普通申购费 渠道优惠未核 A类赎回费 实际渠道优惠未核，表内普通费率不能代替实付费用。');
    for (const fund of view.funds) if (fund.a_class) text.push(fund.a_class.code, 'A类 销售服务费', fund.a_class.service, fund.a_class.subscription, fund.a_class.redemption, fund.a_class.document_date);
  }
  if (view.fee_regulation) {
    text.push('销售服务费持有条件 费用渠道范围 具体费用生效日 本基金实施公告 扣除目标ETF投资部分后计提');
    for (const fund of view.funds) {
      text.push(fund.fee_holding_terms ?? '未核实', fund.fee_channel_scope ?? '未核实', fund.fee_effective_from ?? '未核实', fund.fee_announcement ?? '未核实');
      if (!fund.fee_context?.effective_from) text.push('未确定适用期间，暂不能计算实际期间成本。');
    }
  }
  if (view.funds.some(fund => /未披露|未核/.test(fund.tracking_error))) text.push('无法据此比较跟踪稳定性，收益差额不能代替跟踪误差。');
  if (view.market?.daily.length) {
    const market = view.market;
    const first = market.daily[0], last = market.daily.at(-1)!;
    const multiplesLower = market.pe_ttm < market.previous_year_end.pe_ttm && market.pb < market.previous_year_end.pb;
    text.push('沪深300 中证官方资料 滚动PE PB 去年底 价格指数收盘，不含股息。', market.as_of,
      multiplesLower && last.close < first.close ? '回落的价格，下降的估值倍数' : '价格走势，与去年底估值对照',
      multiplesLower ? '倍数低于去年底，尚不能称历史低估' : '两个时点的倍数对照，不能替代历史分位',
      `最近${market.daily.length}个交易日`, first.date.slice(5), last.date.slice(5),
      market.pe_ttm.toFixed(2), market.pb.toFixed(2), market.previous_year_end.pe_ttm.toFixed(2), market.previous_year_end.pb.toFixed(2));
  } else if (!view.market) text.push('同一方向的费用资料快照 原概要年费率 费改生效与持有条件另行核对 这些是概要送出时的费用测算，不能将旧年费线性外推多年。实际收费还取决于份额、渠道、持续持有期和费改生效公告。');
  return text;
}
export default function Articles() {
  const all = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const cat = params.get('category') ?? '';
  const archive=params.get('archive')==='1';
  const words = normalized(q).split(/\s+/u).filter(Boolean);
  const inScope = all.filter(version => archive || version.interpretation.topic_key==='china-equity-index');
  const filtered = inScope.filter(version => {
    const article = version.article;
    const text = normalized([article.title, article.deck, article.category, ...article.sections.flatMap(section => [section.heading, ...section.paragraphs]), ...operationText(version)].join(' '));
    return (!cat || article.category === cat) && words.every(word => text.includes(word));
  }).sort((a, b) => b.as_of.localeCompare(a.as_of));
  return <main id="main" className="listing article-listing">
    <h1>{archive?'历史资料':'沪深300阅读'}</h1>{archive&&<p className="listing-deck">旧宏观文章按原日期保留，作为历史背景；不参与首页本期基金判断。</p>}
    <Form key={JSON.stringify([q, cat])} className="search-form" method="get">
      {archive&&<input type="hidden" name="archive" value="1"/>}<label htmlFor="search">找一篇文章</label>
      <div><input id="search" name="q" type="search" defaultValue={q} placeholder="标题或正文关键词" aria-describedby="search-help" />
        <select name="category" defaultValue={cat} aria-label="文章分类"><option value="">所有分类</option>{[...new Set(inScope.map(version => version.article.category))].map(category => <option key={category}>{category}</option>)}</select>
        <button type="submit">查找</button></div>
      <p id="search-help" className="search-help">搜索标题、导读和正文；多个关键词用空格分开。</p>
    </Form>
    <p className="results-count" role="status">{filtered.length}篇文章{q && ` · “${q}”`}{cat && ` · ${cat}`}</p>
    {(q || cat) && <Link className="text-link" to={archive?'/articles?archive=1':'/articles'}>清除筛选</Link>}
    {filtered.map((version, index) => <div key={version.id}>{version.article.operation_view&&!version.research&&<p className="article-history-label">历史解读</p>}<ArticleRow article={version} index={index} /></div>)}
    {!filtered.length && <p className="empty-small">没有找到相关文章，试试更短的关键词或清除分类筛选。</p>}
  </main>;
}

export function ErrorBoundary() {
  return <PageError name="文章列表" links={[{to: '/topics', label: '浏览专题 →'}, {to: '/', label: '回到今日判断 →'}]}/>;
}

