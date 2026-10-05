export type FundCostInput = {amount: number; holding_days: number};
export type FundCostSource = {
  title: string;
  published_at: string;
  compiled_at?: string;
  pdf_page: number;
  url: string;
};

/** Verified contract terms, not a claim about a channel's current execution. */
export const FUND_COST_TERMS = [
  {
    code: '007339', name: '易方达沪深300ETF联接C', annual_service_rate: 0.002,
    short_redemption_rate: 0.015, free_redemption_from_days: 7,
    sources: [
      {title: '易方达沪深300ETF联接C基金产品资料概要更新', compiled_at: '2026-08-10', published_at: '2026-08-11', pdf_page: 3,
        url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260811/%E6%98%93%E6%96%B9%E8%BE%BE%E6%B2%AA%E6%B7%B1300%E4%BA%A4%E6%98%93%E5%9E%8B%E5%BC%80%E6%94%BE%E5%BC%8F%E6%8C%87%E6%95%B0%E5%8F%91%E8%B5%B7%E5%BC%8F%E8%AF%81%E5%88%B8%E6%8A%95%E8%B5%84%E5%9F%BA%E9%87%91%E8%81%94%E6%8E%A5%E5%9F%BA%E9%87%91%EF%BC%88%E6%98%93%E6%96%B9%E8%BE%BE%E6%B2%AA%E6%B7%B1300ETF%E8%81%94%E6%8E%A5C%EF%BC%89%E5%9F%BA%E9%87%91%E4%BA%A7%E5%93%81%E8%B5%84%E6%96%99%E6%A6%82%E8%A6%81%E6%9B%B4%E6%96%B020260810205302.pdf'},
      {title: '易方达沪深300ETF联接基金2026年中期报告', published_at: '2026-08-31', pdf_page: 33,
        url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260831/%E6%98%93%E6%96%B9%E8%BE%BE%E6%B2%AA%E6%B7%B1300%E4%BA%A4%E6%98%93%E5%9E%8B%E5%BC%80%E6%94%BE%E5%BC%8F%E6%8C%87%E6%95%B0%E5%8F%91%E8%B5%B7%E5%BC%8F%E8%AF%81%E5%88%B8%E6%8A%95%E8%B5%84%E5%9F%BA%E9%87%91%E8%81%94%E6%8E%A5%E5%9F%BA%E9%87%912026%E5%B9%B4%E4%B8%AD%E6%9C%9F%E6%8A%A5%E5%91%8A.pdf'}
    ]
  },
  {
    code: '005658', name: '华夏沪深300ETF联接C', annual_service_rate: 0.003,
    short_redemption_rate: 0.015, free_redemption_from_days: 7,
    sources: [
      {title: '华夏沪深300ETF联接C基金产品资料概要更新', compiled_at: '2026-05-28', published_at: '2026-05-29', pdf_page: 3,
        url: 'https://www.chinaamc.com/upload/resources/file/2026/05/29/cf23b2cbebf8451980704856553c4147.pdf'},
      {title: '华夏沪深300ETF联接C基金产品资料概要更新（合同费率不含优惠）', compiled_at: '2026-05-28', published_at: '2026-05-29', pdf_page: 4,
        url: 'https://www.chinaamc.com/upload/resources/file/2026/05/29/cf23b2cbebf8451980704856553c4147.pdf'},
      {title: '华夏沪深300ETF联接基金2026年中期报告', published_at: '2026-08-31', pdf_page: 38,
        url: 'https://www.chinaamc.com/upload/resources/file/2026/08/31/5bb637d64a3a45d99e4684ea96aaf2a8.pdf'}
    ]
  }
] as const;

export type FundCostEstimate = {
  code: string;
  name: string;
  annual_service_rate: number;
  redemption_rate: number;
  service_fee_yuan: number;
  redemption_fee_yuan: number;
  total_fee_yuan: number;
  actual_total_fee_yuan: null;
  sources: FundCostSource[];
};
export type FundCostComparison = {
  amount: number;
  holding_days: number;
  year_days: 365;
  basis: 'current_contract_rate_static_hypothesis';
  actual_cost_status: 'not_verified';
  long_holding: boolean;
  funds: FundCostEstimate[];
  difference: {
    direction: '005658_minus_007339';
    service_fee_yuan: number;
    redemption_fee_yuan: number;
    total_fee_yuan: number;
    actual_total_fee_yuan: null;
  };
  assumptions: string[];
  limitations: string[];
};

function cents(value: number): number {
  // Round once per displayed component, then add/subtract whole cents.
  const result = Math.round((value + Number.EPSILON * Math.abs(value)) * 100);
  if (!Number.isSafeInteger(result)) throw new RangeError('fund_cost_amount_out_of_range');
  return result;
}

/** Pure illustrative comparison; it does not read accounts, NAVs or execution notices. */
export function estimateFundCosts(input: FundCostInput): FundCostComparison {
  if (!input || typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new RangeError('fund_cost_amount_must_be_positive_finite');
  }
  if (typeof input.holding_days !== 'number' || !Number.isSafeInteger(input.holding_days) || input.holding_days <= 0) {
    throw new RangeError('fund_cost_holding_days_must_be_positive_integer');
  }
  const {amount, holding_days} = input;
  const rounded = FUND_COST_TERMS.map(term => {
    const redemption_rate = holding_days < term.free_redemption_from_days ? term.short_redemption_rate : 0;
    const service = cents(amount * term.annual_service_rate * holding_days / 365);
    const redemption = cents(amount * redemption_rate);
    const total = service + redemption;
    if (!Number.isSafeInteger(total)) throw new RangeError('fund_cost_amount_out_of_range');
    return {term, redemption_rate, service, redemption, total};
  });
  const [efund, chinaamc] = rounded;
  const long_holding = holding_days > 365;
  return {
    amount, holding_days, year_days: 365,
    basis: 'current_contract_rate_static_hypothesis', actual_cost_status: 'not_verified', long_holding,
    funds: rounded.map(({term, redemption_rate, service, redemption, total}) => ({
      code: term.code, name: term.name, annual_service_rate: term.annual_service_rate, redemption_rate,
      service_fee_yuan: service / 100, redemption_fee_yuan: redemption / 100, total_fee_yuan: total / 100,
      actual_total_fee_yuan: null, sources: term.sources.map(source => ({...source}))
    })),
    difference: {
      direction: '005658_minus_007339',
      service_fee_yuan: (chinaamc.service - efund.service) / 100,
      redemption_fee_yuan: (chinaamc.redemption - efund.redemption) / 100,
      total_fee_yuan: (chinaamc.total - efund.total) / 100,
      actual_total_fee_yuan: null
    },
    assumptions: [
      '仅按已读原文的销售服务合同费率与赎回费率作静态假设估算，金额单位为人民币元；持仓价值及赎回金额均假设保持输入金额不变。',
      '按365日年估算；原文实际日计提公式为前一日C类基金资产净值×年费率÷当年天数，跨闰年需按实际日期分段。',
      '持有天数须为已确认的持有自然日数；已读原文未核实申购、赎回确认起止及是否包含起止日，不能直接以申请日间隔代替。',
      '各基金分项四舍五入至分，再相加得到合计；差值按两只基金已显示的分额相减，方向为华夏005658减易方达007339。'
    ],
    limitations: [
      '只估算销售服务费和赎回费，未包含管理费、托管费、交易费用、税负及其他费用，不代表全部实际成本或收益差。',
      '销售服务费从基金资产每日计提，已反映在净值中；不得从已扣费净值或净值收益中重复扣减本估算。',
      '2026费改的两基金具体实施日、直销与代销渠道、优惠、存量份额及停止计提安排尚未核实；华夏概要明确合同销售服务费率不含优惠。实际金额及实际差值未知。',
      '新规对非豁免份额持续持有超过一年停止收取销售服务费，并有2026年存量调整安排；一年并不恒等于365日，不能据本输入认定实际停止计提日。',
      ...(long_holding ? ['持有超过365日：未来适用费率及超过一年的停止计提安排未知，以上数值仅为全程沿用所列当前合同费率的假设演算，不能作为未来确定总额、长期省费承诺或工具推荐。'] : [])
    ]
  };
}
