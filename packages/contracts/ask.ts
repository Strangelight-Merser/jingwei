import type {ResearchStance} from './research.ts';

export type AskFragment = {id:number; text:string};
export type AskPreview = {
 question:string; quote:string; estimate_micro_cny:number; model:string;
 ready:boolean; message:string; fragments:AskFragment[];
};
export type AskRecord = {
 id:string; question:string; answer:string; cites:AskFragment[]; stance:ResearchStance;
 model:string; at:string; status:'answered'|'rejected'|'unavailable';
 estimate_micro_cny:number; reserved_micro_cny:number;
};
export type AskResult = {record:AskRecord; message:string};
