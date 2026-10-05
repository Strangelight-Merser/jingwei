"""Read-only CSI 500 availability probe; does not extend product coverage."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
from urllib.parse import urlencode
import concurrent.futures,hashlib,json,requests
out=Path('evidence/fund-document-bodies-20261005/other-direction');out.mkdir(exist_ok=True)
base='https://www.csindex.com.cn/csindex-home';end=datetime.now(timezone.utc)+timedelta(hours=8);query=urlencode({'indexCode':'000905','startDate':(end-timedelta(days=60)).strftime('%Y%m%d'),'endDate':end.strftime('%Y%m%d')})
urls={'valuation':base+'/data-service/indexValuation','daily':base+'/perf/index-perf?'+query,'daily_valuation':base+'/perf/indexCsiDsPe?'+query}
def read(pair):
 kind,url=pair
 try:
  r=requests.get(url,timeout=(8,20),headers={'User-Agent':'Mozilla/5.0 JingweiResearch/0.1'});r.raise_for_status();data=r.content;sha=hashlib.sha256(data).hexdigest();(out/(sha+'.json')).write_bytes(data);p=r.json();assert p.get('code')=='200';return kind,{'url':url,'http':r.status_code,'file':sha+'.json','sha256':sha,'data':p['data']}
 except Exception as e:return kind,{'url':url,'error':str(e)}
results=dict(concurrent.futures.ThreadPoolExecutor(max_workers=3).map(read,urls.items()));report={'checked_at':datetime.now(timezone.utc).isoformat(),'index_code':'000905','index_name':'中证500','sources':{k:{q:v for q,v in r.items() if q!='data'} for k,r in results.items()},'product_coverage_changed':False,'no_fund_comparison_or_investment_selection_claim':True}
try:
 val=[r for r in results['valuation']['data']['indexValuations'] if r.get('indexName')=='中证500' and r.get('indexNameEn')=='CSI 500'];assert len(val)==1;v=val[0];daily=results['daily']['data'];pe=results['daily_valuation']['data'];assert isinstance(daily,list) and len(daily)>0 and isinstance(pe,list) and len(pe)>0
 assert all(r['indexCode']=='000905' for r in daily);assert all(r['indexName']=='中证500' and r['indexNameEn']=='CSI 500' for r in pe)
 dates={r['tradeDate']:r for r in daily};assert len(dates)==len(daily);ps={r['tradeDate']:r for r in pe};assert len(ps)==len(pe)
 for d,r in dates.items():assert d in ps and r['peg']==ps[d]['peg'];assert all(isinstance(r[k],(int,float)) and r[k]>0 for k in ['open','high','low','close','peg']);assert r['low']<=min(r['open'],r['close'])<=max(r['open'],r['close'])<=r['high']
 latest=sorted(dates)[-1];assert latest==v['tradeDate']==results['valuation']['data']['tradeDate'];assert dates[latest]['peg']==v['peg'];assert latest<=end.strftime('%Y%m%d')
 report.update({'status':'same_api_price_and_valuation_available','as_of':latest,'daily_rows':len(daily),'aligned_rows':len(dates),'latest':{'close':dates[latest]['close'],'pe_ttm':v['peg'],'pb':v['pb'],'dividend_yield_pct':v['dp']},'coverage_gaps':['仅核查价格指数、同日期估值及短期历史；没有基金正文、长期盈利或跨方向选择模型。','价格指数不含分红，估值不是历史分位，未形成方向优劣或买卖结论。']})
except Exception as e:report.update({'status':'incomplete','error':str(e)})
(out/'probe.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
