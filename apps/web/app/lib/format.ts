import { SOURCES } from '../../../../industry/sources.ts';
import type {SourceRef} from '../../../../packages/contracts/types.ts';
export function date(s:string){return s.slice(0,10).replaceAll('-','.');}
export function sourceDates(ref:SourceRef){return [ref.published_at?`发布于 ${date(ref.published_at)}`:'发布日期未标注',ref.checked_at?`核查于 ${date(ref.checked_at)}`:'',ref.data_as_of?`数据截至 ${date(ref.data_as_of)}`:''].filter(Boolean).join(' · ');}
export function sourceName(s:string){return SOURCES.find(source=>source.id===s)?.name??s;}

/** Display public numeric facts with no more than two decimal places. */
export function number(value:number){return value.toLocaleString('zh-CN',{maximumFractionDigits:2});}
