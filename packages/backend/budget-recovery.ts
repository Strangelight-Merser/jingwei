import type {BudgetLedger} from '../contracts/types.ts';
type KnownLedger=BudgetLedger&{recovery_note?:string;recovery_source_ledger_ids?:string[]};
/** Merge only reconciled, non-secret receipts. Preserve the owner's existing grant. */
export function mergeKnownBudgetHistory(current:KnownLedger,history:KnownLedger):KnownLedger{
 const sum=(ledger:KnownLedger)=>ledger.reservations.reduce((n,r)=>n+r.amount_micro_cny,0);
 for(const ledger of [current,history])if(!Number.isSafeInteger(ledger.reserved_micro_cny)||ledger.reserved_micro_cny!==sum(ledger)||ledger.reservations.some(r=>!Number.isSafeInteger(r.amount_micro_cny)||r.amount_micro_cny<=0))throw new Error('budget_history_reconciliation_required');
 const result=structuredClone(current),records=new Map(result.reservations.map(r=>[r.id,r]));
 for(const receipt of history.reservations){const known=records.get(receipt.id);if(known){if(known.amount_micro_cny!==receipt.amount_micro_cny||known.task_id!==receipt.task_id)throw new Error('budget_history_conflict');}else records.set(receipt.id,structuredClone(receipt));}
 result.reservations=[...records.values()];result.reserved_micro_cny=sum(result);
 result.limit_micro_cny=Math.min(current.limit_micro_cny,history.limit_micro_cny);
 if(result.reserved_micro_cny>result.limit_micro_cny)throw new Error('budget_history_exceeds_limit');
 result.recovery_note=history.recovery_note??current.recovery_note;
 result.recovery_source_ledger_ids=[...new Set([...(current.recovery_source_ledger_ids??[]),history.id])];
 return result;
}
