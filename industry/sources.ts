export type Source={id:string;name:string;kind:'rss'|'web_list'|'fund_pages'|'market_api';url:string;host:string;body_selector:string;link_pattern?:RegExp};
export const SOURCES:Source[]=[
 {id:'csi300-market',name:'沪深300中证官方行情与估值',kind:'market_api',url:'https://www.csindex.com.cn/csindex-home/data-service/indexValuation',host:'www.csindex.com.cn',body_selector:''},
 {id:'csi300-products',name:'沪深300候选基金官方字段',kind:'fund_pages',url:'https://www.efunds.com.cn/fund/007339.shtml',host:'www.efunds.com.cn',body_selector:'.table_feilv'},
 {id:'fed-monetary',name:'美联储货币政策声明',kind:'rss',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',host:'www.federalreserve.gov',body_selector:'#article'},
 {id:'nbs-release',name:'国家统计局数据发布',kind:'web_list',url:'https://www.stats.gov.cn/sj/zxfb/',host:'www.stats.gov.cn',body_selector:'.TRS_Editor',link_pattern:/\/t\d{8}_\d+\.html$/}
];
