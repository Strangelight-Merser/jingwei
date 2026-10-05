import type { FinanceVersion } from '../contracts/types.ts';
import type { State } from './storage.ts';

export type MarketAvailability = {
 status: 'check_failed';
 data_as_of: string;
 checked_at: string;
 message: string;
};

export type MarketCheck = {
 status:'no_change'|'failed'|'pending_review';
 scope:'valuation_comparison';
 checked_at:string;
 observation_as_of:string|null;
 published_data_as_of:string;
 message:string;
};

/** A source check is separate from an editorial judgment and never rewrites its evidence. */
export function marketCheck(state:State,version:FinanceVersion):MarketCheck|null {
 const published=version.article.operation_view?.market;
 if(!published)return null;
 const latest=state.collection_runs
  .map((run,position)=>({run,position,source:run.sources.find(source=>source.source==='csi300-market')}))
  .filter(entry=>entry.source&&Number.isFinite(Date.parse(entry.run.finished_at)))
  .sort((a,b)=>Date.parse(b.run.finished_at)-Date.parse(a.run.finished_at)||b.position-a.position)[0];
 if(!latest?.source)return null;
 const base={scope:'valuation_comparison' as const,checked_at:latest.run.finished_at,published_data_as_of:published.as_of};
 if(latest.source.errors.length)return {...base,status:'failed',observation_as_of:null,message:'本次市场资料核查未完成，保留已刊资料与判断，等待复核。'};
 const start=Date.parse(latest.run.started_at),end=Date.parse(latest.run.finished_at);
 const observation=(state.market_observations??[])
  .filter(item=>item.index_code==='000300')
  .sort((a,b)=>Date.parse(b.checked_at)-Date.parse(a.checked_at))[0];
 // Older same-hash collection records can retain the old observation timestamp. A successful run
 // alone is insufficient to claim that that stored snapshot was checked this time.
 if(!observation||!Number.isFinite(start)||Date.parse(observation.checked_at)<start||Date.parse(observation.checked_at)>end||!Number.isFinite(Date.parse(observation.checked_at)))return null;
 if(observation.as_of<published.as_of)return null;
 const values=[observation.valuation.pe_ttm,observation.valuation.pb,observation.valuation.prior_year_end.pe_ttm,observation.valuation.prior_year_end.pb,published.pe_ttm,published.pb,published.previous_year_end.pe_ttm,published.previous_year_end.pb];
 if(values.some(value=>!Number.isFinite(value)||value<=0))return null;
 const boundary=(pe:number,pb:number,priorPe:number,priorPb:number)=>pe<priorPe&&pb<priorPb;
 const sameCondition=boundary(observation.valuation.pe_ttm,observation.valuation.pb,observation.valuation.prior_year_end.pe_ttm,observation.valuation.prior_year_end.pb)===boundary(published.pe_ttm,published.pb,published.previous_year_end.pe_ttm,published.previous_year_end.pb);
 const pending=state.finance_versions.some(item=>item.story_id===version.story_id&&!item.published_at&&item.previous_version_id===version.id&&item.review?.status==='pending'&&Boolean(item.review.condition_changes?.length));
 if(pending||!sameCondition)return {...base,status:'pending_review',observation_as_of:observation.as_of,message:'相关估值事实条件待复核，已刊判断仍保留，尚未形成新的操作结论。'};
 return {...base,status:'no_change',observation_as_of:observation.as_of,message:'本次核查未发现本文PE、PB与同源去年底的比较条件发生变化；已刊判断保留，仍按本文改判条件复核。'};
}

/** Collection failure is a fact notice, not a new investment judgment or calendar-based expiry. */
export function marketAvailability(state: State, version: FinanceVersion, _now?: string): MarketAvailability | null {
 const data_as_of = version.article.operation_view?.market?.as_of;
 if (!data_as_of) return null;
 const latest = state.collection_runs
  .map((run, position) => ({ run, position, source: run.sources.find(source => source.source === 'csi300-market') }))
  .filter(entry => entry.source)
  .sort((a, b) => Date.parse(b.run.finished_at) - Date.parse(a.run.finished_at) || b.position - a.position)[0];
 if (!latest?.source?.errors.length) return null;
 return {
  status: 'check_failed', data_as_of, checked_at: latest.run.finished_at,
  message: `最近一次资料核查未完成，仍展示${data_as_of}已核实资料；原判断保留，等待复核。`,
 };
}
