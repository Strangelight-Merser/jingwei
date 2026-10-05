import type { FinanceVersion, SourceRef } from '../packages/contracts/types.ts';

const index: SourceRef = {
  article_id: 'csi300-guide-index-factsheet-20260831', revision: 1,
  source: '中证指数 · 沪深300指数单张',
  published_at: '', data_as_of: '2026-08-31', checked_at: '2026-10-03',
  url: 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/000300factsheet.pdf',
  fragments: ['该单张标注2026年8月31日。沪深300从沪深市场选取300只规模较大、流动性较好的代表性证券，用于反映这些上市公司证券的整体表现。本篇只引用指数定义，不引用单张的估值、权重或收益数字。'],
};
const efundC: SourceRef = {
  article_id: 'csi300-guide-efund-c-summary-20260811', revision: 1,
  source: '易方达基金 · 沪深300ETF联接C产品资料概要',
  published_at: '2026-08-11', checked_at: '2026-10-03',
  url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260811/易方达沪深300交易型开放式指数发起式证券投资基金联接基金（易方达沪深300ETF联接C）基金产品资料概要更新20260810205302.pdf',
  fragments: ['概要2026年8月10日编制、8月11日送出，C类代码007339。标的指数为沪深300，主要通过投资目标ETF跟踪业绩比较基准。', '所列日期的C类条款不收申购费，持有期间计提销售服务费，赎回费用与持有期限有关；概要同时说明资料可能滞后，需要结合临时公告阅读。'],
};
const efundA: SourceRef = {
  article_id: 'csi300-guide-efund-a-summary-20260811', revision: 1,
  source: '易方达基金 · 沪深300ETF联接A产品资料概要',
  published_at: '2026-08-11', checked_at: '2026-10-03',
  url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260811/易方达沪深300交易型开放式指数发起式证券投资基金联接基金（易方达沪深300ETF联接A）基金产品资料概要更新.pdf',
  fragments: ['概要2026年8月10日编制、8月11日送出，A类代码110020。A、C属于同一联接基金的份额类别。A类列有申购费和按持有期限区分的赎回费；运作费用表未列销售服务费。这里不把普通费率等同于特定渠道的实付费用。'],
};
const china: SourceRef = {
  article_id: 'csi300-guide-chinaamc-prospectus-20260529', revision: 1,
  source: '华夏基金 · 沪深300ETF联接招募说明书',
  published_at: '2026-05-29', checked_at: '2026-10-03',
  url: 'https://www.chinaamc.com/upload/resources/file/2026/05/29/a87a41e0ec074fa1bb88aed07257bdba.pdf',
  fragments: ['招募说明书2026年5月29日公告。释义说明联接基金主要投资于跟踪同一标的指数的目标ETF；本基金通过投资华夏沪深300ETF跟踪沪深300。', 'A类与C类分别适用收费条款：A类列有申购费用、不收销售服务费；C类不收申购费、从基金资产中计提销售服务费，赎回费用按持有期限区分。费用条款不代表新资金的优先选择，也不承诺当前渠道费用。'],
};
const pe: SourceRef = {
  article_id: 'csi300-guide-sec-pe-definition', revision: 1,
  source: '美国证监会 · Investor.gov市盈率解释',
  published_at: '', checked_at: '2026-10-03',
  url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/price-earnings-pe-ratio',
  fragments: ['概念译述：市盈率将价格与每股盈利比较，页面的过去12个月盈利口径对应滚动市盈率。页面未标注本次所用内容的发布日期。本篇用它解释概念，不据此推断中证指数的具体汇总或亏损样本处理方法。'],
};
const multiples: SourceRef = {
  article_id: 'csi300-guide-cfa-valuation-multiples-2026', revision: 1,
  source: 'CFA协会 · 2026课程估值倍数说明',
  published_at: '', checked_at: '2026-10-03',
  url: 'https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples',
  fragments: ['概念译述：PE将价格与盈利比较，PB将价格与账面价值比较；账面价值以普通股股东权益为基础。倍数比较需要考虑盈利、账面价值与可比基准，不能从单个倍数直接推出未来收益。网页标明2026课程，未标注发布日期。'],
};

const refs = [index, efundC, efundA, china, pe, multiples];

// Unpublished editorial template. Publication time and content hash are assigned by the publisher.
export const CSI300_READING_GUIDE: FinanceVersion = {
  id: 'fv-csi300-reading-guide-editorial-1',
  story_id: 'csi300-reading-guide', previous_version_id: null, version: 1,
  // Latest dated source document, not the drafting date or a current market observation.
  as_of: '2026-08-31', generated_at: '2026-10-03T14:36:59Z',
  input_hash: '', input_refs: refs, origin: 'editor', published_at: null,
  article: {
    slug: 'csi300-etf-and-share-classes',
    title: '沪深300、ETF联接、A/C：先分清买的是什么',
    deck: '指数、联接基金和A/C份额讲的是不同层次。先看市场方向，再看基金怎样跟踪它、费用在哪里产生，最后再读具体的研究判断。',
    category: '背景解释', kind: 'background', read_minutes: 3,
    sections: [
      {
        heading: '沪深300，观察一组证券的整体表现',
        paragraphs: ['沪深300是一个指数。它从上海和深圳市场选取300只规模较大、流动性较好的代表性证券，把它们的表现汇成一个数。看它，可以观察这组证券的整体变化；它不等于某一家公司的股价，也不能代表每一家企业。指数本身不是你账户里的基金，名字里有“沪深300”的基金，才是实际投资工具。'],
        refs: [index.article_id],
      },
      {
        heading: 'ETF联接，通过目标ETF跟随指数',
        paragraphs: ['沪深300ETF以跟踪沪深300为目标。ETF联接基金则主要通过持有对应的目标ETF来跟随这一指数。你申购的是联接基金份额，不是直接买入那300只证券，也不是直接买入目标ETF份额。联接基金还需要管理现金和承担运作费用，所以基金的涨跌与指数之间可能有差异；跟踪同一个指数，也不意味着每只基金每天涨跌完全一样。'],
        refs: [china.article_id, efundC.article_id],
      },
      {
        heading: '买两只基金，未必多分散一个方向',
        paragraphs: ['易方达007339和华夏005658都承接沪深300方向。名字、管理人和费用不同，但同时持有它们，没有新增一个不同的指数方向，仍会一起受到这组证券变化的影响。这是根据两份文件里的跟踪目标作出的比较。选择哪种工具，主要核对费用、跟踪表现和申赎条件；不能把工具差异当成市场已经更值得买的理由。'],
        refs: [efundC.article_id, china.article_id],
      },
      {
        heading: 'A和C，区别先看收费方式',
        paragraphs: ['A、C是同一只基金的不同份额类别，不是新的市场方向。以这里引用的产品资料为例，A类列有申购费，不收销售服务费；C类申购费为零，但列有销售服务费，卖出时还可能有赎回费。因此，买入那一笔费用为零，不等于持有全过程免费。比较时要把买入、持有和卖出的费用一起看，并核对所选份额、渠道及适用期间的实际规则。本专题保留原文日期；费改生效、存量衔接和渠道优惠仍须核清，不能仅按“长期选A、短期选C”决定。'],
        refs: [efundA.article_id, efundC.article_id, china.article_id],
      },
      {
        heading: 'PE和PB是倍数，不是收益率',
        paragraphs: ['PE是市盈率，看价格相对于盈利；滚动PE参考最近12个月的盈利。PB是市净率，看价格相对于账面净资产。这两个数帮助讨论估值，不表示买入后的收益率，也不承诺几年能回本。倍数会随价格、盈利或净资产变化；比另一个时点低，还不足以说明处在历史低位。读本专题的估值图时，先看资料日期，再把倍数与盈利依据放在一起读，不把图上的一个数字当成买入信号。'],
        refs: [pe.article_id, multiples.article_id],
      },
      {
        heading: '分清这些，再读持仓和新资金的判断',
        paragraphs: ['读到“按原计划维护”，先留意它对已有持仓写了哪些适用条件；读到“先观察”，再看临时首次买入或追加为什么需要等待、哪些材料会改变判断。基金费用表回答工具怎么比较，不能单独回答市场该不该买。这篇背景文先帮助你看懂买的是什么，没有给出首次配置的金额、买入时机或持有安排；也不能替代这些尚未完成的决定。'],
        refs: [china.article_id],
      },
    ],
  },
  interpretation: {
    topic_key: 'china-equity-index', claim_key: 'csi300-index-and-fund-basics',
    claim: '沪深300是指数方向，ETF联接是跟踪该方向的基金工具，A/C是同基金的收费份额类别；同方向工具不增加新的指数方向，估值倍数不等于收益率。本篇不提供首次配置方案或候选基金排序。',
    evidence_ids: refs.map(ref => ref.article_id),
    mechanism: ['联接基金主要通过目标ETF跟踪同一指数', '同基金不同份额的收费方式影响持有成本，不能改变其市场方向'],
    conditions: ['费用按原文日期记录，实际执行须核对渠道、适用期间与实施公告', '估值概念解释不推断中证具体汇总口径，也不替代盈利依据'],
    alternatives: [], related_story_ids: ['csi300-fund-selection-20261002'], previous_claim_version_ids: [],
  },
  changes: { kind: 'initial', summary: '依据公开资料编辑指数、联接基金、收费份额与估值概念背景。', evidence_ids: refs.map(ref => ref.article_id) },
};
