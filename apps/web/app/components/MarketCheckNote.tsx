import type {MarketCheck} from '../../../../packages/backend/market-availability.ts';
import {date} from '../lib/format.ts';

export function MarketCheckNote({check}:{check:MarketCheck|null|undefined}){
 if(!check)return null;
 return <div className="market-check-note">
  <small>最近一次市场核查 · <time dateTime={check.checked_at}>{date(check.checked_at)}</time>{check.observation_as_of&&<> · 所核资料 {date(check.observation_as_of)}</>}</small>
  <p>{check.status==='no_change'?'估值倍数与去年底的比较条件未变，沿用本文判断。此次只核对市场数值，盈利和需求仍需另行复核。':check.message}</p>
 </div>;
}
