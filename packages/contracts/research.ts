import type {SourceRef} from './types.ts';
import type {FundSnapshot} from '../backend/fund-updates.ts';
import type {MarketSnapshot} from '../backend/market-sources.ts';

/** Public research only: a direction under coverage is not a ranking of directions. */
export type FundNavSeries = {code:string;nav:{date:string;nav:number;accumulated_nav?:number}[];ref:SourceRef};
export type ReportFact<T> = {value:T;fragment_index:number};
export type FundDocumentBody = {
 kind:'interim'|'summary';read_scope:'full_text';pdf_url:string;pdf_sha256:string;text_sha256:string;
 page_count:number;fragment_pages:number[][];share_class:'C';
 period?:{start:string;end:string};
 facts:{benchmark?:ReportFact<string>;period_return_pct?:ReportFact<number>;benchmark_return_pct?:ReportFact<number>;
 annual_tracking_error_pct?:ReportFact<number>&{scope:'fund'|'C'};
 management_pct?:ReportFact<number>;custody_pct?:ReportFact<number>;service_pct?:ReportFact<number>;
 redemption_terms?:ReportFact<string>;fee_exclusion?:ReportFact<string>;published_operating_rate_pct?:ReportFact<number>};
};
export type FundResearchDocument = {code:string;title:string;url:string;published_at:string;ref:SourceRef;status:'discovered'|'read';body?:FundDocumentBody;body_error?:string};
/** Separate feasibility evidence; observing another index does not establish a preferred direction. */
export type OtherDirectionEvidence={direction_key:string;index_code:string;index_name:string;as_of:string;checked_at:string;close:number;pe_ttm:number;pb:number;dividend_yield_pct:number;daily:{date:string;close:number}[];ref:SourceRef;coverage:'price_and_valuation_only'};
/** Result of the public valuation rule, carried as evidence; the stances are fixed by the rule, not the model. */
export type ValuationRuleEvidence = {
 rule_id:string;rule_name:string;as_of:string;pe_ttm:number;percentile:number;window_start:string;
 band:'low'|'mid'|'high'|'extreme';band_label:string;
 new_money:{stance:ResearchStance;title:string;text:string};held:{stance:ResearchStance;title:string;text:string};
 boundaries:{low:number;high:number;extreme:number};last_change:{date:string;from_label:string|null};ref:SourceRef;
 /** Readings needed to confirm a change and what one reading is (absent on records saved before more indices). */
 confirm?:{count:number;unit:string};source_label?:string;
};
export type ResearchSnapshot = {valuation_rule?:ValuationRuleEvidence;direction_key:'csi300';captured_at:string;evidence_observed_at?:string;refs:SourceRef[];funds:FundSnapshot[];market:MarketSnapshot|null;errors:string[];evidence_hash:string;fund_series?:FundNavSeries[];documents?:FundResearchDocument[];other_directions?:OtherDirectionEvidence[]};
export type ResearchScope = 'direction'|'comparison'|'new_money'|'held'|'sell';
export type ResearchStance = 'conditional_add'|'maintain_plan'|'conditional_reduce'|'observe'|'not_assessable';
export type ResearchConditionCheck = 'valuation_band'|'market_available'|'market_changed'|'fee_comparison_available'|'trade_status_verified'|'trade_restriction'|'fee_terms_changed'|'fund_facts_changed'|'fee_scope_verified'|'tracking_available'|'document_body_read'|'user_plan_known';
export type ResearchBinding = {article_id:string;fragment_index:number};
export type ResearchCondition = {key:string;label:string;scope:ResearchScope;check:ResearchConditionCheck;status:'triggered'|'not_triggered'|'not_assessable';explanation:string;refs:ResearchBinding[];rule?:{metric:string;operator:'gt'|'gte'|'lt'|'lte'|'eq';value:number}};
export type ResearchPosition = {stance:ResearchStance;summary:string;conditions:string[];refs:string[]};
export type ResearchDecision = {
 evaluated_at:string;evidence_hash:string;data_status:'sufficient'|'partial'|'insufficient';
 coverage:{direction_key:'csi300';label:string;direction_selection_supported:false;fund_codes:string[]};
 direction:{summary:string;why:string[];refs:string[]};
 candidates:{code:string;summary:string;differences:string[];refs:string[]}[];
 new_money:ResearchPosition;held:ResearchPosition;conditions:ResearchCondition[];
 impact_scope:ResearchScope[];limitations:string[];
};
export type ResearchMetric = {key:string;label:string;value:number;unit:string;as_of:string;refs:string[]};
export type ResearchEvaluation = {
 data_status:'sufficient'|'partial'|'insufficient';
 evaluability:Record<ResearchScope,{status:'assessable'|'partial'|'not_assessable';reason:string;refs:string[]}>;
 metrics:ResearchMetric[];
 checks:Record<ResearchConditionCheck,{status:ResearchCondition['status'];explanation:string;refs:ResearchBinding[]}>;
 limitations:string[];
};
