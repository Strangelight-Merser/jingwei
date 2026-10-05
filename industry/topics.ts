export const TOPICS = [
 {key:'china-equity-index',title:'沪深300配置观察',label:'基金操作',active:true,terms:['沪深300','007339','005658','ETF联接','跟踪误差'],claim_key:'csi300-operation-and-fund-choice',current:'已有持仓维持，新增临时开仓观察；计划内C类新资金优先比较持有成本。',background:'两只联接基金跟踪同一市场方向。费用、跟踪质量与买卖条件影响工具选择，指数估值和盈利才影响择时判断。'},
 { key:'rate-transmission',title:'贷款利率与月供',label:'货币政策',active:true,terms:['LPR','贷款','融资','利率','重定价'],claim_key:'financing-cost-transmission',current:'5月LPR下调10个基点，6月维持不变。实际贷款成本的变化取决于银行报价、加点和合同重定价。',background:'LPR是贷款定价的参考基准。银行加点和合同重定价，决定实际贷款利率何时、怎样调整。' },
 { key:'domestic-demand',title:'消费与投资',label:'宏观经济',active:true,terms:['消费','GDP','投资','内需','零售'],claim_key:'demand-recovery',current:'2025年GDP按不变价格计算增长5.0%，消费与投资表现存在差异。比较各项增速时，需保持价格口径和覆盖范围一致。',background:'GDP、社会消费品零售总额和固定资产投资分别反映经济总量、消费与投资的变化。不同指标的范围和价格口径需分别说明。' },
 { key:'global-rates',title:'美联储利率观察',label:'海外观察',active:true,terms:['Federal','FOMC','美联储','就业','通胀','rate','inflation','employment'],claim_key:'fed-balance-of-risks',current:'2026年9月美联储加息25个基点，声明强调价格稳定。后续利率调整仍取决于通胀和就业数据。',background:'联邦基金利率目标区间、资产负债表和市场预期，共同影响美国货币政策。每次决定保留当时的日期与依据。' }
] as const;
